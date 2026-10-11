import { StatusBar } from 'expo-status-bar';

import Onboarding from '@/components/Onboarding';
import { useOnboarding } from '@/onboarding/OnboardingProvider';
import { onboardingSlides } from '@/onboarding/slides';

export default function OnboardingScreen() {
  const { complete } = useOnboarding();

  return (
    <>
      <StatusBar style="light" />
      <Onboarding data={onboardingSlides} onComplete={complete} />
    </>
  );
}
