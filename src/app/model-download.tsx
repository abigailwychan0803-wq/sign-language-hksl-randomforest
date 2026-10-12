import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Spacing } from "@/constants/theme";
import { TRANSLATION_MODEL_ID } from "@/llm/model";
import {
  isTranslationModelFileReady,
  removeIncompleteTranslationModel,
} from "@/llm/translationModelFile";
import { useTranslationModel } from "@/llm/TranslationModelProvider";
import { ChromaRing } from "@/shared/components/organisms/chroma-ring";
import { AnimatedMeshGradient } from "@/shared/components/organisms/mesh-gradient";
import { AnimatedProgressBar } from "@/shared/components/organisms/progress";

const HORIZONTAL_PADDING = Spacing.four;
const BUTTON_HEIGHT = 56;
const MESH_COLORS = [
  { r: 0.2, g: 0.55, b: 0.95 },
  { r: 0.12, g: 0.35, b: 0.85 },
  { r: 0.08, g: 0.18, b: 0.55 },
  { r: 0.04, g: 0.06, b: 0.2 },
] as const;

export default function ModelDownloadScreen() {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { markDownloaded, persistDownloaded } = useTranslationModel();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const [layout, setLayout] = useState({
    width: window.width,
    height: window.height,
  });

  const contentWidth = layout.width - HORIZONTAL_PADDING * 2;
  const canContinue = isReady && !error && !isContinuing;

  const onScreenLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  }, []);

  const onProgressTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setProgressTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setProgress(0);
    setIsReady(false);
    setAttempt((value) => value + 1);
  }, []);

  const onContinue = useCallback(async () => {
    if (!canContinue) {
      return;
    }

    setIsContinuing(true);
    try {
      await markDownloaded();
    } catch (continueError) {
      const message =
        continueError instanceof Error
          ? continueError.message
          : "Could not continue.";
      setError(message);
      setIsContinuing(false);
    }
  }, [canContinue, markDownloaded]);

  useEffect(() => {
    let cancelled = false;

    async function download() {
      try {
        // Interrupted runs leave a partial file; downloadModel treats any existing
        // file as complete, so clear leftovers before starting.
        await removeIncompleteTranslationModel();
        if (cancelled) {
          return;
        }

        const { downloadModel } = await import("@react-native-ai/llama");
        await downloadModel(TRANSLATION_MODEL_ID, ({ percentage }) => {
          if (!cancelled) {
            setProgress(percentage);
          }
        });

        if (cancelled) {
          return;
        }

        if (!(await isTranslationModelFileReady())) {
          throw new Error(
            "Download finished but the model file is missing or incomplete.",
          );
        }

        // Persist before Continue so a quit here still skips re-download next launch.
        await persistDownloaded();
        if (cancelled) {
          return;
        }

        setProgress(100);
        setIsReady(true);
      } catch (downloadError) {
        if (!cancelled) {
          const message =
            downloadError instanceof Error
              ? downloadError.message
              : "The download failed.";
          setError(message);
          setIsReady(false);
        }
      }
    }

    // Keep commented for now
    download();

    return () => {
      cancelled = true;
    };
  }, [attempt, persistDownloaded]);

  const buttonLabel = error
    ? "Try again"
    : canContinue
      ? "Continue"
      : isContinuing
        ? "Opening…"
        : "Downloading…";

  const buttonContent = (
    <Text
      style={[
        styles.buttonLabel,
        !canContinue && !error && styles.buttonLabelDisabled,
      ]}
    >
      {buttonLabel}
    </Text>
  );

  return (
    <View style={styles.screen} onLayout={onScreenLayout}>
      <StatusBar style="light" />
      {/*
        UI must be a child of the mesh gradient: on Android, Skia's native surface
        paints above sibling React Native views outside this tree.
        Content uses explicit pixel size from onLayout so height cannot collapse.
      */}
      <AnimatedMeshGradient
        width={layout.width}
        height={layout.height}
        speed={0.8}
        contrast={0.65}
        noise={0.35}
        blur={0.55}
        colors={[...MESH_COLORS]}
        animated
        style={{ width: layout.width, height: layout.height }}
      >
        <View
          style={[
            styles.content,
            {
              width: layout.width,
              height: layout.height,
              paddingTop: insets.top + Spacing.five,
              paddingBottom: Math.max(insets.bottom, Spacing.four),
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Getting Ready</Text>
            <Animated.Text
              entering={FadeInDown.delay(1000).duration(550)}
              style={styles.body}
            >
              This one-time download stays on your device and turns sign glosses
              into natural sentences. It is about 1.1 GB.
            </Animated.Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <View style={styles.footer}>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progress }}
              style={styles.progressRow}
            >
              <View
                style={styles.progressTrack}
                onLayout={onProgressTrackLayout}
              >
                {progressTrackWidth > 0 ? (
                  <AnimatedProgressBar
                    progress={progress / 100}
                    width={progressTrackWidth}
                    height={10}
                    borderRadius={99}
                    useGradient
                    gradientColors={["#FFE08A", "#FF7A3D"]}
                    trackColor="rgba(255,255,255,0.28)"
                  />
                ) : null}
              </View>
              <Text style={styles.percent}>{Math.round(progress)}%</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: !canContinue && !error,
              }}
              disabled={!canContinue && !error}
              onPress={error ? retry : onContinue}
              style={({ pressed }) => [
                styles.buttonPressable,
                pressed && (canContinue || !!error) && styles.buttonPressed,
              ]}
            >
              {canContinue ? (
                <ChromaRing
                  width={contentWidth}
                  height={BUTTON_HEIGHT}
                  borderRadius={BUTTON_HEIGHT / 2}
                  borderWidth={2}
                  speed={1.2}
                  base="#2a1a12"
                  glow="#ffe0a8"
                  background="#140a08"
                >
                  {buttonContent}
                </ChromaRing>
              ) : (
                <View
                  style={[
                    styles.plainButton,
                    error ? styles.retryButton : styles.disabledButton,
                    { width: contentWidth, height: BUTTON_HEIGHT },
                  ]}
                >
                  {buttonContent}
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </AnimatedMeshGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#140a08",
  },
  content: {
    justifyContent: "space-between",
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  header: {
    gap: Spacing.three,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 68,
    lineHeight: 68,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    color: "rgba(255,255,255,0.88)",
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: "#FFE4C8",
    backgroundColor: "rgba(20,10,8,0.45)",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    overflow: "hidden",
  },
  footer: {
    gap: Spacing.four,
    width: "100%",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: Spacing.two,
  },
  progressTrack: {
    flex: 1,
    height: 10,
    justifyContent: "center",
    paddingLeft: Spacing.two,
  },
  percent: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    minWidth: 40,
    textAlign: "right",
  },
  buttonPressable: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  plainButton: {
    borderRadius: BUTTON_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    backgroundColor: "rgba(20,10,8,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  retryButton: {
    backgroundColor: "#140a08",
    borderWidth: 1,
    borderColor: "rgba(255,224,168,0.55)",
  },
  buttonLabel: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  buttonLabelDisabled: {
    color: "rgba(255,255,255,0.55)",
  },
});
