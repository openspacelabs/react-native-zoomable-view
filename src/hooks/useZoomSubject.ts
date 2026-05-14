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
  const isMounted = useRef(true);

  /**
   * `onLayout` handler for the wrapper `<View>` that hosts `<GestureDetector>`
   * as a child. We must measure the wrapper (NOT a child of `<GestureDetector>`)
   * because callback refs do not propagate through `<GestureDetector>` reliably
   * under Reanimated/Fabric — `wrapperRef.current` stays `null` when the ref is
   * placed on a `<GestureDetector>` descendant, which silently breaks every
   * downstream consumer of `originalWidth/Height` (`_invokeOnTransform`,
   * `onTransformWorklet`, `onStaticPinPositionMoveWorklet`, pinch zoom math).
   *
   * `onLayout` fires natively on every layout pass (mount + future resize)
   * and delivers the layout rect synchronously in the event payload, so we
   * stay clear of iOS's post-keyboard-close measurement-zeroing bug that
   * affects deferred `measure()` reads.
   *
   * `event.nativeEvent.layout` provides PARENT-RELATIVE x/y/width/height.
   * Consumers (`onLayoutWorklet`, `_invokeOnTransform` guard, static-pin
   * guard, pinch handler) only treat `originalWidth/Height` as load-bearing,
   * so the coordinate-space distinction does not affect any gating reaction.
   */
  const measureZoomSubject = useLatestCallback((event: LayoutChangeEvent) => {
    if (!isMounted.current) return;
    const { x, y, width, height } = event.nativeEvent.layout;
    // When the component is off-screen, these become all 0s, so we don't set
    // them to avoid messing up calculations, especially ones that are done
    // right after the component transitions from hidden to visible.
    if (!x && !y && !width && !height) return;
    if (
      originalX.value === x &&
      originalY.value === y &&
      originalWidth.value === width &&
      originalHeight.value === height
    ) {
      return;
    }
    originalX.value = x;
    originalY.value = y;
    originalWidth.value = width;
    originalHeight.value = height;
  });

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    wrapperRef,
    measureZoomSubject,
    originalWidth,
    originalHeight,
    originalX,
    originalY,
  };
};
