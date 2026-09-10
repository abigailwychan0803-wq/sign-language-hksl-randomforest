/**
 * TypeScript port of sign-language/src/sign_features.py + main2.py coordinate flow.
 *
 * Python (main2.py):
 *   1. frame = cv2.flip(frame, 1)          — mirror BEFORE MediaPipe
 *   2. holistic.process(flipped frame)
 *   3. hand_to_pixels: x * w, y * h        — w = shape[1], h = shape[0], NO rotation
 *   4. build_frame_features(left_slot, right_slot, face, image.shape)
 *
 * The Hand Landmarker plugin returns landmarks normalised to the raw sensor buffer
 * (e.g. 720p, orientation "landscape-left" when the phone is held portrait).
 * Face Landmarker is off; mouth_dist uses the training default 3.0 when no mouth
 * point is present. We mirror + rotate in JS to reproduce the flipped-landscape
 * upright-hand space the model was trained on, and use a separate display
 * transform for overlay boxes.
 */
import { FEATURES_PER_HAND, SIGN_CONFIG, TOTAL_FEATURES } from './config';
import type { FramePayload } from './types';

type Pt = { x: number; y: number };

const EPS = 1e-6;

function norm(ax: number, ay: number): number {
  return Math.sqrt(ax * ax + ay * ay);
}

function safeUnit(ax: number, ay: number): [number, number] {
  const n = norm(ax, ay);
  if (n < EPS) return [0, 0];
  return [ax / n, ay / n];
}

function angle(a: Pt, b: Pt, c: Pt): number {
  const [bax, bay] = safeUnit(a.x - b.x, a.y - b.y);
  const [bcx, bcy] = safeUnit(c.x - b.x, c.y - b.y);
  let dot = bax * bcx + bay * bcy;
  if (dot > 1) dot = 1;
  if (dot < -1) dot = -1;
  return Math.acos(dot);
}

/** Clockwise rotation in normalised [0,1]² (origin top-left, y down). */
function rotateNorm(nx: number, ny: number, deg: number): [number, number] {
  switch (deg) {
    case 90:
      return [1 - ny, nx];
    case 180:
      return [1 - nx, 1 - ny];
    case 270:
      return [ny, 1 - nx];
    default:
      return [nx, ny];
  }
}

/** Resolved frame orientation (config override or sensor-reported). */
function effectiveOrientation(reported: string): string {
  return SIGN_CONFIG.ORIENTATION === 'auto' ? reported : SIGN_CONFIG.ORIENTATION;
}

/**
 * Rotation that maps raw sensor landmarks into the same upright-hand layout Python
 * sees on a flipped landscape webcam frame (capture_dataset / main2.py).
 */
function pythonRotationDeg(orientation: string): number {
  const cfg = SIGN_CONFIG.PYTHON_ROTATION;
  if (cfg === 0 || cfg === 90 || cfg === 180 || cfg === 270) return cfg;
  switch (orientation) {
    case 'landscape-left':
      return 90;
    case 'landscape-right':
      return 270;
    case 'portrait-upside-down':
      return 180;
    case 'portrait':
    default:
      return 0;
  }
}

/**
 * Preview surface size for a VisionCamera frame (see getSurfaceSize in useSkiaFrameProcessor).
 */
function previewFrameSize(
  frameW: number,
  frameH: number,
  sensorOrientation: string,
): { width: number; height: number } {
  switch (sensorOrientation) {
    case 'landscape-left':
    case 'landscape-right':
      return { width: frameH, height: frameW };
    default:
      return { width: frameW, height: frameH };
  }
}

/**
 * Map a sensor-normalised landmark to portrait preview pixels.
 * Uses the sensor-reported orientation (not ORIENTATION override) so the box
 * aligns with what VisionCamera renders. Classifier features use a separate path.
 */
function toPreviewPixel(
  nx: number,
  ny: number,
  frameW: number,
  frameH: number,
  sensorOrientation: string,
): Pt {
  const { width: pW, height: pH } = previewFrameSize(frameW, frameH, sensorOrientation);

  let u: number;
  let v: number;
  switch (sensorOrientation) {
    case 'landscape-left':
      u = ny;
      v = 1 - nx;
      break;
    case 'landscape-right':
      u = 1 - ny;
      v = nx;
      break;
    case 'portrait-upside-down':
      u = 1 - nx;
      v = 1 - ny;
      break;
    default:
      u = nx;
      v = ny;
      break;
  }

  if (SIGN_CONFIG.MIRROR_PREVIEW) u = 1 - u;

  return { x: u * pW, y: v * pH };
}

/**
 * sign_features.hand_to_pixels on the Python-equivalent frame.
 * Order: mirror (cv2.flip) → rotate → x*w, y*h with sensor w/h (no swap).
 */
function toPythonPixel(nx: number, ny: number, frameW: number, frameH: number, orientation: string): Pt {
  if (SIGN_CONFIG.FLIP_X) nx = 1 - nx;
  const rot = pythonRotationDeg(orientation);
  const [rx, ry] = rotateNorm(nx, ny, rot);
  return { x: rx * frameW, y: ry * frameH };
}

function fingerStates(p: Pt[], handedness: 'left' | 'right'): FingerStates {
  const wrist = p[0];
  const indexMcp = p[5];
  const pinkyMcp = p[17];
  const palmScale = Math.max(norm(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y), EPS);

  const indexOpen = p[8].y < p[6].y;
  const middleOpen = p[12].y < p[10].y;
  const ringOpen = p[16].y < p[14].y;
  const pinkyOpen = p[20].y < p[18].y;

  const thumbTip = p[4];
  const thumbIp = p[3];
  let thumbOpen: boolean;
  if (handedness === 'right') {
    thumbOpen = thumbTip.x - thumbIp.x > 0.15 * palmScale;
  } else {
    thumbOpen = thumbIp.x - thumbTip.x > 0.15 * palmScale;
  }
  const thumbFar = norm(thumbTip.x - wrist.x, thumbTip.y - wrist.y) > 0.45 * palmScale;
  thumbOpen = thumbOpen || thumbFar;

  return {
    thumb: thumbOpen,
    index: indexOpen,
    middle: middleOpen,
    ring: ringOpen,
    pinky: pinkyOpen,
  };
}

interface FingerStates {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

interface HandFeatures {
  vector: Float32Array;
  palmWidth: number;
}

/** sign_features.build_hand_features */
function buildHandFeatures(
  p: Pt[],
  handedness: 'left' | 'right',
  mouthPx: Pt | null,
): HandFeatures {
  const wrist = p[0];
  const indexMcp = p[5];
  const pinkyMcp = p[17];
  const palmWidth = Math.max(norm(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y), EPS);

  const vector = new Float32Array(FEATURES_PER_HAND);
  let o = 0;

  for (let i = 0; i < 21; i++) {
    vector[o++] = (p[i].x - wrist.x) / palmWidth;
    vector[o++] = (p[i].y - wrist.y) / palmWidth;
  }

  const states = fingerStates(p, handedness);
  const openCount =
    (states.thumb ? 1 : 0) +
    (states.index ? 1 : 0) +
    (states.middle ? 1 : 0) +
    (states.ring ? 1 : 0) +
    (states.pinky ? 1 : 0);

  const idxAngle = angle(p[5], p[6], p[8]);
  const midAngle = angle(p[9], p[10], p[12]);
  const ringAngle = angle(p[13], p[14], p[16]);
  const pnkAngle = angle(p[17], p[18], p[20]);

  const indexTip = p[8];
  const pinkyTip = p[20];
  const thumbTip = p[4];

  const [, wmU_y] = safeUnit(p[12].x - wrist.x, p[12].y - wrist.y);
  const palmUpright = -wmU_y;
  const spread = norm(indexTip.x - pinkyTip.x, indexTip.y - pinkyTip.y) / palmWidth;
  const thumbIndexDist = norm(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) / palmWidth;

  let mouthDist = 3.0;
  if (mouthPx != null) {
    mouthDist = norm(indexTip.x - mouthPx.x, indexTip.y - mouthPx.y) / palmWidth;
  }

  const handednessNum = handedness === 'right' ? 1.0 : 0.0;

  vector[o++] = states.thumb ? 1 : 0;
  vector[o++] = states.index ? 1 : 0;
  vector[o++] = states.middle ? 1 : 0;
  vector[o++] = states.ring ? 1 : 0;
  vector[o++] = states.pinky ? 1 : 0;
  vector[o++] = openCount;
  vector[o++] = handednessNum;

  vector[o++] = idxAngle;
  vector[o++] = midAngle;
  vector[o++] = ringAngle;
  vector[o++] = pnkAngle;
  vector[o++] = spread;
  vector[o++] = thumbIndexDist;
  vector[o++] = palmUpright;
  vector[o++] = mouthDist;

  return { vector, palmWidth };
}

function parseHandedness(raw: string): 'left' | 'right' | null {
  const s = raw.trim().toLowerCase();
  if (s.startsWith('left')) return 'left';
  if (s.startsWith('right')) return 'right';
  return null;
}

function flatToPythonPoints(flat: number[], frameW: number, frameH: number, orientation: string): Pt[] {
  const pts: Pt[] = new Array(21);
  for (let i = 0; i < 21; i++) {
    pts[i] = toPythonPixel(flat[i * 3], flat[i * 3 + 1], frameW, frameH, orientation);
  }
  return pts;
}

function flatToPreviewPoints(
  flat: number[],
  frameW: number,
  frameH: number,
  sensorOrientation: string,
): Pt[] {
  const pts: Pt[] = new Array(21);
  for (let i = 0; i < 21; i++) {
    pts[i] = toPreviewPixel(flat[i * 3], flat[i * 3 + 1], frameW, frameH, sensorOrientation);
  }
  return pts;
}

export interface FrameFeatures {
  features: Float32Array;
  leftOk: boolean;
  rightOk: boolean;
  box: { x: number; y: number; width: number; height: number } | null;
  frame: { width: number; height: number };
  debug: { leftPalm: number; rightPalm: number; pythonRot: number; sensorOrientation: string };
}

/**
 * sign_features.build_frame_features + main2.py bounding_box (display space).
 */
export function buildFrameFeatures(payload: FramePayload): FrameFeatures {
  const frameW = payload.width;
  const frameH = payload.height;
  const classOrientation = effectiveOrientation(payload.orientation);
  const sensorOrientation = payload.orientation;

  let mouthPx: Pt | null = null;
  if (payload.mouth != null) {
    mouthPx = toPythonPixel(payload.mouth.x, payload.mouth.y, frameW, frameH, classOrientation);
  }

  // Holistic slots: left_hand_landmarks / right_hand_landmarks (body-relative).
  let leftPython: Pt[] | null = null;
  let rightPython: Pt[] | null = null;
  let leftPreview: Pt[] | null = null;
  let rightPreview: Pt[] | null = null;

  for (let i = 0; i < payload.hands.length && i < 2; i++) {
    const flat = payload.hands[i];
    if (!flat || flat.length < 21 * 3) continue;

    let slot = parseHandedness(payload.handedness[i] ?? '');
    if (SIGN_CONFIG.SWAP_HANDEDNESS && slot != null) {
      slot = slot === 'left' ? 'right' : 'left';
    }

    const pyPts = flatToPythonPoints(flat, frameW, frameH, classOrientation);
    const previewPts = flatToPreviewPoints(flat, frameW, frameH, sensorOrientation);

    if (slot === 'left' && leftPython == null) {
      leftPython = pyPts;
      leftPreview = previewPts;
    } else if (slot === 'right' && rightPython == null) {
      rightPython = pyPts;
      rightPreview = previewPts;
    } else if (slot == null) {
      if (leftPython == null) {
        leftPython = pyPts;
        leftPreview = previewPts;
      } else if (rightPython == null) {
        rightPython = pyPts;
        rightPreview = previewPts;
      }
    }
  }

  const features = new Float32Array(TOTAL_FEATURES);
  let leftOk = false;
  let rightOk = false;
  let leftPalm = -1;
  let rightPalm = -1;
  const validPreviewHands: Pt[][] = [];

  if (leftPython != null && leftPreview != null) {
    const hf = buildHandFeatures(leftPython, 'left', mouthPx);
    leftPalm = hf.palmWidth;
    if (hf.palmWidth >= SIGN_CONFIG.MIN_PALM_WIDTH) {
      features.set(hf.vector, 0);
      leftOk = true;
      validPreviewHands.push(leftPreview);
    }
  }
  if (rightPython != null && rightPreview != null) {
    const hf = buildHandFeatures(rightPython, 'right', mouthPx);
    rightPalm = hf.palmWidth;
    if (hf.palmWidth >= SIGN_CONFIG.MIN_PALM_WIDTH) {
      features.set(hf.vector, FEATURES_PER_HAND);
      rightOk = true;
      validPreviewHands.push(rightPreview);
    }
  }

  const previewFrame = previewFrameSize(frameW, frameH, sensorOrientation);
  const box = boundingBox(validPreviewHands, previewFrame.width, previewFrame.height);

  return {
    features,
    leftOk,
    rightOk,
    box,
    frame: previewFrame,
    debug: {
      leftPalm,
      rightPalm,
      pythonRot: pythonRotationDeg(classOrientation),
      sensorOrientation,
    },
  };
}

function boundingBox(
  hands: Pt[][],
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  if (hands.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pts of hands) {
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const pad = SIGN_CONFIG.BOX_PAD;
  let x1 = Math.floor(minX) - pad;
  let y1 = Math.floor(minY) - pad;
  let x2 = Math.ceil(maxX) + pad;
  let y2 = Math.ceil(maxY) + pad;

  x1 = Math.max(0, x1);
  y1 = Math.max(0, y1);
  x2 = Math.min(width - 1, x2);
  y2 = Math.min(height - 1, y2);

  return {
    x: x1 / width,
    y: y1 / height,
    width: (x2 - x1) / width,
    height: (y2 - y1) / height,
  };
}
