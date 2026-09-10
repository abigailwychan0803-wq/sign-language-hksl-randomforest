import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import { SIGN_MODEL_OPTIONS, type SignModelId } from './models';

interface Props {
  modelId: SignModelId;
  onChange: (id: SignModelId) => void;
  disabled?: boolean;
}

export function ModelPicker({ modelId, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => SIGN_MODEL_OPTIONS.find((option) => option.id === modelId) ?? SIGN_MODEL_OPTIONS[0],
    [modelId],
  );

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Selected ${selected.title}. Open model list.`}
        disabled={disabled}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed, disabled && styles.disabled]}
      >
        <ThemedText type="smallBold" style={styles.triggerTitle}>
          {selected.title}
        </ThemedText>
        <ThemedText type="small" style={styles.chevron}>
          {open ? '▲' : '▼'}
        </ThemedText>
      </Pressable>

      {open ? (
        <View style={styles.menu}>
          {SIGN_MODEL_OPTIONS.map((option) => {
            const active = option.id === modelId;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
              >
                <ThemedText type="smallBold" style={styles.optionTitle}>
                  {option.title}
                </ThemedText>
                <ThemedText type="small" style={styles.optionSummary}>
                  {option.summary}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: 220,
    maxWidth: 340,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  triggerTitle: {
    color: '#ffffff',
  },
  chevron: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
  menu: {
    marginTop: Spacing.one,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  optionActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  optionTitle: {
    color: '#ffffff',
  },
  optionSummary: {
    color: '#d4d4d8',
    marginTop: 2,
  },
});
