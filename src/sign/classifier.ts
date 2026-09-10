/**
 * Loads an ONNX RandomForest and runs inference with the same confidence/margin
 * gating as the Python RuntimeSignClassifier + main.py.
 */
import { Asset } from 'expo-asset';
import { InferenceSession, Tensor, listSupportedBackends } from 'onnxruntime-react-native';
import { Platform } from 'react-native';

import { SIGN_CONFIG, TOTAL_FEATURES } from './config';
import { SIGN_MODEL_ASSETS, type SignModelId } from './models';
import type { SignColor, SignDetection } from './types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SIGNS_JSON = require('@/assets/model/signs.json') as {
  classes: string[];
  colors: number[][];
};

const DEFAULT_COLOR: SignColor = [255, 180, 0]; // main.py default (0,180,255) BGR -> RGB

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildColorMap(): Record<string, SignColor> {
  const map: Record<string, SignColor> = {};
  const { classes, colors } = SIGNS_JSON;
  for (let i = 0; i < classes.length && i < colors.length; i++) {
    const c = colors[i];
    if (!Array.isArray(c) || c.length !== 3) continue;
    // signs.json colors were authored for OpenCV (BGR); reverse to RGB so the
    // on-screen colors match what main.py renders.
    map[normalizeLabel(classes[i])] = [c[2], c[1], c[0]] as SignColor;
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
  if (n === 'calmdown') return 'CALM DOWN';
  return label.toUpperCase();
}

export class SignClassifier {
  private session: InferenceSession | null = null;
  private modelId: SignModelId | null = null;
  private inputName = 'input';
  private probsOutputName = 'probabilities';
  private labels: string[] = [];
  private readonly featureBuffer = new Float32Array(TOTAL_FEATURES);
  private inputTensor: Tensor | null = null;

  get isReady(): boolean {
    return this.session != null;
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
    this.modelId = null;
    this.labels = [];
  }

  async load(modelId: SignModelId): Promise<void> {
    if (this.session != null && this.modelId === modelId) return;

    await this.unload();

    const spec = SIGN_MODEL_ASSETS[modelId];
    const sidecar = spec.labels;
    const asset = Asset.fromModule(spec.onnx);
    if (!asset.downloaded) {
      await asset.downloadAsync();
    }
    const uri = asset.localUri ?? asset.uri;
    const path = uri.startsWith('file://') ? uri.replace('file://', '') : uri;

    const available = new Set(listSupportedBackends().map((b) => b.name));
    // TreeEnsemble (RandomForest) does not map well to NNAPI; it is often
    // slower than CPU and can hitch the UI. Prefer XNNPACK then CPU.
    const executionProviders: Array<'coreml' | 'xnnpack' | 'cpu'> = [];
    if (Platform.OS === 'ios' && available.has('coreml')) {
      executionProviders.push('coreml');
    }
    if (available.has('xnnpack')) {
      executionProviders.push('xnnpack');
    }
    executionProviders.push('cpu');

    this.session = await InferenceSession.create(path, {
      executionProviders,
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
    });
    this.labels = sidecar.labels;
    this.inputName = sidecar.input_name ?? this.session.inputNames[0];
    const outs = this.session.outputNames;
    this.probsOutputName = outs.includes('probabilities') ? 'probabilities' : outs[outs.length - 1];
    this.inputTensor = new Tensor('float32', this.featureBuffer, [1, TOTAL_FEATURES]);
    this.modelId = modelId;
  }

  /**
   * Run inference on a 114-dim feature vector.
   * Gating mirrors OnnxRuntimeSignClassifier._apply_threshold + main2.py consider().
   */
  async classify(features: Float32Array): Promise<ClassifyOutcome | null> {
    if (this.session == null || this.inputTensor == null) return null;
    if (features.length !== TOTAL_FEATURES) return null;

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
  /** Cleared OnnxRuntimeSignClassifier gates (0.55 + margin 0.10). */
  modelPassed: boolean;
  /** Cleared main2.py consider / detect_and_draw gate (>= 0.6). */
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
