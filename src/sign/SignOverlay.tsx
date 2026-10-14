/**
 * Draws hand skeletons + an optional labeled bounding box over the camera,
 * matching main.py's mp_drawing.draw_landmarks + draw_box_with_label.
 *
 * Points arrive in upright preview pixels (detection.frame / landmarks.frame).
 * VisionCamera uses resizeMode="cover", so we replicate that cover-fit when
 * mapping onto the view.
 */
import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { HAND_CONNECTIONS } from './config';
import type { LandmarkOverlay, SignDetection } from './types';

/** main.py DrawingSpec color=(227, 224, 113). */
const SKELETON_COLOR = 'rgb(227, 224, 113)';
const DOT_SIZE = 6;
const LINE_THICKNESS = 2;

interface Props {
  detection: SignDetection | null;
  landmarks?: LandmarkOverlay | null;
}

function coverFit(
  viewW: number,
  viewH: number,
  frameW: number,
  frameH: number,
): { scale: number; offsetX: number; offsetY: number; renderedW: number; renderedH: number } {
  const scale = Math.max(viewW / frameW, viewH / frameH);
  const renderedW = frameW * scale;
  const renderedH = frameH * scale;
  return {
    scale,
    renderedW,
    renderedH,
    offsetX: (viewW - renderedW) / 2,
    offsetY: (viewH - renderedH) / 2,
  };
}

function SkeletonBone({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: midX - length / 2,
        top: midY - LINE_THICKNESS / 2,
        width: length,
        height: LINE_THICKNESS,
        backgroundColor: SKELETON_COLOR,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

export function SignOverlay({ detection, landmarks = null }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const skeleton = useMemo(() => {
    if (landmarks == null || landmarks.hands.length === 0 || size.width === 0 || size.height === 0) {
      return null;
    }
    const { frame, hands } = landmarks;
    const fit = coverFit(size.width, size.height, frame.width, frame.height);
    const mapX = (x: number) => fit.offsetX + x * fit.scale;
    const mapY = (y: number) => fit.offsetY + y * fit.scale;

    return (
      <>
        {hands.map((hand, handIdx) => (
          <View key={`hand-${handIdx}`} pointerEvents="none" style={StyleSheet.absoluteFill}>
            {HAND_CONNECTIONS.map(([a, b], i) => {
              const pa = hand[a];
              const pb = hand[b];
              if (pa == null || pb == null) return null;
              return (
                <SkeletonBone
                  key={`c-${handIdx}-${i}`}
                  x1={mapX(pa.x)}
                  y1={mapY(pa.y)}
                  x2={mapX(pb.x)}
                  y2={mapY(pb.y)}
                />
              );
            })}
            {hand.map((p, i) => (
              <View
                key={`p-${handIdx}-${i}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: mapX(p.x) - DOT_SIZE / 2,
                  top: mapY(p.y) - DOT_SIZE / 2,
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: DOT_SIZE / 2,
                  backgroundColor: SKELETON_COLOR,
                }}
              />
            ))}
          </View>
        ))}
      </>
    );
  }, [landmarks, size]);

  const labelBox = useMemo(() => {
    if (detection == null || size.width === 0 || size.height === 0) return null;

    const { box, color, label, frame } = detection;
    const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    const fit = coverFit(size.width, size.height, frame.width, frame.height);

    const left = fit.offsetX + box.x * fit.renderedW;
    const top = fit.offsetY + box.y * fit.renderedH;
    const width = box.width * fit.renderedW;
    const height = box.height * fit.renderedH;

    return (
      <>
        <View
          pointerEvents="none"
          style={[styles.box, { left, top, width, height, borderColor: rgb }]}
        />
        <View
          pointerEvents="none"
          style={[styles.labelChip, { left, top: top + height + 4, backgroundColor: rgb }]}
        >
          <Text style={styles.labelText}>{label}</Text>
        </View>
      </>
    );
  }, [detection, size]);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {skeleton}
      {labelBox}
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
