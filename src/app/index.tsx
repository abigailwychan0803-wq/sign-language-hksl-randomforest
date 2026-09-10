import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from 'react-native-vision-camera';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { SIGN_CONFIG } from '@/sign/config';
import { ModelPicker } from '@/sign/ModelPicker';
import { SignOverlay } from '@/sign/SignOverlay';
import { isHandLandmarkerAvailable } from '@/sign/handLandmarks';
import type { SignModelId } from '@/sign/models';
import { useSignRecognition } from '@/sign/useSignRecognition';

function CenterMessage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <ThemedView style={styles.center}>
      <SafeAreaView style={styles.centerInner}>
        <ThemedText type="subtitle" style={styles.centerTitle}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="default" themeColor="textSecondary" style={styles.centerTitle}>
            {subtitle}
          </ThemedText>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const format = useCameraFormat(device, [
    { videoResolution: { width: SIGN_CONFIG.ANALYSIS_WIDTH, height: SIGN_CONFIG.ANALYSIS_HEIGHT } },
    { fps: SIGN_CONFIG.CAMERA_FPS },
  ]);
  const fps =
    format != null ? Math.min(SIGN_CONFIG.CAMERA_FPS, format.maxFps) : SIGN_CONFIG.CAMERA_FPS;
  const [modelId, setModelId] = useState<SignModelId>(1);
  const { frameProcessor, detection, isReady, error } = useSignRecognition(modelId);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  if (!isHandLandmarkerAvailable) {
    return (
      <CenterMessage
        title="Sign detection unavailable"
        subtitle="The MediaPipe hand landmarker isn't registered on this platform yet."
      />
    );
  }

  if (!hasPermission) {
    return (
      <CenterMessage
        title="Camera access needed"
        subtitle="Grant camera permission to recognize hand signs in real time."
      />
    );
  }

  if (device == null) {
    return <CenterMessage title="No front camera found" />;
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        fps={fps}
        isActive
        frameProcessor={frameProcessor}
        resizeMode="cover"
        pixelFormat="rgb"
      />
      <SignOverlay detection={detection} />

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <ModelPicker modelId={modelId} onChange={setModelId} />
        {error ? (
          <ThemedText type="small" style={styles.statusText}>
            Model error: {error}
          </ThemedText>
        ) : !isReady ? (
          <ThemedText type="small" style={styles.statusText}>
            Loading sign model…
          </ThemedText>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

export default function HomeScreen() {
  if (Platform.OS === 'web') {
    return (
      <CenterMessage
        title="Open on a device"
        subtitle="Real-time sign recognition runs on Android/iOS using the device camera and on-device models. It isn't supported on web."
      />
    );
  }
  return <CameraScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  centerInner: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  centerTitle: {
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  statusText: {
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
});
