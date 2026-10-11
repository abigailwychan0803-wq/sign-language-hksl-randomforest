import { Platform } from 'react-native';

import { polyfillsReady } from '../../polyfills';
import { TRANSLATION_MODEL_ID } from '@/llm/model';

const SAMPLE_GLOSS = 'me search bathroom';

const SYSTEM_PROMPT = `You turn disjointed sign-language glosses into natural language.

The user message is a short sequence of individual sign-language words, written as English glosses. The words are not a grammatical sentence. They may omit articles, pronouns, tense, and word order that spoken English would use. Treat them as one intended meaning.

Do both of these steps:
1. Rewrite the glosses as one natural, grammatical English sentence.
2. Translate that English sentence into one natural French sentence.

Reply with exactly these two lines and no other text:
English: <sentence>
French: <sentence>`;

type PreparedModel = Awaited<ReturnType<typeof loadModel>>;

let preparedModel: Promise<PreparedModel> | null = null;

async function loadModel() {
  const { getModelPath, isModelDownloaded, llama } = await import('@react-native-ai/llama');

  if (!(await isModelDownloaded(TRANSLATION_MODEL_ID))) {
    return null;
  }

  const model = llama.languageModel(getModelPath(TRANSLATION_MODEL_ID), {
    contextParams: {
      n_ctx: 2048,
      n_gpu_layers: 99,
    },
  });
  await model.prepare();
  return model;
}

function getPreparedModel() {
  if (!preparedModel) {
    preparedModel = loadModel().catch((error) => {
      preparedModel = null;
      throw error;
    });
  }
  return preparedModel;
}

export async function composeSampleGloss(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[compose] On-device translation runs on iOS and Android only.');
    return;
  }

  await polyfillsReady;

  const model = await getPreparedModel();
  if (!model) {
    console.log(
      '[compose] Translation model is not downloaded. Finish the model download before composing a sentence.',
    );
    return;
  }

  const { generateText } = await import('ai');
  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: SAMPLE_GLOSS,
  });

  console.log('[compose]', text);
}
