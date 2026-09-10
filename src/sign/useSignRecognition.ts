/**
 * Orchestrates the real-time sign-recognition pipeline:
 *   frame processor (worklet) -> minimal payload -> JS feature engineering ->
 *   ONNX inference + gating -> a single SignDetection for the overlay.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { runAtTargetFps, useFrameProcessor } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';

import { SignClassifier, detectionFor } from './classifier';
import { SIGN_CONFIG } from './config';
import { buildFrameFeatures } from './featureEngineering';
import { detectHandLandmarks, isHandLandmarkerAvailable } from './handLandmarks';
import type { SignModelId } from './models';
import type { FramePayload, HandDetectionResult, SignDetection } from './types';

/** Target detection rate; native VIDEO tracking keeps up better than IMAGE mode. */
const TARGET_FPS = 15;

const LANDMARKS_PER_HAND = 21;
const COORDS_PER_LANDMARK = 3;
const FLOATS_PER_HAND = LANDMARKS_PER_HAND * COORDS_PER_LANDMARK;

function packHands(result: HandDetectionResult): { hands: number[][]; handedness: string[] } {
  'worklet';
  const rawHands = result.hands ?? [];
  const labels = result.handednessLabels;
  const handedness: string[] = [];
  const hands: number[][] = [];

  const count = Math.min(rawHands.length, 2);
  for (let i = 0; i < count; i++) {
    const lm = rawHands[i];
    if (lm == null) continue;

    if (lm.length < LANDMARKS_PER_HAND) continue;

    const flat = new Array<number>(FLOATS_PER_HAND);
    let valid = true;
    for (let j = 0; j < LANDMARKS_PER_HAND; j++) {
      const p = lm[j];
      if (p == null) {
        valid = false;
        break;
      }
      const o = j * COORDS_PER_LANDMARK;
      flat[o] = p.x;
      flat[o + 1] = p.y;
      flat[o + 2] = p.z;
    }
    if (!valid) continue;
    hands.push(flat);

    if (labels != null && labels[i] != null) {
      handedness.push(labels[i]);
    } else {
      handedness.push(result.handedness?.[i]?.[0]?.categoryName ?? '');
    }
  }

  return { hands, handedness };
}

/** 720p analysis size, matching the sensor-landscape 16:9 camera format. */
function analysisScale(frameWidth: number, frameHeight: number): { width: number; height: number } {
  'worklet';
  const landscape = frameWidth >= frameHeight;
  return {
    width: landscape ? SIGN_CONFIG.ANALYSIS_WIDTH : SIGN_CONFIG.ANALYSIS_HEIGHT,
    height: landscape ? SIGN_CONFIG.ANALYSIS_HEIGHT : SIGN_CONFIG.ANALYSIS_WIDTH,
  };
}

export function useSignRecognition(modelId: SignModelId) {
  const [detection, setDetection] = useState<SignDetection | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classifierRef = useRef<SignClassifier | null>(null);
  const processingRef = useRef(false);
  const pendingPayloadRef = useRef<FramePayload | null>(null);
  const logCounterRef = useRef(0);
  const lastDetectionRef = useRef<SignDetection | null>(null);
  const lastDetectionAtRef = useRef(0);
  const generationRef = useRef(0);
  const { resize } = useResizePlugin();

  const holdDetection = useCallback(() => {
    const elapsed = Date.now() - lastDetectionAtRef.current;
    if (lastDetectionRef.current != null && elapsed < SIGN_CONFIG.DETECTION_HOLD_MS) {
      setDetection(lastDetectionRef.current);
      return true;
    }
    setDetection(null);
    return false;
  }, []);

  useEffect(() => {
    if (SIGN_CONFIG.DEBUG) {
      console.log('[sign] handLandmarker plugin available:', isHandLandmarkerAvailable);
    }
    let cancelled = false;
    generationRef.current += 1;
    const classifier = new SignClassifier();
    classifierRef.current = null;
    setIsReady(false);
    setError(null);
    setDetection(null);
    lastDetectionRef.current = null;
    lastDetectionAtRef.current = 0;

    classifier
      .load(modelId)
      .then(() => {
        if (cancelled) {
          void classifier.unload();
          return;
        }
        classifierRef.current = classifier;
        setIsReady(true);
        if (SIGN_CONFIG.DEBUG) console.log(`[sign] classifier model ${modelId} loaded OK`);
      })
      .catch((e: unknown) => {
        if (cancelled) {
          void classifier.unload();
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        if (SIGN_CONFIG.DEBUG) console.log('[sign] classifier load FAILED:', msg);
      });
    return () => {
      cancelled = true;
      classifierRef.current = null;
      void classifier.unload();
    };
  }, [modelId]);

  const handlePayload = useCallback((payload: FramePayload) => {
    const shouldLog =
      SIGN_CONFIG.DEBUG && logCounterRef.current++ % SIGN_CONFIG.DEBUG_THROTTLE === 0;

    const classifier = classifierRef.current;
    if (classifier == null || !classifier.isReady) {
      if (shouldLog) console.log('[sign] classifier not ready yet');
      return;
    }

    if (shouldLog) {
      console.log(
        `[sign] frame ${payload.width}x${payload.height} orient=${payload.orientation} hands=${payload.hands.length}` +
          (payload.error ? ` pluginError=${payload.error}` : ''),
      );
    }

    if (payload.hands.length === 0) {
      holdDetection();
      return;
    }

    if (processingRef.current) {
      pendingPayloadRef.current = payload;
      return;
    }
    processingRef.current = true;

    const finish = () => {
      processingRef.current = false;
      const next = pendingPayloadRef.current;
      pendingPayloadRef.current = null;
      if (next != null) handlePayload(next);
    };

    const { features, leftOk, rightOk, box, frame, debug } = buildFrameFeatures(payload);

    if (shouldLog) {
      console.log(
        `[sign] features leftOk=${leftOk} rightOk=${rightOk} leftPalm=${debug.leftPalm.toFixed(1)} rightPalm=${debug.rightPalm.toFixed(1)} box=${box ? 'yes' : 'null'}`,
      );
    }

    if ((!leftOk && !rightOk) || box == null) {
      holdDetection();
      finish();
      return;
    }

    const generation = generationRef.current;
    classifier
      .classify(features)
      .then((outcome) => {
        if (generation !== generationRef.current) return;
        if (outcome != null && shouldLog) {
          console.log(
            `[sign] predict top=${outcome.label} p=${outcome.confidence.toFixed(3)} margin=${outcome.margin.toFixed(3)} model=${outcome.modelPassed}`,
          );
        }
        if (outcome != null && outcome.modelPassed) {
          const det = detectionFor(outcome.label, outcome.confidence, box, frame);
          lastDetectionRef.current = det;
          lastDetectionAtRef.current = Date.now();
          setDetection(det);
        } else {
          holdDetection();
        }
      })
      .catch((e: unknown) => {
        if (SIGN_CONFIG.DEBUG) console.log('[sign] classify error:', e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        finish();
      });
  }, [holdDetection]);

  const onPayload = useRef(Worklets.createRunOnJS(handlePayload)).current;

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      runAtTargetFps(TARGET_FPS, () => {
        'worklet';
        const scale = analysisScale(frame.width, frame.height);
        // vision-camera-resize-plugin outputs a pixel buffer, not a Frame.
        // MediaPipe still reads the VisionCamera Frame; analysis size is the
        // 720p camera format. When a device falls back to a larger format,
        // run a GPU resize so the plugin stays on the hot path.
        if (frame.width > scale.width || frame.height > scale.height) {
          resize(frame, {
            scale,
            pixelFormat: 'rgb',
            dataType: 'uint8',
          });
        }

        const frameWidth = frame.width;
        const frameHeight = frame.height;
        const frameOrientation = frame.orientation;

        const result = detectHandLandmarks(frame);
        if (result == null) {
          onPayload({
            hands: [],
            handedness: [],
            mouth: null,
            width: frameWidth,
            height: frameHeight,
            orientation: frameOrientation,
          });
          return;
        }

        const { hands, handedness } = packHands(result);

        onPayload({
          hands,
          handedness,
          mouth: null,
          width: frameWidth,
          height: frameHeight,
          orientation: frameOrientation,
          error: result.error,
        });
      });
    },
    [onPayload, resize],
  );

  return { frameProcessor, detection, isReady, error };
}
