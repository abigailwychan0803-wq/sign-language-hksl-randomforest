/**
 * Calibration constants for the sign-recognition pipeline.
 *
 * Python reference (main.py):
 *   frame = cv2.flip(frame, 1)   # mirror BEFORE MediaPipe Holistic
 *   hand_to_pixels: x * w, y * h on the flipped buffer (no extra rotation)
 *
 * Android Hand Landmarker uses rotationDegrees=0 (sensor-buffer landmarks).
 * JS unwraps landscape→portrait for overlay + classifier; classifier then
 * applies FLIP_X for Python selfie-mirror parity.
 */
export const SIGN_CONFIG = {
  /**
   * false = landmarks are in sensor-buffer space; JS applies landscape unwrap.
   * true only if native MediaPipe already rotated to upright (do not combine).
   */
  LANDMARKS_ARE_UPRIGHT: false,
  /**
   * Sensor orientation source for the shared upright unwrap.
   */
  ORIENTATION: "auto" as
    | "auto"
    | "portrait"
    | "landscape-left"
    | "landscape-right"
    | "portrait-upside-down",
  /**
   * Target Python's cv2.flip mirrored space. Skipped when Frame.isMirrored is
   * already true so we do not double-mirror.
   */
  FLIP_X: true,
  /**
   * Mirror x in overlay space. Keep false unless Camera isMirrored is also set.
   */
  MIRROR_PREVIEW: false,
  /**
   * Hand Landmarker Left/Right are anatomical; do not swap after flip.
   */
  SWAP_HANDEDNESS: false,
  /**
   * Skip buffering empty frames for this long after the last hand (ms).
   */
  EMPTY_FRAME_GRACE_MS: 400,
  /** How long (ms) to keep the last box visible after hands drop or a frame fails. */
  DETECTION_HOLD_MS: 400,
  /** Minimum palm / validity scale in pixels (sign_features min_palm_width). */
  MIN_PALM_WIDTH: 40,
  /** Bounding-box padding (main.py bounding_box pad). */
  BOX_PAD: 16,
  /**
   * Mobile close-up / Hand Landmarker domain shift yields lower RF probabilities
   * than the webcam Holistic path in main.py (0.55 / 0.10 / 0.6). Keep top-1
   * goodbye (~0.35–0.40) displayable while still rejecting flat noise.
   */
  MIN_CONFIDENCE: 0.3,
  /** Min gap vs second-best (main.py: 0.10). */
  MARGIN: 0.02,
  /** UI draw gate — same floor as MIN_CONFIDENCE on mobile. */
  DISPLAY_CONFIDENCE: 0.3,
  /** Rolling window length for motion features (sign_features.WINDOW_SECONDS). */
  WINDOW_SECONDS: 1.0,
  /** Minimum buffered frames before motion inference (MIN_WINDOW_FRAMES). */
  MIN_WINDOW_FRAMES: 8,
  /**
   * Wrist speed (palm widths/sec). Phone close-ups have larger palms so the
   * same physical wave yields lower palm/s than a webcam — use 0.5 vs Python 1.0.
   */
  MOTION_ENERGY_THRESHOLD: 0.5,
  /** Hand-presence gate shared with clip capture (MIN_PRESENCE_RATIO). */
  MIN_PRESENCE_RATIO: 0.6,
  /** Cap on buffered frames (RuntimeMotionClassifier.MAX_BUFFERED_FRAMES). */
  MAX_BUFFERED_FRAMES: 120,
  /** Log mouth/orientation/top-3 while validating mobile parity. */
  DEBUG: true,
  DEBUG_THROTTLE: 15,
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
