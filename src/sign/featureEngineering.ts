/**
 * TypeScript port of sign-language/src/sign_features.py + main.py coordinate flow.
 *
 * Python (main.py):
 *   1. frame = cv2.flip(frame, 1)          — mirror BEFORE MediaPipe
 *   2. holistic.process(flipped frame)
 *   3. hand_to_pixels: x * w, y * h        — w = shape[1], h = shape[0], NO rotation
 *   4. build_frame_features(left_slot, right_slot, face, image.shape)
 *
 * Android: MediaPipe rotationDegrees=0 → sensor-buffer landmarks; JS unwraps
 * landscape→portrait for overlay + classifier, then optional FLIP_X.
 * (Do not also rotate in native — that double-rotates the skeleton.)
 */
import {
  FEATURES_PER_HAND,
  FRAME_FEATURES,
  IDX_MOUTH_DIST,
  IDX_OPEN_COUNT,
  IDX_PALM_UPRIGHT,
  SIGN_CONFIG,
} from './config';
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

/** Resolved frame orientation (config override or sensor-reported). */
function effectiveOrientation(reported: string): string {
  return SIGN_CONFIG.ORIENTATION === 'auto' ? reported : SIGN_CONFIG.ORIENTATION;
}

/**
 * Preview / upright surface size for a VisionCamera frame (sensor landscape → portrait).
 */
function uprightFrameSize(
  frameW: number,
  frameH: number,
  orientation: string,
): { width: number; height: number } {
  switch (orientation) {
    case 'landscape-left':
    case 'landscape-right':
      return { width: frameH, height: frameW };
    default:
      return { width: frameW, height: frameH };
  }
}

/**
 * Map normalised landmarks into upright [0,1]² (origin top-left, y down).
 * When LANDMARKS_ARE_UPRIGHT, native MediaPipe already rotated — identity only.
 */
function toUprightNorm(nx: number, ny: number, orientation: string): [number, number] {
  if (SIGN_CONFIG.LANDMARKS_ARE_UPRIGHT) {
    return [nx, ny];
  }
  switch (orientation) {
    case 'landscape-left':
      return [ny, 1 - nx];
    case 'landscape-right':
      return [1 - ny, nx];
    case 'portrait-upside-down':
      return [1 - nx, 1 - ny];
    default:
      return [nx, ny];
  }
}

/**
 * Map a sensor-normalised landmark to portrait preview pixels.
 */
function toPreviewPixel(
  nx: number,
  ny: number,
  frameW: number,
  frameH: number,
  sensorOrientation: string,
): Pt {
  const { width: pW, height: pH } = uprightFrameSize(frameW, frameH, sensorOrientation);
  let [u, v] = toUprightNorm(nx, ny, sensorOrientation);
  if (SIGN_CONFIG.MIRROR_PREVIEW) u = 1 - u;
  return { x: u * pW, y: v * pH };
}

/**
 * Whether to apply an extra horizontal flip to reach Python's cv2.flip space.
 * Front-camera buffers are often already mirrored (Frame.isMirrored); flipping
 * again double-mirrors and collapses motion-class confidence.
 */
function shouldFlipForPython(isMirrored: boolean): boolean {
  return SIGN_CONFIG.FLIP_X && !isMirrored;
}

/**
 * sign_features.hand_to_pixels on the Python-equivalent upright mirrored frame.
 * Shared upright unwrap with the overlay, optional FLIP_X, then × upright W/H.
 */
function toPythonPixel(
  nx: number,
  ny: number,
  frameW: number,
  frameH: number,
  orientation: string,
  flipX: boolean,
): Pt {
  const { width: pW, height: pH } = uprightFrameSize(frameW, frameH, orientation);
  let [u, v] = toUprightNorm(nx, ny, orientation);
  if (flipX) u = 1 - u;
  return { x: u * pW, y: v * pH };
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
  /** Python _hand_validity_scale — gate only, not fed to the classifier. */
  validityScale: number;
}

/** sign_features._hand_validity_scale */
function handValidityScale(p: Pt[], palmWidth: number): number {
  const wrist = p[0];
  const middleMcp = p[9];
  const middleTip = p[12];
  const palmHeight = norm(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
  const fingerSpan = norm(wrist.x - middleTip.x, wrist.y - middleTip.y);
  return Math.max(palmWidth, palmHeight, fingerSpan, EPS);
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
  const validityScale = handValidityScale(p, palmWidth);

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

  return { vector, palmWidth, validityScale };
}

function parseHandedness(raw: string): 'left' | 'right' | null {
  const s = raw.trim().toLowerCase();
  if (s.startsWith('left')) return 'left';
  if (s.startsWith('right')) return 'right';
  return null;
}

function flatToPythonPoints(
  flat: number[],
  frameW: number,
  frameH: number,
  orientation: string,
  flipX: boolean,
): Pt[] {
  const pts: Pt[] = new Array(21);
  for (let i = 0; i < 21; i++) {
    pts[i] = toPythonPixel(flat[i * 3], flat[i * 3 + 1], frameW, frameH, orientation, flipX);
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
  /** Dual-hand static pose vector (FRAME_FEATURES). */
  features: Float32Array;
  leftOk: boolean;
  rightOk: boolean;
  /** Wrist in classifier pixel space, or null when that hand is invalid. */
  leftWrist: Pt | null;
  rightWrist: Pt | null;
  /** Max valid palm width this frame (pixels); 0 if no valid hand. */
  palmWidth: number;
  /** Mouth/face anchor in classifier pixel space. */
  anchor: Pt | null;
  box: { x: number; y: number; width: number; height: number } | null;
  frame: { width: number; height: number };
  /** Upright preview-space landmarks for every detected hand (incl. below palm gate). */
  previewHands: Pt[][];
  debug: {
    leftPalm: number;
    rightPalm: number;
    leftValidity: number;
    rightValidity: number;
    sensorOrientation: string;
    classOrientation: string;
    mouth: boolean;
    isMirrored: boolean;
    flipX: boolean;
    openCount: number;
    palmUpright: number;
    mouthDist: number;
  };
}

/**
 * sign_features.build_frame_features + main.py bounding_box (display space).
 */
export function buildFrameFeatures(payload: FramePayload): FrameFeatures {
  const frameW = payload.width;
  const frameH = payload.height;
  const classOrientation = effectiveOrientation(payload.orientation);
  const sensorOrientation = payload.orientation;
  const isMirrored = payload.isMirrored === true;
  const flipX = shouldFlipForPython(isMirrored);

  let mouthPx: Pt | null = null;
  if (payload.mouth != null) {
    mouthPx = toPythonPixel(
      payload.mouth.x,
      payload.mouth.y,
      frameW,
      frameH,
      classOrientation,
      flipX,
    );
  }

  // Holistic slots: left_hand_landmarks / right_hand_landmarks (anatomical).
  let leftPython: Pt[] | null = null;
  let rightPython: Pt[] | null = null;
  let leftPreview: Pt[] | null = null;
  let rightPreview: Pt[] | null = null;
  const previewHands: Pt[][] = [];

  for (let i = 0; i < payload.hands.length && i < 2; i++) {
    const flat = payload.hands[i];
    if (!flat || flat.length < 21 * 3) continue;

    let slot = parseHandedness(payload.handedness[i] ?? '');
    if (SIGN_CONFIG.SWAP_HANDEDNESS && slot != null) {
      slot = slot === 'left' ? 'right' : 'left';
    }

    const pyPts = flatToPythonPoints(flat, frameW, frameH, classOrientation, flipX);
    const previewPts = flatToPreviewPoints(flat, frameW, frameH, sensorOrientation);
    previewHands.push(previewPts);

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

  const features = new Float32Array(FRAME_FEATURES);
  let leftOk = false;
  let rightOk = false;
  let leftPalm = -1;
  let rightPalm = -1;
  let leftValidity = -1;
  let rightValidity = -1;
  let leftWrist: Pt | null = null;
  let rightWrist: Pt | null = null;
  const validPreviewHands: Pt[][] = [];

  if (leftPython != null && leftPreview != null) {
    const hf = buildHandFeatures(leftPython, 'left', mouthPx);
    leftPalm = hf.palmWidth;
    leftValidity = hf.validityScale;
    if (hf.validityScale >= SIGN_CONFIG.MIN_PALM_WIDTH) {
      features.set(hf.vector, 0);
      leftOk = true;
      leftWrist = { x: leftPython[0].x, y: leftPython[0].y };
      validPreviewHands.push(leftPreview);
    }
  }
  if (rightPython != null && rightPreview != null) {
    const hf = buildHandFeatures(rightPython, 'right', mouthPx);
    rightPalm = hf.palmWidth;
    rightValidity = hf.validityScale;
    if (hf.validityScale >= SIGN_CONFIG.MIN_PALM_WIDTH) {
      features.set(hf.vector, FEATURES_PER_HAND);
      rightOk = true;
      rightWrist = { x: rightPython[0].x, y: rightPython[0].y };
      validPreviewHands.push(rightPreview);
    }
  }

  const widths: number[] = [];
  if (leftOk && leftPalm > 0) widths.push(leftPalm);
  if (rightOk && rightPalm > 0) widths.push(rightPalm);
  const palmWidth = widths.length > 0 ? Math.max(...widths) : 0;

  const previewFrame = uprightFrameSize(frameW, frameH, sensorOrientation);
  const box = boundingBox(validPreviewHands, previewFrame.width, previewFrame.height);

  const activeOffset = leftOk ? 0 : rightOk ? FEATURES_PER_HAND : 0;
  const openCount = leftOk || rightOk ? features[activeOffset + IDX_OPEN_COUNT] : -1;
  const palmUpright = leftOk || rightOk ? features[activeOffset + IDX_PALM_UPRIGHT] : -1;
  const mouthDist = leftOk || rightOk ? features[activeOffset + IDX_MOUTH_DIST] : -1;

  return {
    features,
    leftOk,
    rightOk,
    leftWrist,
    rightWrist,
    palmWidth,
    anchor: mouthPx,
    box,
    frame: previewFrame,
    previewHands,
    debug: {
      leftPalm,
      rightPalm,
      leftValidity,
      rightValidity,
      sensorOrientation,
      classOrientation,
      mouth: mouthPx != null,
      isMirrored,
      flipX,
      openCount,
      palmUpright,
      mouthDist,
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
