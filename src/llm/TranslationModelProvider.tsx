import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { isTranslationModelFileReady } from '@/llm/translationModelFile';

const TRANSLATION_MODEL_DOWNLOADED_KEY = 'digisignhk.translationModelDownloaded';

export async function resetTranslationModel() {
  await AsyncStorage.removeItem(TRANSLATION_MODEL_DOWNLOADED_KEY);
  if (Platform.OS !== 'web') {
    const { removeIncompleteTranslationModel } = await import('@/llm/translationModelFile');
    await removeIncompleteTranslationModel();
  }
}

type TranslationModelContextValue = {
  isLoading: boolean;
  isDownloaded: boolean;
  /** Persist success without leaving the download screen (survives app relaunch). */
  persistDownloaded: () => Promise<void>;
  /** Persist if needed and navigate into the main app. */
  markDownloaded: () => Promise<void>;
};

const TranslationModelContext = createContext<TranslationModelContextValue | null>(null);

export function useTranslationModel() {
  const value = use(TranslationModelContext);
  if (!value) {
    throw new Error('useTranslationModel must be used within TranslationModelProvider');
  }
  return value;
}

async function readDownloadedState(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true;
  }

  const flag = await AsyncStorage.getItem(TRANSLATION_MODEL_DOWNLOADED_KEY);
  if (flag !== 'true') {
    return false;
  }

  const fileReady = await isTranslationModelFileReady();
  if (!fileReady) {
    await AsyncStorage.removeItem(TRANSLATION_MODEL_DOWNLOADED_KEY);
    return false;
  }

  return true;
}

export function TranslationModelProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloaded, setIsDownloaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    readDownloadedState()
      .then((downloaded) => {
        if (!cancelled) {
          setIsDownloaded(downloaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsDownloaded(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persistDownloaded = useCallback(async () => {
    const fileReady = await isTranslationModelFileReady();
    if (!fileReady) {
      throw new Error('Translation model file is missing or incomplete.');
    }

    await AsyncStorage.setItem(TRANSLATION_MODEL_DOWNLOADED_KEY, 'true');
  }, []);

  const markDownloaded = useCallback(async () => {
    await persistDownloaded();
    setIsDownloaded(true);
  }, [persistDownloaded]);

  return (
    <TranslationModelContext.Provider
      value={{ isLoading, isDownloaded, persistDownloaded, markDownloaded }}
    >
      {children}
    </TranslationModelContext.Provider>
  );
}
