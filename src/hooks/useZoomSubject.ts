import { useEffect, useRef } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { useLatestCallback } from './useLatestCallback';

export const useZoomSubject = () => {
  const wrapperRef = useRef<View>(null);
  const originalWidth = useSharedValue(0);
  const originalHeight = useSharedValue(0);
  const originalX = useSharedValue(0);
  const originalY = useSharedValue(0);

  /**
   * Get the original box dimensions and save them for later use.
   * Uses onLayout dimensions which are in layout-space (unaffected by
   * parent transforms like rotation), unlike View.measure() which
   * returns viewport-space bounding box.
   */
  const measure = useLatestCallback((event?: LayoutChangeEvent) => {
    if (event) {
      const { x, y, width, height } = event.nativeEvent.layout;
      if (!width && !height) return;
      originalX.value = x;
      originalY.value = y;
      originalWidth.value = width;
      originalHeight.value = height;
      return;
    }
    // Fallback for initial mount; use onLayout-captured values if available.
    if (originalWidth.value && originalHeight.value) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        wrapperRef.current?.measure((x, y, width, height, pageX, pageY) => {
          if (!pageX && !pageY && !width && !height) return;
          // Only set if onLayout hasn't provided values yet
          if (originalWidth.value && originalHeight.value) return;
          originalX.value = x;
          originalY.value = y;
          originalWidth.value = width;
          originalHeight.value = height;
        });
      });
    });
  });

  useEffect(() => {
    measure();
  }, []);

  return {
    wrapperRef,
    measure,
    originalWidth,
    originalHeight,
    originalX,
    originalY,
  };
};
