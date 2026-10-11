import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

type DotProps = {
  index: number;
  scrollX: SharedValue<number>;
  slideWidth: number;
  dotSize: number;
  spacing: number;
  dotColor: string;
  inactiveDotColor?: string;
  inactiveDotOpacity: number;
  dotStyle?: StyleProp<ViewStyle>;
  maxVisibleDotsForAnimation: number;
};

const Dot = ({
  index,
  scrollX,
  slideWidth,
  dotSize,
  spacing,
  dotColor,
  inactiveDotColor,
  inactiveDotOpacity,
  dotStyle,
  maxVisibleDotsForAnimation,
}: DotProps) => {
  const animatedDotStyle = useAnimatedStyle(() => {
    const currentIndexFloat = scrollX.value / slideWidth;
    const distance = Math.abs(index - currentIndexFloat);
    const fadeRange = (maxVisibleDotsForAnimation - 1) / 4;
    const effectiveFadeRange = Math.max(0.5, fadeRange);
    const opacity = interpolate(
      distance,
      [0, effectiveFadeRange],
      [1, inactiveDotOpacity],
      Extrapolation.CLAMP,
    );

    return { opacity };
  });

  return (
    <Animated.View
      style={[
        styles.dotBase,
        {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize * 2,
          marginHorizontal: spacing / 2,
          backgroundColor: inactiveDotColor || dotColor,
        },
        dotStyle,
        animatedDotStyle,
      ]}
    />
  );
};

type ScrollingPaginationDotsProps = {
  count: number;
  scrollX: SharedValue<number>;
  dotColor: string;
  inactiveDotColor?: string;
  dotSize?: number;
  spacing?: number;
  slideWidth: number;
  containerStyle?: StyleProp<ViewStyle>;
  dotStyle?: StyleProp<ViewStyle>;
  inactiveDotOpacity?: number;
  maxVisibleDots?: number;
};

export default function ScrollingPaginationDots({
  count,
  scrollX,
  dotColor,
  inactiveDotColor,
  dotSize = 8,
  spacing = 8,
  slideWidth,
  containerStyle,
  dotStyle,
  inactiveDotOpacity = 0.3,
  maxVisibleDots = 5,
}: ScrollingPaginationDotsProps) {
  const actualMaxVisibleDots = maxVisibleDots % 2 === 0 ? maxVisibleDots + 1 : maxVisibleDots;
  const numDotsInViewport = Math.min(count, actualMaxVisibleDots);
  const viewportWidth =
    numDotsInViewport > 0
      ? numDotsInViewport * dotSize + (numDotsInViewport > 1 ? (numDotsInViewport - 1) * spacing : 0)
      : 0;

  const animatedInnerContainerStyle = useAnimatedStyle(() => {
    if (count <= actualMaxVisibleDots) {
      return { transform: [{ translateX: 0 }] };
    }

    const currentIndexFloat = scrollX.value / slideWidth;
    const currentDotCenterOffset = currentIndexFloat * (dotSize + spacing) + dotSize / 2;
    const viewportCenter = viewportWidth / 2;
    let translateX = viewportCenter - currentDotCenterOffset;
    const totalDotStripWidth = count * dotSize + (count - 1) * spacing;
    const minTranslateX = viewportWidth - totalDotStripWidth - dotSize;

    translateX = Math.max(minTranslateX, Math.min(0, translateX));

    return { transform: [{ translateX }] };
  });

  if (count <= 0) {
    return null;
  }

  const isScrollable = count > actualMaxVisibleDots;

  return (
    <View
      style={[
        styles.outerContainer,
        { width: viewportWidth },
        !isScrollable && { justifyContent: 'center' },
        containerStyle,
      ]}>
      <Animated.View style={[styles.dotsInnerContainer, isScrollable && animatedInnerContainerStyle]}>
        {Array.from({ length: count }, (_, index) => (
          <Dot
            key={`dot-${index}`}
            index={index}
            scrollX={scrollX}
            slideWidth={slideWidth}
            dotSize={dotSize}
            spacing={spacing}
            dotColor={dotColor}
            inactiveDotColor={inactiveDotColor}
            inactiveDotOpacity={inactiveDotOpacity}
            dotStyle={dotStyle}
            maxVisibleDotsForAnimation={actualMaxVisibleDots}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dotsInnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotBase: {
    borderRadius: 16,
  },
});
