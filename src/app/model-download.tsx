import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TRANSLATION_MODEL_ID } from '@/llm/model';
import { useTranslationModel } from '@/llm/TranslationModelProvider';

export default function ModelDownloadScreen() {
  const theme = useTheme();
  const { markDownloaded } = useTranslationModel();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setProgress(0);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function download() {
      try {
        const { downloadModel } = await import('@react-native-ai/llama');
        await downloadModel(TRANSLATION_MODEL_ID, ({ percentage }) => {
          if (!cancelled) {
            setProgress(percentage);
          }
        });
        if (!cancelled) {
          setProgress(100);
          await markDownloaded();
        }
      } catch (downloadError) {
        if (!cancelled) {
          const message =
            downloadError instanceof Error ? downloadError.message : 'The download failed.';
          setError(message);
        }
      }
    }

    download();

    return () => {
      cancelled = true;
    };
  }, [attempt, markDownloaded]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Downloading translation model
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
          This one-time download stays on your device and turns sign glosses into natural sentences.
          It is about 1.1 GB.
        </ThemedText>

        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: progress }}
          style={[styles.track, { backgroundColor: theme.backgroundElement }]}
        >
          <View style={[styles.fill, { width: `${progress}%`, backgroundColor: theme.text }]} />
        </View>
        <ThemedText type="smallBold" style={styles.percent}>
          {progress}%
        </ThemedText>

        {error ? (
          <>
            <ThemedText type="default" style={styles.error}>
              {error}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            >
              <ThemedText type="smallBold" style={styles.retryLabel}>
                Try again
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={theme.text} />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: Spacing.two,
  },
  fill: {
    height: '100%',
  },
  percent: {
    textAlign: 'center',
  },
  error: {
    textAlign: 'center',
    color: '#c2410c',
  },
  retry: {
    alignSelf: 'center',
    backgroundColor: '#111111',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 30,
  },
  retryPressed: {
    opacity: 0.85,
  },
  retryLabel: {
    color: '#ffffff',
  },
});
