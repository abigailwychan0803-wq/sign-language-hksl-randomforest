/**
 * TypeScript port of sign_features.py motion-window summarization.
 *
 * Builds the 171-dim vector: [last valid pose (114) | left motion | right motion | both].
 */
import {
  FEATURES_PER_HAND,
  FRAME_FEATURES,
  IDX_MOUTH_DIST,
  IDX_OPEN_COUNT,
  IDX_PALM_UPRIGHT,
  IDX_SPREAD,
  IDX_THUMB_INDEX_DIST,
  MOTION_FEATURES_PER_HAND,
  TOTAL_FEATURES,
} from './config';

const STEP_TOLERANCE = 0.03;

const SIGNAL_INDICES = {
  open_count: IDX_OPEN_COUNT,
  spread: IDX_SPREAD,
  thumb_index_dist: IDX_THUMB_INDEX_DIST,
  palm_upright: IDX_PALM_UPRIGHT,
  mouth_dist: IDX_MOUTH_DIST,
} as const;

type SignalName = keyof typeof SIGNAL_INDICES;

export type Pt = { x: number; y: number };

export interface FrameSample {
  features: Float32Array;
  leftOk: boolean;
  rightOk: boolean;
  leftWrist: Pt | null;
  rightWrist: Pt | null;
  palmWidth: number;
  anchor: Pt | null;
  timestamp: number;
}

export interface WindowSummary {
  vector: Float32Array;
  leftRatio: number;
  rightRatio: number;
  motionEnergy: number;
  duration: number;
  frames: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function nanMean(mask: boolean[]): number {
  if (mask.length === 0) return 0;
  let sum = 0;
  for (const v of mask) if (v) sum += 1;
  return sum / mask.length;
}

function std(values: number[]): number {
  if (values.length === 0) return 0;
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  let acc = 0;
  for (const v of values) {
    const d = v - mean;
    acc += d * d;
  }
  return Math.sqrt(acc / values.length);
}

function windowScale(samples: FrameSample[]): number {
  const widths = samples.map((s) => s.palmWidth).filter((w) => w > 1e-6);
  if (widths.length === 0) return 1.0;
  return Math.max(median(widths), 1e-6);
}

function anchorSeries(samples: FrameSample[]): Array<Pt | null> {
  const anchors: Array<Pt | null> = [];
  let last: Pt | null = null;
  for (const sample of samples) {
    if (sample.anchor != null) last = sample.anchor;
    anchors.push(last);
  }
  const first = anchors.find((a) => a != null) ?? null;
  return anchors.map((a) => a ?? first);
}

interface HandSeries {
  positions: Float32Array; // length count*2, NaN when missing
  times: Float64Array;
  signals: Record<SignalName, Float32Array>;
}

function handSeries(
  samples: FrameSample[],
  side: 'left' | 'right',
  scale: number,
  anchors: Array<Pt | null>,
): HandSeries {
  const count = samples.length;
  const positions = new Float32Array(count * 2);
  const times = new Float64Array(count);
  const signals: Record<SignalName, Float32Array> = {
    open_count: new Float32Array(count),
    spread: new Float32Array(count),
    thumb_index_dist: new Float32Array(count),
    palm_upright: new Float32Array(count),
    mouth_dist: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    positions[i * 2] = Number.NaN;
    positions[i * 2 + 1] = Number.NaN;
    for (const name of Object.keys(signals) as SignalName[]) {
      signals[name][i] = Number.NaN;
    }
  }

  const offset = side === 'left' ? 0 : FEATURES_PER_HAND;
  for (let i = 0; i < count; i++) {
    const sample = samples[i];
    times[i] = sample.timestamp;
    const wrist = side === 'left' ? sample.leftWrist : sample.rightWrist;
    const valid = side === 'left' ? sample.leftOk : sample.rightOk;
    if (!valid || wrist == null) continue;
    const anchor = anchors[i];
    const ox = anchor?.x ?? 0;
    const oy = anchor?.y ?? 0;
    positions[i * 2] = (wrist.x - ox) / scale;
    positions[i * 2 + 1] = (wrist.y - oy) / scale;
    for (const name of Object.keys(SIGNAL_INDICES) as SignalName[]) {
      signals[name][i] = sample.features[offset + SIGNAL_INDICES[name]];
    }
  }
  return { positions, times, signals };
}

function reversalRate(deltas: number[], duration: number): number {
  const signs: number[] = [];
  for (const d of deltas) {
    if (Math.abs(d) < STEP_TOLERANCE) continue;
    signs.push(Math.sign(d));
  }
  if (signs.length < 2) return 0;
  let flips = 0;
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] !== signs[i - 1]) flips += 1;
  }
  return flips / Math.max(duration, 1e-3);
}

function totalTurning(stepsX: number[], stepsY: number[]): number {
  const angles: number[] = [];
  for (let i = 0; i < stepsX.length; i++) {
    const len = Math.hypot(stepsX[i], stepsY[i]);
    if (len <= STEP_TOLERANCE) continue;
    angles.push(Math.atan2(stepsY[i], stepsX[i]));
  }
  if (angles.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < angles.length; i++) {
    let diff = angles[i] - angles[i - 1];
    // Match numpy: (diff + pi) % (2pi) - pi
    diff = ((((diff + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    sum += Math.abs(diff);
  }
  return sum;
}

const HAND_MOTION_NAMES = [
  'presence_ratio',
  'net_dx',
  'net_dy',
  'net_displacement',
  'path_length',
  'straightness',
  'mean_speed',
  'max_speed',
  'std_speed',
  'signed_area',
  'reversal_rate_x',
  'reversal_rate_y',
  'vertical_ratio',
  'amplitude_x',
  'amplitude_y',
  'total_turning',
  'delta_open_count',
  'delta_spread',
  'delta_palm_upright',
  'delta_thumb_index_dist',
  'delta_mouth_dist',
  'std_open_count',
  'std_palm_upright',
  'mean_mouth_dist',
  'min_mouth_dist',
] as const;

const MEAN_SPEED_INDEX = HAND_MOTION_NAMES.indexOf('mean_speed');

function handMotionFeatures(series: HandSeries): Float32Array {
  const out = new Float32Array(MOTION_FEATURES_PER_HAND);
  const { positions, times, signals } = series;
  const total = times.length;
  if (total === 0) return out;

  const mask: boolean[] = [];
  for (let i = 0; i < total; i++) {
    mask.push(!Number.isNaN(positions[i * 2]));
  }
  out[HAND_MOTION_NAMES.indexOf('presence_ratio')] = nanMean(mask);
  const validCount = mask.reduce((n, v) => n + (v ? 1 : 0), 0);
  if (validCount < 2) return out;

  const ptsX: number[] = [];
  const ptsY: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!mask[i]) continue;
    ptsX.push(positions[i * 2]);
    ptsY.push(positions[i * 2 + 1]);
    t.push(times[i]);
  }

  const stepsX: number[] = [];
  const stepsY: number[] = [];
  const dt: number[] = [];
  for (let i = 1; i < ptsX.length; i++) {
    stepsX.push(ptsX[i] - ptsX[i - 1]);
    stepsY.push(ptsY[i] - ptsY[i - 1]);
    let d = t[i] - t[i - 1];
    if (d <= 0) d = 1e-3;
    dt.push(d);
  }
  const duration = Math.max(t[t.length - 1] - t[0], 1e-3);
  const stepLen = stepsX.map((dx, i) => Math.hypot(dx, stepsY[i]));
  const speeds = stepLen.map((len, i) => len / dt[i]);
  const netX = ptsX[ptsX.length - 1] - ptsX[0];
  const netY = ptsY[ptsY.length - 1] - ptsY[0];
  const netDisp = Math.hypot(netX, netY);
  const pathLength = stepLen.reduce((a, b) => a + b, 0);

  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < ptsX.length; i++) {
    meanX += ptsX[i];
    meanY += ptsY[i];
  }
  meanX /= ptsX.length;
  meanY /= ptsY.length;
  let cross = 0;
  for (let i = 0; i < ptsX.length - 1; i++) {
    const ax = ptsX[i] - meanX;
    const ay = ptsY[i] - meanY;
    const bx = ptsX[i + 1] - meanX;
    const by = ptsY[i + 1] - meanY;
    cross += ax * by - bx * ay;
  }
  const signedArea = 0.5 * cross;

  const absDx = Math.abs(netX);
  const absDy = Math.abs(netY);
  const values: Record<string, number> = {
    net_dx: netX,
    net_dy: netY,
    net_displacement: netDisp,
    path_length: pathLength,
    straightness: netDisp / Math.max(pathLength, 1e-6),
    mean_speed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
    max_speed: Math.max(...speeds),
    std_speed: std(speeds),
    signed_area: signedArea,
    reversal_rate_x: reversalRate(stepsX, duration),
    reversal_rate_y: reversalRate(stepsY, duration),
    vertical_ratio: absDy / Math.max(absDx + absDy, 1e-6),
    amplitude_x: Math.max(...ptsX) - Math.min(...ptsX),
    amplitude_y: Math.max(...ptsY) - Math.min(...ptsY),
    total_turning: totalTurning(stepsX, stepsY),
  };
  for (const [name, value] of Object.entries(values)) {
    out[HAND_MOTION_NAMES.indexOf(name as (typeof HAND_MOTION_NAMES)[number])] = value;
  }

  const signalDeltas: Array<[SignalName, string]> = [
    ['open_count', 'delta_open_count'],
    ['spread', 'delta_spread'],
    ['palm_upright', 'delta_palm_upright'],
    ['thumb_index_dist', 'delta_thumb_index_dist'],
    ['mouth_dist', 'delta_mouth_dist'],
  ];
  for (const [signal, label] of signalDeltas) {
    const seriesVals: number[] = [];
    for (let i = 0; i < total; i++) {
      if (mask[i]) seriesVals.push(signals[signal][i]);
    }
    out[HAND_MOTION_NAMES.indexOf(label as (typeof HAND_MOTION_NAMES)[number])] =
      seriesVals[seriesVals.length - 1] - seriesVals[0];
  }

  const openVals: number[] = [];
  const uprightVals: number[] = [];
  const mouthVals: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!mask[i]) continue;
    openVals.push(signals.open_count[i]);
    uprightVals.push(signals.palm_upright[i]);
    mouthVals.push(signals.mouth_dist[i]);
  }
  out[HAND_MOTION_NAMES.indexOf('std_open_count')] = std(openVals);
  out[HAND_MOTION_NAMES.indexOf('std_palm_upright')] = std(uprightVals);
  out[HAND_MOTION_NAMES.indexOf('mean_mouth_dist')] =
    mouthVals.reduce((a, b) => a + b, 0) / mouthVals.length;
  out[HAND_MOTION_NAMES.indexOf('min_mouth_dist')] = Math.min(...mouthVals);
  return out;
}

const BOTH_NAMES = [
  'both_present_ratio',
  'start_hand_distance',
  'end_hand_distance',
  'delta_hand_distance',
  'min_hand_distance',
  'mean_hand_distance',
  'velocity_alignment',
] as const;

function bothHandsFeatures(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(BOTH_NAMES.length);
  const count = left.length / 2;
  if (count === 0) return out;

  const both: boolean[] = [];
  for (let i = 0; i < count; i++) {
    both.push(!Number.isNaN(left[i * 2]) && !Number.isNaN(right[i * 2]));
  }
  out[BOTH_NAMES.indexOf('both_present_ratio')] = nanMean(both);
  const bothCount = both.reduce((n, v) => n + (v ? 1 : 0), 0);
  if (bothCount < 1) return out;

  const gaps: number[] = [];
  const lx: number[] = [];
  const ly: number[] = [];
  const rx: number[] = [];
  const ry: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!both[i]) continue;
    const dx = left[i * 2] - right[i * 2];
    const dy = left[i * 2 + 1] - right[i * 2 + 1];
    gaps.push(Math.hypot(dx, dy));
    lx.push(left[i * 2]);
    ly.push(left[i * 2 + 1]);
    rx.push(right[i * 2]);
    ry.push(right[i * 2 + 1]);
  }
  out[BOTH_NAMES.indexOf('start_hand_distance')] = gaps[0];
  out[BOTH_NAMES.indexOf('end_hand_distance')] = gaps[gaps.length - 1];
  out[BOTH_NAMES.indexOf('delta_hand_distance')] = gaps[gaps.length - 1] - gaps[0];
  out[BOTH_NAMES.indexOf('min_hand_distance')] = Math.min(...gaps);
  out[BOTH_NAMES.indexOf('mean_hand_distance')] = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  if (bothCount >= 2) {
    const cosines: number[] = [];
    for (let i = 1; i < lx.length; i++) {
      const ldx = lx[i] - lx[i - 1];
      const ldy = ly[i] - ly[i - 1];
      const rdx = rx[i] - rx[i - 1];
      const rdy = ry[i] - ry[i - 1];
      const llen = Math.hypot(ldx, ldy);
      const rlen = Math.hypot(rdx, rdy);
      if (llen <= STEP_TOLERANCE || rlen <= STEP_TOLERANCE) continue;
      cosines.push((ldx * rdx + ldy * rdy) / (llen * rlen));
    }
    if (cosines.length > 0) {
      out[BOTH_NAMES.indexOf('velocity_alignment')] =
        cosines.reduce((a, b) => a + b, 0) / cosines.length;
    }
  }
  return out;
}

function lastValidPose(samples: FrameSample[]): Float32Array {
  const left = new Float32Array(FEATURES_PER_HAND);
  const right = new Float32Array(FEATURES_PER_HAND);
  let haveLeft = false;
  let haveRight = false;
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i];
    if (sample.leftOk && !haveLeft) {
      left.set(sample.features.subarray(0, FEATURES_PER_HAND));
      haveLeft = true;
    }
    if (sample.rightOk && !haveRight) {
      right.set(sample.features.subarray(FEATURES_PER_HAND, FRAME_FEATURES));
      haveRight = true;
    }
    if (haveLeft && haveRight) break;
  }
  const out = new Float32Array(FRAME_FEATURES);
  out.set(left, 0);
  out.set(right, FEATURES_PER_HAND);
  return out;
}

/** Empty sample used when no hands are detected this frame. */
export function emptyFrameSample(timestamp: number): FrameSample {
  return {
    features: new Float32Array(FRAME_FEATURES),
    leftOk: false,
    rightOk: false,
    leftWrist: null,
    rightWrist: null,
    palmWidth: 0,
    anchor: null,
    timestamp,
  };
}

/**
 * Summarize a short window of frames into [pose | motion].
 * Mirrors sign_features.build_window_features.
 */
export function buildWindowFeatures(samples: FrameSample[]): WindowSummary {
  if (samples.length === 0) {
    return {
      vector: new Float32Array(TOTAL_FEATURES),
      leftRatio: 0,
      rightRatio: 0,
      motionEnergy: 0,
      duration: 0,
      frames: 0,
    };
  }

  const scale = windowScale(samples);
  const anchors = anchorSeries(samples);
  const left = handSeries(samples, 'left', scale, anchors);
  const right = handSeries(samples, 'right', scale, anchors);
  const leftMotion = handMotionFeatures(left);
  const rightMotion = handMotionFeatures(right);
  const bothMotion = bothHandsFeatures(left.positions, right.positions);

  const vector = new Float32Array(TOTAL_FEATURES);
  vector.set(lastValidPose(samples), 0);
  vector.set(leftMotion, FRAME_FEATURES);
  vector.set(rightMotion, FRAME_FEATURES + MOTION_FEATURES_PER_HAND);
  vector.set(bothMotion, FRAME_FEATURES + MOTION_FEATURES_PER_HAND * 2);

  const energy = Math.max(leftMotion[MEAN_SPEED_INDEX], rightMotion[MEAN_SPEED_INDEX]);
  let leftOkSum = 0;
  let rightOkSum = 0;
  for (const s of samples) {
    if (s.leftOk) leftOkSum += 1;
    if (s.rightOk) rightOkSum += 1;
  }

  return {
    vector,
    leftRatio: leftOkSum / samples.length,
    rightRatio: rightOkSum / samples.length,
    motionEnergy: energy,
    duration: samples[samples.length - 1].timestamp - samples[0].timestamp,
    frames: samples.length,
  };
}
