/**
 * Patches the generated HandLandmarkerPlugin.kt for performance:
 *   - GPU delegate created on the frame-processor thread (required by MediaPipe)
 *   - VIDEO tracking with IMAGE + CPU fallbacks
 *   - Face Landmarker off unless enableFace is set in app.json
 *   - Face always on CPU (avoids dual-GPU OOM/crash with Hand on GPU)
 *   - MediaPipe rotationDegrees forced to 0; JS owns upright unwrap
 *   - Compact handedness labels plus the original nested handedness payload
 *
 * Runs after expo-vision-camera-v4-mediapipe during prebuild.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function resolveMediapipeOptions(config) {
  const plugins = config.expo?.plugins ?? [];
  for (const entry of plugins) {
    const name = Array.isArray(entry) ? entry[0] : entry;
    if (typeof name === 'string' && name.includes('expo-vision-camera-v4-mediapipe')) {
      return Array.isArray(entry) ? entry[1] ?? {} : {};
    }
  }
  return {};
}

function kotlinSource(packageName, opts) {
  const numHands = opts.numHands ?? 2;
  const minDet = opts.minDetectionConfidence ?? 0.5;
  const minPres = opts.minPresenceConfidence ?? 0.5;
  const minTrack = opts.minTrackingConfidence ?? 0.5;
  const enableFace = opts.enableFace ?? false;

  const faceImport = enableFace
    ? 'import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker\n'
    : '';
  const faceFields = enableFace
    ? `    private var faceLandmarker: FaceLandmarker? = null
    private var faceRunningVideo: Boolean = false
`
    : '';
  const faceCreate = enableFace
    ? `
    /** Face always uses CPU to avoid dual-GPU crashes alongside Hand Landmarker. */
    private fun createFaceLandmarker(video: Boolean): FaceLandmarker {
        val base = BaseOptions.builder()
            .setModelAssetPath("face_landmarker.task")
            .setDelegate(Delegate.CPU)
            .build()
        val options = FaceLandmarker.FaceLandmarkerOptions.builder()
            .setBaseOptions(base)
            .setRunningMode(if (video) RunningMode.VIDEO else RunningMode.IMAGE)
            .setNumFaces(1)
            .setMinFaceDetectionConfidence(${minDet}f)
            .setMinFacePresenceConfidence(${minPres}f)
            .setMinTrackingConfidence(${minTrack}f)
            .build()
        return FaceLandmarker.createFromOptions(appContext, options)
    }

    private fun ensureFaceLandmarker(video: Boolean) {
        if (faceLandmarker != null) return
        try {
            faceLandmarker = createFaceLandmarker(video)
            faceRunningVideo = video
            Log.d(TAG, "created face landmarker cpu video=" + video)
        } catch (e: Throwable) {
            Log.w(TAG, "face create failed (hands continue): " + e.message)
            faceLandmarker = null
        }
    }
`
    : '';
  const faceEnsure = enableFace
    ? `
                ensureFaceLandmarker(video)
`
    : '';
  const faceClose = enableFace
    ? `
            try { faceLandmarker?.close() } catch (_: Exception) {}
            faceLandmarker = null
            faceRunningVideo = false
`
    : '';
  const faceFallback = enableFace
    ? `
            try {
                faceLandmarker = createFaceLandmarker(video = false)
                faceRunningVideo = false
            } catch (e: Throwable) {
                Log.w(TAG, "face CPU IMAGE fallback failed: " + e.message)
                faceLandmarker = null
            }
`
    : '';
  const faceDetect = enableFace
    ? `
            faceLandmarker?.let { fl ->
                try {
                    val faceResult = if (faceRunningVideo) {
                        fl.detectForVideo(mpImage, imageProcessingOptions, lastTimestampMs)
                    } else {
                        fl.detect(mpImage, imageProcessingOptions)
                    }
                    if (faceResult.faceLandmarks().isNotEmpty()) {
                        val mouth = faceResult.faceLandmarks()[0][13]
                        packed["mouth"] = hashMapOf(
                            "x" to mouth.x().toDouble(),
                            "y" to mouth.y().toDouble()
                        )
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "face detect failed: " + e.message)
                }
            }
`
    : '';

  return `package ${packageName}

import android.content.Context
import android.media.Image
import android.os.SystemClock
import android.util.Log
import com.google.mediapipe.framework.image.MediaImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
${faceImport}import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

/**
 * Hand Landmarker on the VisionCamera frame-processor thread.
 *
 * GPU must be created and used on that same thread. VIDEO mode is preferred for
 * tracking; IMAGE mode is the proven fallback.
 *
 * Landmarks stay in VisionCamera sensor-buffer space (rotationDegrees=0). JS owns
 * the portrait unwrap for overlay and classifier. Applying ImageProcessingOptions
 * rotation here made landmark space ambiguous and broke the skeleton overlay.
 */
class HandLandmarkerPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

    companion object {
        private const val TAG = "HandLandmarkerPlugin"
    }

    private val appContext: Context = proxy.context
    private var handLandmarker: HandLandmarker? = null
${faceFields}    private var runningVideo: Boolean = true
    private var initError: String? = null
    private var lastTimestampMs: Long = 0
    private var detectFallbackUsed: Boolean = false

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        ensureLandmarker()
        if (handLandmarker == null) {
            return hashMapOf<String, Any>(
                "hands" to emptyList<Any>(),
                "error" to (initError ?: "HandLandmarker not initialized")
            )
        }

        var mpImage: MPImage? = null
        try {
            val mediaImage: Image = frame.image
            val image = MediaImageBuilder(mediaImage).build()
            mpImage = image

            // Keep rotation at 0 so landmarks stay in VisionCamera sensor-buffer
            // space. JS owns the portrait unwrap (same path as the skeleton overlay).
            val imageProcessingOptions = ImageProcessingOptions.builder()
                .setRotationDegrees(0)
                .build()

            val result = detect(image, imageProcessingOptions)
            val packed = packResult(result)
${faceDetect.replace(/mpImage/g, 'image')}
            return packed
        } catch (e: Exception) {
            Log.e(TAG, "detect failed (video=" + runningVideo + "): " + e.message, e)
            if (!detectFallbackUsed) {
                detectFallbackUsed = true
                recreateAsCpuImage()
            }
            return hashMapOf<String, Any>(
                "hands" to emptyList<Any>(),
                "error" to (e.message ?: "Unknown error")
            )
        } finally {
            mpImage?.close()
        }
    }

    private fun ensureLandmarker() {
        if (handLandmarker != null || initError != null) return

        val attempts = arrayOf(
            Pair(true, true),
            Pair(true, false),
            Pair(false, true),
            Pair(false, false),
        )
        var lastError: Throwable? = null
        for ((gpu, video) in attempts) {
            try {
                handLandmarker = createLandmarker(gpu, video)
                runningVideo = video
${faceEnsure}
                Log.d(TAG, "created landmarker gpu=" + gpu + " video=" + video)
                return
            } catch (e: Throwable) {
                lastError = e
                Log.w(TAG, "create failed gpu=" + gpu + " video=" + video + ": " + e.message)
            }
        }
        initError = lastError?.message ?: "HandLandmarker failed to initialize"
    }

    private fun recreateAsCpuImage() {
        try { handLandmarker?.close() } catch (_: Exception) {}
        handLandmarker = null
${faceClose}
        try {
            handLandmarker = createLandmarker(gpu = false, video = false)
            runningVideo = false
            initError = null
${faceFallback}
            Log.d(TAG, "fell back to CPU IMAGE")
        } catch (e: Throwable) {
            initError = e.message
            Log.e(TAG, "CPU IMAGE fallback failed: " + e.message, e)
        }
    }

    private fun createLandmarker(gpu: Boolean, video: Boolean): HandLandmarker {
        val base = BaseOptions.builder()
            .setModelAssetPath("hand_landmarker.task")
            .setDelegate(if (gpu) Delegate.GPU else Delegate.CPU)
            .build()
        val options = HandLandmarker.HandLandmarkerOptions.builder()
            .setBaseOptions(base)
            .setRunningMode(if (video) RunningMode.VIDEO else RunningMode.IMAGE)
            .setNumHands(${numHands})
            .setMinHandDetectionConfidence(${minDet}f)
            .setMinHandPresenceConfidence(${minPres}f)
            .setMinTrackingConfidence(${minTrack}f)
            .build()
        return HandLandmarker.createFromOptions(appContext, options)
    }
${faceCreate}
    private fun detect(
        mpImage: MPImage,
        imageProcessingOptions: ImageProcessingOptions,
    ): HandLandmarkerResult {
        val landmarker = handLandmarker!!
        if (!runningVideo) {
            return landmarker.detect(mpImage, imageProcessingOptions)
        }

        var timestampMs = SystemClock.uptimeMillis()
        if (timestampMs <= lastTimestampMs) {
            timestampMs = lastTimestampMs + 1
        }
        lastTimestampMs = timestampMs

        return landmarker.detectForVideo(mpImage, imageProcessingOptions, timestampMs)
    }

    private fun packResult(result: HandLandmarkerResult): HashMap<String, Any> {
        val output = hashMapOf<String, Any>()

        val handsArray = mutableListOf<List<Map<String, Double>>>()
        for (hand in result.landmarks()) {
            val points = mutableListOf<Map<String, Double>>()
            for (landmark in hand) {
                points.add(hashMapOf(
                    "x" to landmark.x().toDouble(),
                    "y" to landmark.y().toDouble(),
                    "z" to landmark.z().toDouble()
                ))
            }
            handsArray.add(points)
        }
        output["hands"] = handsArray

        val handednessLabels = mutableListOf<String>()
        val handednessArray = mutableListOf<List<Map<String, Any>>>()
        for (categories in result.handednesses()) {
            handednessLabels.add(categories.firstOrNull()?.categoryName() ?: "")
            val categoryList = mutableListOf<Map<String, Any>>()
            for (category in categories) {
                categoryList.add(hashMapOf(
                    "categoryName" to (category.categoryName() ?: "Unknown") as Any,
                    "score" to category.score().toDouble() as Any
                ))
            }
            handednessArray.add(categoryList)
        }
        output["handednessLabels"] = handednessLabels
        output["handedness"] = handednessArray
        return output
    }
}
`;
}

const withAndroidHandLandmarkerPerformance = (config) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const { platformProjectRoot } = config.modRequest;
      const opts = resolveMediapipeOptions(config);
      const packageName = config.android?.package;
      if (!packageName) {
        console.warn('[with-android-hand-landmarker-performance] android.package missing, skipping');
        return config;
      }

      const dest = path.join(
        platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.'),
        'HandLandmarkerPlugin.kt',
      );

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, kotlinSource(packageName, opts));
      return config;
    },
  ]);

module.exports = withAndroidHandLandmarkerPerformance;
