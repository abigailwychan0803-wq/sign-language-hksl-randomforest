/**
 * Rolling motion-window buffer + gates, mirroring RuntimeMotionClassifier.
 */
import { SIGN_CONFIG } from './config';
import {
  buildWindowFeatures,
  emptyFrameSample,
  type FrameSample,
  type WindowSummary,
} from './motionWindow';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SIGNS_JSON = require('@/assets/model/signs.json') as {
  signs?: Array<{ label: string; hands?: string }>;
};

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildHandsMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of SIGNS_JSON.signs ?? []) {
    map[normalizeLabel(entry.label)] = (entry.hands ?? 'one').toLowerCase();
  }
  return map;
}

const HANDS_BY_LABEL = buildHandsMap();

export function handsForLabel(label: string): string {
  return HANDS_BY_LABEL[normalizeLabel(label)] ?? 'one';
}

export function handsPresenceOk(
  handsRequired: string,
  leftRatio: number,
  rightRatio: number,
  minRatio = SIGN_CONFIG.MIN_PRESENCE_RATIO,
): boolean {
  if (handsRequired === 'one') return Math.max(leftRatio, rightRatio) >= minRatio;
  if (handsRequired === 'two') return leftRatio >= minRatio && rightRatio >= minRatio;
  if (handsRequired === 'left') return leftRatio >= minRatio;
  if (handsRequired === 'right') return rightRatio >= minRatio;
  return false;
}

export type MotionRejectReason = 'energy' | 'frames' | null;

export interface MotionRuntimeResult {
  summary: WindowSummary | null;
  moving: boolean;
  rejectReason: MotionRejectReason;
}

export class MotionWindowBuffer {
  private samples: FrameSample[] = [];
  private windowSeconds: number;
  private minFrames: number;

  constructor(
    windowSeconds = SIGN_CONFIG.WINDOW_SECONDS,
    minFrames = SIGN_CONFIG.MIN_WINDOW_FRAMES,
  ) {
    this.windowSeconds = windowSeconds;
    this.minFrames = minFrames;
  }

  get size(): number {
    return this.samples.length;
  }

  reset(): void {
    this.samples = [];
  }

  configureFromSidecar(opts: { windowSeconds?: number; minFrames?: number }): void {
    if (opts.windowSeconds != null && opts.windowSeconds > 0) {
      this.windowSeconds = opts.windowSeconds;
    }
    if (opts.minFrames != null && opts.minFrames > 0) {
      this.minFrames = opts.minFrames;
    }
  }

  add(sample: FrameSample): void {
    this.samples.push(sample);
    if (this.samples.length > SIGN_CONFIG.MAX_BUFFERED_FRAMES) {
      this.samples.splice(0, this.samples.length - SIGN_CONFIG.MAX_BUFFERED_FRAMES);
    }
    const cutoff = sample.timestamp - this.windowSeconds;
    while (this.samples.length > this.minFrames && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  addEmpty(timestamp: number): void {
    this.add(emptyFrameSample(timestamp));
  }

  /**
   * Build window features when enough frames are buffered.
   * Returns energy reject when hands are essentially still.
   */
  evaluate(energyThreshold = SIGN_CONFIG.MOTION_ENERGY_THRESHOLD): MotionRuntimeResult {
    if (this.samples.length < this.minFrames) {
      return { summary: null, moving: false, rejectReason: 'frames' };
    }
    const summary = buildWindowFeatures(this.samples);
    if (summary.motionEnergy < energyThreshold) {
      return { summary, moving: false, rejectReason: 'energy' };
    }
    return { summary, moving: true, rejectReason: null };
  }
}
