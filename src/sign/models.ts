export type SignModelId = 1 | 2;

export type LabelSidecar = {
  labels: string[];
  input_name: string;
  output_names: string[];
};

export const SIGN_MODEL_OPTIONS: {
  id: SignModelId;
  title: string;
  summary: string;
}[] = [
  {
    id: 1,
    title: "Model 1",
    summary: "love, more, A–E, calmdown, car",
  },
  {
    id: 2,
    title: "Model 2",
    summary: "friend, hello, help, iloveyou, please, pray, stop, yes",
  },
];

// Bundled assets (resolved via metro assetExts: 'onnx'). Paths must be static literals.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL1_ONNX = require("@/assets/model/handshape_classifier_model1.onnx");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL1_LABELS = require("@/assets/model/sign_labels_model1.json") as LabelSidecar;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL2_ONNX = require("@/assets/model/handshape_classifier_model2.onnx");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL2_LABELS = require("@/assets/model/sign_labels_model2.json") as LabelSidecar;

export const SIGN_MODEL_ASSETS: Record<
  SignModelId,
  { onnx: number; labels: LabelSidecar }
> = {
  1: { onnx: MODEL1_ONNX, labels: MODEL1_LABELS },
  2: { onnx: MODEL2_ONNX, labels: MODEL2_LABELS },
};
