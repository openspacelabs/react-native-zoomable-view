import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { useLatestCallback } from './useLatestCallback';

export const useZoomSubject = () => {
  const wrapperRef = useRef<View>(null);
  const originalWidth = useSharedValue(0);
  const originalHeight = useSharedValue(0);
  const originalPageX = useSharedValue(0);
  const originalPageY = useSharedValue(0);
  const originalX = useSharedValue(0);
  const originalY = useSharedValue(0);
  const measureZoomSubjectInterval = useRef<NodeJS.Timer>();

  /**
   * Get the original box dimensions and save them for later use.
   * (They will be used to calculate boxBorders)
   *
   * @private
   */
  const measure = useLatestCallback(() => {
    // make sure we measure after animations are complete
    requestAnimationFrame(() => {
      // this setTimeout is here to fix a weird issue on iOS where the measurements are all `0`
      // when navigating back (react-navigation stack) from another view
      // while closing the keyboard at the same time
      setTimeout(() => {
        // In normal conditions, we're supposed to measure zoomSubject instead of its wrapper.
        // However, our zoomSubject may have been transformed by an initial zoomLevel or offset,
        // in which case these measurements will not represent the true "original" measurements.
        // We just need to make sure the zoomSubjectWrapper perfectly aligns with the zoomSubject
        // (no border, space, or anything between them)
        wrapperRef.current?.measure((x, y, width, height, pageX, pageY) => {
          // When the component is off-screen, these become all 0s, so we don't set them
          // to avoid messing up calculations, especially ones that are done right after
          // the component transitions from hidden to visible.
          if (!pageX && !pageY && !width && !height) return;

          originalX.value = x;
          originalY.value = y;
          originalWidth.value = width;
          originalHeight.value = height;
          originalPageX.value = pageX;
          originalPageY.value = pageY;
        });
      });
    });
  });

  useEffect(() => {
    measure();
    // We've already run `grabZoomSubjectOriginalMeasurements` at various events
    // to make sure the measurements are promptly updated.
    // However, there might be cases we haven't accounted for, especially when
    // native processes are involved. To account for those cases,
    // we'll use an interval here to ensure we're always up-to-date.
    // The `setState` in `grabZoomSubjectOriginalMeasurements` won't trigger a rerender
    // if the values given haven't changed, so we're not running performance risk here.
    measureZoomSubjectInterval.current = setInterval(measure, 1e3);

    return () => {
      measureZoomSubjectInterval.current &&
        clearInterval(measureZoomSubjectInterval.current);
    };
  }, []);

  return {
    wrapperRef,
    measure,
    originalWidth,
    originalHeight,
    originalPageX,
    originalPageY,
    originalX,
    originalY,
  };
};
