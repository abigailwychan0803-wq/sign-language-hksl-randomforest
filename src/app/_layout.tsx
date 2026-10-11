import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { resetTranslationModel, TranslationModelProvider, useTranslationModel } from '@/llm/TranslationModelProvider';
import { OnboardingProvider, resetOnboarding, useOnboarding } from '@/onboarding/OnboardingProvider';

SplashScreen.preventAutoHideAsync();

if (__DEV__) {
  const { registerDevMenuItems } = require('expo-dev-menu') as typeof import('expo-dev-menu');

  registerDevMenuItems([
    {
      name: 'Reset onboarding',
      callback: () => {
        resetOnboarding().then(() => {
          console.log('Onboarding reset. Reload the app to see it again.');
        });
      },
      shouldCollapse: true,
    },
    {
      name: 'Reset translation model',
      callback: () => {
        resetTranslationModel().then(() => {
          console.log('Translation model flag cleared. Reload the app to download it again.');
        });
      },
      shouldCollapse: true,
    },
  ]);
}

export default function RootLayout() {
  return (
    <OnboardingProvider>
      <TranslationModelProvider>
        <RootNavigator />
      </TranslationModelProvider>
    </OnboardingProvider>
  );
}

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { isLoading: isOnboardingLoading, isComplete } = useOnboarding();
  const { isLoading: isModelLoading, isDownloaded } = useTranslationModel();
  const isLoading = isOnboardingLoading || isModelLoading;
  const needsModelDownload = Platform.OS !== 'web' && !isDownloaded;

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!isComplete}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={isComplete && needsModelDownload}>
          <Stack.Screen name="model-download" />
        </Stack.Protected>
        <Stack.Protected guard={isComplete && !needsModelDownload}>
          <Stack.Screen name="index" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
