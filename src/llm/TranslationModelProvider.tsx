import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';

const TRANSLATION_MODEL_DOWNLOADED_KEY = 'digisignhk.translationModelDownloaded';

export function resetTranslationModel() {
  return AsyncStorage.removeItem(TRANSLATION_MODEL_DOWNLOADED_KEY);
}

type TranslationModelContextValue = {
  isLoading: boolean;
  isDownloaded: boolean;
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

export function TranslationModelProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloaded, setIsDownloaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(TRANSLATION_MODEL_DOWNLOADED_KEY)
      .then((value) => {
        if (!cancelled) {
          setIsDownloaded(value === 'true');
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

  const markDownloaded = useCallback(async () => {
    await AsyncStorage.setItem(TRANSLATION_MODEL_DOWNLOADED_KEY, 'true');
    setIsDownloaded(true);
  }, []);

  return (
    <TranslationModelContext.Provider value={{ isLoading, isDownloaded, markDownloaded }}>
      {children}
    </TranslationModelContext.Provider>
  );
}
