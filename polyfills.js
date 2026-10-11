import { Platform } from 'react-native';
import structuredClone from '@ungap/structured-clone';

// https://www.react-native-ai.dev/docs/polyfills
// Resolved before the first generateText call so structuredClone and the text
// streams exist when the AI SDK loads.
export const polyfillsReady =
  Platform.OS === 'web'
    ? Promise.resolve()
    : (async () => {
        const { polyfillGlobal } = await import(
          'react-native/Libraries/Utilities/PolyfillFunctions'
        );

        const { TextEncoderStream, TextDecoderStream } = await import(
          '@stardazed/streams-text-encoding'
        );

        if (!('structuredClone' in global)) {
          polyfillGlobal('structuredClone', () => structuredClone);
        }

        polyfillGlobal('TextEncoderStream', () => TextEncoderStream);
        polyfillGlobal('TextDecoderStream', () => TextDecoderStream);
      })();
