import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
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
  ]);
}

export default function RootLayout() {
  return (
    <OnboardingProvider>
      <RootNavigator />
    </OnboardingProvider>
  );
}

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { isLoading, isComplete } = useOnboarding();

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
        <Stack.Protected guard={isComplete}>
          <Stack.Screen name="index" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
