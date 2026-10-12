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
  /** Rolling window length for motion features (sign_features.WINDOW_SECONDS). */
  WINDOW_SECONDS: 1.0,
  /** Minimum buffered frames before motion inference (MIN_WINDOW_FRAMES). */
  MIN_WINDOW_FRAMES: 8,
  /** Wrist speed (palm widths/sec) to treat the window as moving. */
  MOTION_ENERGY_THRESHOLD: 1.0,
  /** Hand-presence gate shared with clip capture (MIN_PRESENCE_RATIO). */
  MIN_PRESENCE_RATIO: 0.6,
  /** Cap on buffered frames (RuntimeMotionClassifier.MAX_BUFFERED_FRAMES). */
  MAX_BUFFERED_FRAMES: 120,
  DEBUG: false,
  DEBUG_THROTTLE: 30,
  /** Camera + MediaPipe analysis cap (sensor landscape 16:9). */
  ANALYSIS_WIDTH: 1280,
  ANALYSIS_HEIGHT: 720,
  CAMERA_FPS: 30,
} as const;

export const FEATURES_PER_HAND = 21 * 2 + 7 + 8; // 57
/** Dual-hand static pose vector (left + right). */
export const FRAME_FEATURES = FEATURES_PER_HAND * 2; // 114

const REL_COORD_COUNT = 21 * 2;
const BOOL_OFFSET = REL_COORD_COUNT;
const GEOM_OFFSET = BOOL_OFFSET + 7;

/** Indices of scalar signals inside a per-hand feature vector (sign_features.py). */
export const IDX_OPEN_COUNT = BOOL_OFFSET + 5;
export const IDX_SPREAD = GEOM_OFFSET + 4;
export const IDX_THUMB_INDEX_DIST = GEOM_OFFSET + 5;
export const IDX_PALM_UPRIGHT = GEOM_OFFSET + 6;
export const IDX_MOUTH_DIST = GEOM_OFFSET + 7;

/** Motion stats: 25 per hand × 2 + 7 both-hand = 57. */
export const MOTION_FEATURES_PER_HAND = 25;
export const MOTION_FEATURE_COUNT = MOTION_FEATURES_PER_HAND * 2 + 7;
/**
 * Motion-window vector length for the exported ONNX model:
 * dual-hand pose (114) + motion stats (57) = 171.
 */
export const TOTAL_FEATURES = FRAME_FEATURES + MOTION_FEATURE_COUNT; // 171
