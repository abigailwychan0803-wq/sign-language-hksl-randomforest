export type OnboardingSlide = {
  id: string;
  title: string;
  description: string;
  video: number;
};

export const onboardingSlides: OnboardingSlide[] = [
  {
    id: 'clock',
    title: 'Recognize signs as they happen',
    description:
      'Point your camera at Hong Kong Sign Language. DigiSignHK follows the motion and names the sign in real time.',
    video: require('@/assets/videos/clock-5b6dddea-bfca-11f1-81c1-f2062fcd9549.mp4'),
  },
  {
    id: 'cute',
    title: 'Built for everyday signs',
    description:
      'From greetings to feelings, the camera watches both hands and matches what it sees to a sign you can read on screen.',
    video: require('@/assets/videos/cute-5c08339a-bd81-11f1-bb3d-f2062fcd9549.mp4'),
  },
  {
    id: 'fever',
    title: 'Ready when you are',
    description:
      'After this, the camera stays open. Sign, and the recognized word appears as soon as the model is ready.',
    video: require('@/assets/videos/fever-4ef9090c-bd88-11f1-8086-f2062fcd9549.mp4'),
  },
];
