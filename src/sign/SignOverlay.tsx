/**
 * Draws a colored bounding box + label over the camera, mirroring main.py's
 * draw_box_with_label. The box arrives in normalized [0,1] frame coordinates and
 * is mapped onto the on-screen camera view.
 *
 * Coordinate mapping note: the box arrives normalized to the upright frame
 * (detection.frame). VisionCamera previews with resizeMode="cover", so we
 * replicate that cover-fit (scale to fill, center-crop the overflow) when
 * mapping the box onto the view. If boxes still appear mirrored/rotated,
 * calibrate via SIGN_CONFIG (FLIP_X / ROTATION).
 */
import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import type { SignDetection } from './types';

interface Props {
  detection: SignDetection | null;
}

export function SignOverlay({ detection }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const rendered = useMemo(() => {
    if (detection == null || size.width === 0 || size.height === 0) return null;

    const { box, color, label, frame } = detection;
    const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

    // Replicate resizeMode="cover": scale the frame to fill the view, centering
    // the overflow that gets cropped on the longer axis.
    const scale = Math.max(size.width / frame.width, size.height / frame.height);
    const renderedW = frame.width * scale;
    const renderedH = frame.height * scale;
    const offsetX = (size.width - renderedW) / 2;
    const offsetY = (size.height - renderedH) / 2;

    const left = offsetX + box.x * renderedW;
    const top = offsetY + box.y * renderedH;
    const width = box.width * renderedW;
    const height = box.height * renderedH;

    return (
      <>
        <View
          pointerEvents="none"
          style={[styles.box, { left, top, width, height, borderColor: rgb }]}
        />
        <View pointerEvents="none" style={[styles.labelChip, { left, top: top + height + 4, backgroundColor: rgb }]}>
          <Text style={styles.labelText}>{label}</Text>
        </View>
      </>
    );
  }, [detection, size]);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {rendered}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
  },
  labelChip: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  labelText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
