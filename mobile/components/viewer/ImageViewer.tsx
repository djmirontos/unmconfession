import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ZoomableImage } from '@/components/viewer/ZoomableImage';
import { useImageViewerStore, type ViewerImage } from '@/stores/imageViewerStore';

type BodyProps = { images: readonly ViewerImage[]; index: number; close: () => void };

function ViewerBody({ images, index, close }: BodyProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(index);
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <ScrollView
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: index * width, y: 0 }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {images.map((image, i) => (
          <View key={image.uri} style={{ width, height }} className="items-center justify-center">
            <ZoomableImage
              image={image}
              width={width}
              height={height}
              zoomed={zoomed && i === page}
              onZoomChange={setZoomed}
            />
          </View>
        ))}
      </ScrollView>
      <View
        style={{ top: insets.top + 8 }}
        className="absolute left-0 right-0 flex-row items-center justify-between px-4"
        pointerEvents="box-none"
      >
        <Text className="text-sm font-bold text-white" accessibilityLiveRegion="polite">
          {images.length > 1 ? `${page + 1} / ${images.length}` : ''}
        </Text>
        <Pressable
          onPress={close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </>
  );
}

/** Full-screen photo viewer, mounted once at the root. Swipe between photos; pinch or double tap to zoom. */
export function ImageViewer() {
  const { images, index, openId, close } = useImageViewerStore();
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      visible={images.length > 0}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={close}
      statusBarTranslucent
    >
      {/* Android modals render outside the app's root view, so they need their own gesture root. */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
        {images.length > 0 ? <ViewerBody key={openId} images={images} index={index} close={close} /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
