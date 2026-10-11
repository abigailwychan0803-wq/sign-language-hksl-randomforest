import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScrollingPaginationDots from '@/components/PaginationDots';
import type { OnboardingSlide } from '@/onboarding/slides';

type OnboardingProps = {
  data: OnboardingSlide[];
  onComplete: () => void;
};

const FOOTER_HEIGHT = 132;

function OnboardingSlideView({ item, isActive, width }: { item: OnboardingSlide; isActive: boolean; width: number }) {
  const player = useVideoPlayer(item.video, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.audioMixingMode = 'mixWithOthers';
  });

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  return (
    <View style={[styles.slide, { width }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        surfaceType="textureView"
        allowsPictureInPicture={false}
      />
      <View style={styles.dim} />
      <View style={styles.copy}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    </View>
  );
}

export default function Onboarding({ data, onComplete }: OnboardingProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);
  const scrollX = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  const viewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const onNextPress = () => {
    if (currentIndex < data.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      onComplete();
    }
  };

  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        data={data}
        renderItem={({ item, index }) => (
          <OnboardingSlideView item={item} isActive={index === currentIndex} width={width} />
        )}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onViewableItemsChanged={viewableItemsChanged}
        viewabilityConfig={viewConfig}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <ScrollingPaginationDots
          scrollX={scrollX}
          count={data.length}
          slideWidth={width}
          dotColor="#ffffff"
          inactiveDotColor="#ffffff"
          dotSize={10}
          spacing={12}
          inactiveDotOpacity={0.35}
          maxVisibleDots={5}
        />
        <TouchableOpacity style={styles.nextButton} onPress={onNextPress} activeOpacity={0.8}>
          <Text style={styles.nextButtonText}>
            {currentIndex === data.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  slide: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  copy: {
    paddingHorizontal: 28,
    paddingBottom: FOOTER_HEIGHT + 24,
    gap: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
  },
  description: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 20,
    paddingTop: 8,
  },
  nextButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    minWidth: 200,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
});
