/**
 * Loads the ONNX motion classifier and runs inference with confidence/margin gating.
 */
import { Asset } from 'expo-asset';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';

import { SIGN_CONFIG } from './config';
import { SIGN_MODEL, type LabelSidecar } from './models';
import type { SignColor, SignDetection } from './types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SIGNS_JSON = require('@/assets/model/signs.json') as {
  signs?: Array<{ label: string; color?: number[] }>;
  classes?: string[];
  colors?: number[][];
};

const DEFAULT_COLOR: SignColor = [255, 180, 0]; // main.py default (0,180,255) BGR -> RGB

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildColorMap(): Record<string, SignColor> {
  const map: Record<string, SignColor> = {};

  if (Array.isArray(SIGNS_JSON.signs)) {
    for (const entry of SIGNS_JSON.signs) {
      const c = entry.color;
      if (!Array.isArray(c) || c.length !== 3) continue;
      map[normalizeLabel(entry.label)] = [c[2], c[1], c[0]] as SignColor;
    }
    return map;
  }

  const { classes, colors } = SIGNS_JSON;
  if (Array.isArray(classes) && Array.isArray(colors)) {
    for (let i = 0; i < classes.length && i < colors.length; i++) {
      const c = colors[i];
      if (!Array.isArray(c) || c.length !== 3) continue;
      map[normalizeLabel(classes[i])] = [c[2], c[1], c[0]] as SignColor;
    }
  }
  return map;
}

const COLOR_MAP = buildColorMap();

function colorFor(label: string): SignColor {
  return COLOR_MAP[normalizeLabel(label)] ?? DEFAULT_COLOR;
}

/** main.py format_label. */
export function formatLabel(label: string): string {
  const n = normalizeLabel(label);
  if (n === 'iloveyou') return 'I LOVE YOU';
  if (n === 'thankyou') return 'THANK YOU';
  if (n === 'goodnight') return 'GOOD NIGHT';
  if (n === 'hardworking') return 'HARD WORKING';
  if (n === 'calmdown') return 'CALM DOWN';
  return label.toUpperCase();
}

export class SignClassifier {
  private session: InferenceSession | null = null;
  private inputName = 'input';
  private probsOutputName = 'probabilities';
  private labels: string[] = [];
  private nFeatures = 0;
  private featureBuffer: Float32Array | null = null;
  private inputTensor: Tensor | null = null;

  get isReady(): boolean {
    return this.session != null;
  }

  get featureCount(): number {
    return this.nFeatures;
  }

  get sidecar(): LabelSidecar {
    return SIGN_MODEL.labels;
  }

  async unload(): Promise<void> {
    if (this.session != null) {
      try {
        await this.session.release();
      } catch {
        // Session may already be disposed after a failed load.
      }
      this.session = null;
    }
    this.inputTensor = null;
    this.featureBuffer = null;
    this.labels = [];
    this.nFeatures = 0;
  }

  async load(): Promise<void> {
    if (this.session != null) return;

    const sidecar = SIGN_MODEL.labels;
    const asset = Asset.fromModule(SIGN_MODEL.onnx);
    if (!asset.downloaded) {
      await asset.downloadAsync();
    }
    const uri = asset.localUri ?? asset.uri;
    const path = uri.startsWith('file://') ? uri.replace('file://', '') : uri;

    // TreeEnsemble (RandomForest) is validated against sklearn on CPU.
    // CoreML/XNNPACK can silently mis-run ai.onnx.ml operators.
    this.session = await InferenceSession.create(path, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
    });
    this.labels = sidecar.labels;
    this.nFeatures = sidecar.n_features ?? sidecar.window_features ?? 0;
    if (this.nFeatures <= 0) {
      throw new Error('Motion model sidecar is missing n_features / window_features.');
    }
    this.inputName = sidecar.input_name ?? this.session.inputNames[0];
    const outs = this.session.outputNames;
    this.probsOutputName = outs.includes('probabilities') ? 'probabilities' : outs[outs.length - 1];
    this.featureBuffer = new Float32Array(this.nFeatures);
    this.inputTensor = new Tensor('float32', this.featureBuffer, [1, this.nFeatures]);
  }

  /**
   * Run inference on a motion-window feature vector (171-dim for the current model).
   */
  async classify(features: Float32Array): Promise<ClassifyOutcome | null> {
    if (this.session == null || this.inputTensor == null || this.featureBuffer == null) return null;
    if (features.length !== this.nFeatures) return null;

    this.featureBuffer.set(features);
    const output = await this.session.run({ [this.inputName]: this.inputTensor });
    const probsTensor = output[this.probsOutputName];
    if (probsTensor == null) return null;

    const probs = probsTensor.data as Float32Array;
    return this.applyThreshold(probs);
  }

  private applyThreshold(probs: Float32Array | number[]): ClassifyOutcome {
    let bestIdx = 0;
    let best = -Infinity;
    let second = -Infinity;
    for (let i = 0; i < probs.length; i++) {
      const v = probs[i] as number;
      if (v > best) {
        second = best;
        best = v;
        bestIdx = i;
      } else if (v > second) {
        second = v;
      }
    }
    if (second === -Infinity) second = 0;

    const margin = best - second;
    const modelPassed = best >= SIGN_CONFIG.MIN_CONFIDENCE && margin >= SIGN_CONFIG.MARGIN;
    const passed = modelPassed && best >= SIGN_CONFIG.DISPLAY_CONFIDENCE;

    return { label: this.labels[bestIdx], confidence: best, second, margin, modelPassed, passed };
  }
}

export interface ClassifyOutcome {
  label: string;
  confidence: number;
  second: number;
  margin: number;
  modelPassed: boolean;
  passed: boolean;
}

export function detectionFor(
  label: string,
  confidence: number,
  box: { x: number; y: number; width: number; height: number },
  frame: { width: number; height: number },
): SignDetection {
  return {
    label: formatLabel(label),
    confidence,
    box,
    frame,
    color: colorFor(label),
  };
}
