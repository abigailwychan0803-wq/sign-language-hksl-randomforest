/**
 * Worklet wrapper around the native MediaPipe frame processor plugin.
 *
 * The Android config plugin (expo-vision-camera-v4-mediapipe) registers the
 * plugin under the name "handLandmarker". We resolve it via VisionCameraProxy
 * rather than relying on an injected global, so the same call site works once the
 * iOS Swift plugin registers under the same name.
 */
import { VisionCameraProxy, type Frame } from 'react-native-vision-camera';

import type { HandDetectionResult } from './types';

const plugin = VisionCameraProxy.initFrameProcessorPlugin('handLandmarker', {
  enableFace: false,
});

export function detectHandLandmarks(frame: Frame): HandDetectionResult | null {
  'worklet';
  if (plugin == null) {
    return null;
  }
  return plugin.call(frame) as unknown as HandDetectionResult;
}

export const isHandLandmarkerAvailable = plugin != null;
