/**
 * Shared types for the sign-recognition pipeline.
 *
 * These intentionally mirror the shape returned by the MediaPipe frame
 * processor plugin (expo-vision-camera-v4-mediapipe on Android, and the custom
 * Swift plugin on iOS) so the rest of the pipeline is platform-agnostic.
 */

export interface Landmark {
  x: number; // normalized [0, 1]
  y: number; // normalized [0, 1]
  z: number; // depth relative to wrist (unused by the classifier)
}

export interface HandednessCategory {
  categoryName: string; // "Left" | "Right"
  score: number;
  displayName?: string;
}

/** Raw result returned by the native frame processor plugin. */
export interface HandDetectionResult {
  hands: Landmark[][];
  /** Compact handedness labels from optimized native path. */
  handednessLabels?: string[];
  handedness?: HandednessCategory[][];
  /** Mouth landmark (MediaPipe face index 13) from optimized native path. */
  mouth?: { x: number; y: number };
  face?: Landmark[];
  error?: string;
}

/**
 * Minimal, worklet-friendly payload extracted inside the frame processor and
 * shipped to the JS thread. Only the data the classifier needs is forwarded to
 * keep the runOnJS bridge payload small.
 */
export interface FramePayload {
  /** Up to 2 hands, each a flat [x0,y0,z0, x1,y1,z1, ...] of 21 landmarks (normalized). */
  hands: number[][];
  /** Handedness label per hand: "Left" | "Right" | "". */
  handedness: string[];
  /** Mouth landmark (MediaPipe face index 13), normalized, or null when no face. */
  mouth: { x: number; y: number } | null;
  /** Frame pixel dimensions (sensor orientation). */
  width: number;
  height: number;
  /** Frame orientation reported by VisionCamera ("portrait" | "landscape-left" | ...). */
  orientation: string;
  /** Error reported by the native plugin, if any. */
  error?: string;
}

export type SignColor = readonly [number, number, number];

/** A single confident detection to render as a labeled box. */
export interface SignDetection {
  label: string;
  confidence: number;
  /** Bounding box in normalized [0, 1] frame coordinates. */
  box: { x: number; y: number; width: number; height: number };
  /** Upright frame dimensions the box is relative to (for cover-fit mapping). */
  frame: { width: number; height: number };
  /** RGB color (0-255) for the box/label. */
  color: SignColor;
}
