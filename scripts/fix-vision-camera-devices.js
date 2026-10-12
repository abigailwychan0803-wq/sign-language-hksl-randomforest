/**
 * VisionCamera 4.7.x Android: ProcessCameraProvider init is async, so
 * getConstants()/initialize() often see an empty device list. Emitting from
 * the constructor's init{} also fails (getJSModule before React is ready).
 *
 * Fix: keep early async init, but only emit CameraDevicesChanged from
 * initialize() after awaiting that work — see #3575, #3586, #3623, #3704.
 *
 * Runs on every `npm install` (postinstall) and again during prebuild.
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'camera-signs: await-init-then-emit';
const TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-vision-camera',
  'android',
  'src',
  'main',
  'java',
  'com',
  'mrousavy',
  'camera',
  'react',
  'CameraDevicesManager.kt',
);

const PATCHED_BLOCK = `  private var cameraProvider: ProcessCameraProvider? = null
  private var extensionsManager: ExtensionsManager? = null
  // ${MARKER}
  private val initialization = CompletableDeferred<Unit>()

  private val callback = object : CameraManager.AvailabilityCallback() {
    private var deviceIds = cameraManager.cameraIdList.toMutableList()

    // Check if device is still physically connected (even if onCameraUnavailable() is called)
    private fun isDeviceConnected(cameraId: String): Boolean =
      try {
        cameraManager.getCameraCharacteristics(cameraId)
        true
      } catch (_: Throwable) {
        false
      }

    override fun onCameraAvailable(cameraId: String) {
      Log.i(TAG, "Camera #$cameraId is now available.")
      if (!deviceIds.contains(cameraId)) {
        deviceIds.add(cameraId)
        sendAvailableDevicesChangedEvent()
      }
    }

    override fun onCameraUnavailable(cameraId: String) {
      Log.i(TAG, "Camera #$cameraId is now unavailable.")
      if (deviceIds.contains(cameraId) && !isDeviceConnected(cameraId)) {
        deviceIds.remove(cameraId)
        sendAvailableDevicesChangedEvent()
      }
    }
  }

  override fun getName(): String = TAG

  // Start cameraProvider + ExtensionsManager as early as possible.
  init {
    coroutineScope.launch {
      try {
        Log.i(TAG, "Initializing ProcessCameraProvider...")
        cameraProvider = ProcessCameraProvider.getInstance(reactContext).await(executor)
        Log.i(TAG, "Initializing ExtensionsManager...")
        extensionsManager = ExtensionsManager.getInstanceAsync(reactContext, cameraProvider!!).await(executor)
        Log.i(TAG, "Successfully initialized!")
      } catch (error: Throwable) {
        Log.e(TAG, "Failed to initialize ProcessCameraProvider/ExtensionsManager! Error: \${error.message}", error)
      } finally {
        initialization.complete(Unit)
      }
    }
  }

  // Note: initialize() will be called after getConstants on new arch!
  override fun initialize() {
    super.initialize()
    cameraManager.registerAvailabilityCallback(callback, null)
    coroutineScope.launch {
      initialization.await()
      sendAvailableDevicesChangedEvent()
    }
  }`;

function patch() {
  if (!fs.existsSync(TARGET)) {
    console.warn('[fix-vision-camera-devices] CameraDevicesManager.kt not found; skip.');
    return;
  }

  let contents = fs.readFileSync(TARGET, 'utf8');
  if (contents.includes(MARKER)) {
    return;
  }

  if (!contents.includes('import kotlinx.coroutines.launch')) {
    console.warn('[fix-vision-camera-devices] Unexpected CameraDevicesManager.kt; skip.');
    return;
  }

  if (!contents.includes('import kotlinx.coroutines.CompletableDeferred')) {
    contents = contents.replace(
      'import kotlinx.coroutines.launch',
      'import kotlinx.coroutines.CompletableDeferred\nimport kotlinx.coroutines.launch',
    );
  }

  const start = contents.indexOf('  private var cameraProvider: ProcessCameraProvider? = null');
  const endMarker = '  override fun invalidate()';
  const end = contents.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    console.warn(
      '[fix-vision-camera-devices] Could not locate init/initialize block; VisionCamera may have changed.',
    );
    return;
  }

  contents = contents.slice(0, start) + PATCHED_BLOCK + '\n\n' + contents.slice(end);
  fs.writeFileSync(TARGET, contents);
  console.log(
    '[fix-vision-camera-devices] Patched CameraDevicesManager to emit devices after awaited init.',
  );
}

patch();
