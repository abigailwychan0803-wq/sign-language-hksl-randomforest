import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';

const ONBOARDING_COMPLETE_KEY = 'digisignhk.onboardingComplete';

export function resetOnboarding() {
  return AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
}

type OnboardingContextValue = {
  isLoading: boolean;
  isComplete: boolean;
  complete: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding() {
  const value = use(OnboardingContext);
  if (!value) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return value;
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)
      .then((value) => {
        if (!cancelled) {
          setIsComplete(value === 'true');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsComplete(false);
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

  const complete = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    setIsComplete(true);
  }, []);

  return (
    <OnboardingContext.Provider value={{ isLoading, isComplete, complete }}>
      {children}
    </OnboardingContext.Provider>
  );
}
