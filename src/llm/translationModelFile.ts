import { TRANSLATION_MODEL_ID } from '@/llm/model';

/** Qwen2.5 1.5B Q4_K_M is ~1.12 GB; reject obvious partial leftovers. */
const MIN_COMPLETE_BYTES = 900_000_000;

export async function isTranslationModelFileReady(): Promise<boolean> {
  const { getModelPath, isModelDownloaded } = await import('@react-native-ai/llama');
  if (!(await isModelDownloaded(TRANSLATION_MODEL_ID))) {
    return false;
  }

  const RNBlobUtil = (await import('react-native-blob-util')).default;
  const path = getModelPath(TRANSLATION_MODEL_ID);
  try {
    const stat = await RNBlobUtil.fs.stat(path);
    return Number(stat.size) >= MIN_COMPLETE_BYTES;
  } catch {
    return false;
  }
}

/** Removes leftover partial files from interrupted downloads. */
export async function removeIncompleteTranslationModel(): Promise<void> {
  const { isModelDownloaded, removeModel } = await import('@react-native-ai/llama');
  if (await isModelDownloaded(TRANSLATION_MODEL_ID)) {
    await removeModel(TRANSLATION_MODEL_ID);
  }
}
