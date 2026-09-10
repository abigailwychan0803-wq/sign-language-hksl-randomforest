/**
 * Calibration constants for the sign-recognition pipeline.
 *
 * Python reference (main2.py):
 *   frame = cv2.flip(frame, 1)   # mirror BEFORE MediaPipe Holistic
 *   hand_to_pixels: x * w, y * h on the flipped sensor buffer (no rotation)
 *   build_frame_features(left_slot, right_slot, face, image.shape)
 */
export const SIGN_CONFIG = {
  /**
   * Frame orientation used for landmark transforms. Set to 'portrait' to ignore the
   * sensor-reported value (often 'landscape-left' on a portrait-held phone).
   * Use 'auto' to derive from frame.orientation.
   */
  ORIENTATION: "portrait" as
    | "auto"
    | "portrait"
    | "landscape-left"
    | "landscape-right"
    | "portrait-upside-down",
  /** Mirror x before rotation — matches cv2.flip(frame, 1) before MediaPipe. */
  FLIP_X: true,
  /** Mirror x in display/preview space (front camera preview is usually mirrored). */
  MIRROR_PREVIEW: true,
  /** Swap Hand Landmarker Left/Right labels if left/right slot is inverted. */
  SWAP_HANDEDNESS: true,
  /** Clockwise rotation for classifier features only (not used for overlay boxes). */
  PYTHON_ROTATION: 90 as 0 | 90 | 180 | 270 | "auto",
  /** How long (ms) to keep the last box visible after hands drop or a frame fails. */
  DETECTION_HOLD_MS: 400,
  /** Minimum palm width in pixels (sign_features min_palm_width). */
  MIN_PALM_WIDTH: 40,
  /** Bounding-box padding (main2.py bounding_box pad). */
  BOX_PAD: 16,
  /** OnnxRuntimeSignClassifier min_confidence (main2.py: 0.55). */
  MIN_CONFIDENCE: 0.55,
  /** OnnxRuntimeSignClassifier margin (main2.py: 0.10). */
  MARGIN: 0.1,
  /** detect_and_draw / consider gate (main2.py: 0.6). */
  DISPLAY_CONFIDENCE: 0.6,
  DEBUG: false,
  DEBUG_THROTTLE: 30,
  /** Camera + MediaPipe analysis cap (sensor landscape 16:9). */
  ANALYSIS_WIDTH: 1280,
  ANALYSIS_HEIGHT: 720,
  CAMERA_FPS: 30,
} as const;

export const FEATURES_PER_HAND = 21 * 2 + 7 + 8; // 57
export const TOTAL_FEATURES = FEATURES_PER_HAND * 2; // 114
