import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { composeSampleGloss } from "@/sign/composeGloss";
import { SIGN_CONFIG } from "@/sign/config";
import { isHandLandmarkerAvailable } from "@/sign/handLandmarks";
import { SignOverlay } from "@/sign/SignOverlay";
import { useSignRecognition } from "@/sign/useSignRecognition";

function CenterMessage({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const [isComposing, setIsComposing] = useState(false);

  async function onComposeSentence() {
    if (isComposing) {
      return;
    }
    setIsComposing(true);
    try {
      await composeSampleGloss();
    } catch (composeError) {
      console.log("[compose] failed", composeError);
    } finally {
      setIsComposing(false);
    }
  }

  return (
    <ThemedView style={styles.center}>
      <SafeAreaView style={styles.centerInner}>
        <ThemedText type="subtitle" style={styles.centerTitle}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            type="default"
            themeColor="textSecondary"
            style={styles.centerTitle}
          >
            {subtitle}
          </ThemedText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compose a sentence from sample sign words"
          disabled={isComposing}
          onPress={onComposeSentence}
          style={({ pressed }) => [
            styles.composeButton,
            pressed && styles.composePressed,
            isComposing && styles.composeDisabled,
          ]}
        >
          <ThemedText type="smallBold" style={styles.composeLabel}>
            {isComposing ? "Composing…" : "Compose sentence"}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const devices = useCameraDevices();
  const frontDevice = useCameraDevice("front");
  const backDevice = useCameraDevice("back");
  // Prefer front (selfie) for signing; fall back to back — Android emulators
  // often ship without a front camera even when the Camera app works.
  const device = frontDevice ?? backDevice;
  const format = useCameraFormat(device, [
    {
      videoResolution: {
        width: SIGN_CONFIG.ANALYSIS_WIDTH,
        height: SIGN_CONFIG.ANALYSIS_HEIGHT,
      },
    },
    { fps: SIGN_CONFIG.CAMERA_FPS },
  ]);
  const fps =
    format != null
      ? Math.min(SIGN_CONFIG.CAMERA_FPS, format.maxFps)
      : SIGN_CONFIG.CAMERA_FPS;
  const { frameProcessor, detection, isReady, error } = useSignRecognition();

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (devices.length === 0) {
      return;
    }
    console.log(
      "[camera] devices",
      devices.map((d) => ({
        id: d.id,
        position: d.position,
        name: d.name,
        physicalDevices: d.physicalDevices,
      })),
    );
  }, [devices]);

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

  // VisionCamera may briefly report [] while ProcessCameraProvider initializes.
  if (devices.length === 0) {
    return (
      <CenterMessage
        title="Looking for camera…"
        subtitle="Initializing camera devices."
      />
    );
  }

  if (device == null) {
    const positions = devices.map((d) => d.position).join(", ") || "none";
    return (
      <CenterMessage
        title="No camera found"
        subtitle={`VisionCamera sees ${devices.length} device(s): ${positions}. On an emulator, enable a virtual camera under Extended controls → Camera.`}
      />
    );
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
  if (Platform.OS === "web") {
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
    backgroundColor: "#000000",
  },
  center: {
    flex: 1,
    justifyContent: "center",
  },
  centerInner: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  centerTitle: {
    textAlign: "center",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  composeButton: {
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  composeLabel: {
    color: "#ffffff",
  },
  composePressed: {
    opacity: 0.85,
  },
  composeDisabled: {
    opacity: 0.6,
  },
  statusText: {
    color: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    overflow: "hidden",
  },
});
