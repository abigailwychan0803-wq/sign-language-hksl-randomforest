/**
 * Bundled ONNX assets for on-device sign recognition.
 * Single motion-window classifier exported from sign-language-randomforest.
 */

export type LabelSidecar = {
  labels: string[];
  input_name: string;
  output_names: string[];
  feature_layout?: string;
  features_per_hand?: number;
  n_features?: number;
  window_features?: number;
  window_seconds?: number;
  min_window_frames?: number;
  motion_features?: string[];
};

// Bundled assets (resolved via metro assetExts: 'onnx'). Paths must be static literals.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const MOTION_MODEL_ONNX = require('@/assets/model/motion_classifier_model1.onnx');
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const MOTION_MODEL_LABELS = require('@/assets/model/motion_labels_model1.json') as LabelSidecar;

export const SIGN_MODEL = {
  onnx: MOTION_MODEL_ONNX,
  labels: MOTION_MODEL_LABELS,
} as const;
