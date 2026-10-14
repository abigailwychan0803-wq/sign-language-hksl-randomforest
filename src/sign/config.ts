/**
 * Calibration constants for the sign-recognition pipeline.
 *
 * Python reference (main.py):
 *   frame = cv2.flip(frame, 1)   # mirror BEFORE MediaPipe Holistic
 *   hand_to_pixels: x * w, y * h on the flipped buffer (no extra rotation)
 *
 * On Android, Hand Landmarker landmarks behave like VisionCamera sensor-buffer
 * coordinates (landscape when the phone is held portrait). Overlay unwraps
 * that into preview space; classifier features flip + rotate into the same
 * upright layout Python trains on.
 */
export const SIGN_CONFIG = {
  /**
   * Orientation fed to PYTHON_ROTATION when it is "auto". "portrait" forces a
   * stable 90° classifier rotation on portrait-held phones even if the sensor
   * reports landscape-left.
   */
  ORIENTATION: "portrait" as
    | "auto"
    | "portrait"
    | "landscape-left"
    | "landscape-right"
    | "portrait-upside-down",
  /** Mirror x — matches cv2.flip(frame, 1) before MediaPipe in Python. */
  FLIP_X: true,
  /**
   * Mirror x in overlay space. VisionCamera's preview is not mirrored by default
   * on Android (unlike many stock camera apps), so keep this false unless you
   * also set Camera isMirrored.
   */
  MIRROR_PREVIEW: false,
  /**
   * Hand Landmarker labels anatomical Left/Right on the unflipped buffer.
   * Python Holistic also uses anatomical slots, so do NOT swap after JS flip.
   */
  SWAP_HANDEDNESS: false,
  /**
   * Clockwise rotation for classifier features (sensor buffer → upright hands).
   * Overlay uses a separate sensor→preview unwrap; keep these in sync empirically.
   */
  PYTHON_ROTATION: 90 as 0 | 90 | 180 | 270 | "auto",
  /** How long (ms) to keep the last box visible after hands drop or a frame fails. */
  DETECTION_HOLD_MS: 400,
  /** Minimum palm width in pixels (sign_features min_palm_width). */
  MIN_PALM_WIDTH: 40,
  /** Bounding-box padding (main.py bounding_box pad). */
  BOX_PAD: 16,
  /** OnnxRuntimeSignClassifier min_confidence (main.py: 0.55). */
  MIN_CONFIDENCE: 0.55,
  /** OnnxRuntimeSignClassifier margin (main.py: 0.10). */
  MARGIN: 0.1,
  /** detect_and_draw / consider gate (main.py: 0.6). */
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

/** MediaPipe hand topology (same edges drawn in main.py / Holistic HAND_CONNECTIONS). */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
] as const;
