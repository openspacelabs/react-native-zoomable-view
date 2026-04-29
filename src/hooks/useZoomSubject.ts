import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useLatestCallback } from './useLatestCallback';

export const useZoomSubject = () => {
  const wrapperRef = useRef<View>(null);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [originalPageX, setOriginalPageX] = useState(0);
  const [originalPageY, setOriginalPageY] = useState(0);
  const [originalX, setOriginalX] = useState(0);
  const [originalY, setOriginalY] = useState(0);
  const measureZoomSubjectInterval = useRef<NodeJS.Timer>();
  const isMounted = useRef(true);

  /**
   * Get the original box dimensions and save them for later use.
   * (They will be used to calculate boxBorders)
   *
   * @private
   */
  const measure = useLatestCallback(() => {
    // make sure we measure after animations are complete
    requestAnimationFrame(() => {
      if (!isMounted.current) return;
      // this setTimeout is here to fix a weird issue on iOS where the measurements are all `0`
      // when navigating back (react-navigation stack) from another view
      // while closing the keyboard at the same time
      setTimeout(() => {
        if (!isMounted.current) return;
        // In normal conditions, we're supposed to measure zoomSubject instead of its wrapper.
        // However, our zoomSubject may have been transformed by an initial zoomLevel or offset,
        // in which case these measurements will not represent the true "original" measurements.
        // We just need to make sure the zoomSubjectWrapper perfectly aligns with the zoomSubject
        // (no border, space, or anything between them)
        wrapperRef.current?.measure((x, y, width, height, pageX, pageY) => {
          if (!isMounted.current) return;
          // When the component is off-screen, these become all 0s, so we don't set them
          // to avoid messing up calculations, especially ones that are done right after
          // the component transitions from hidden to visible.
          if (!pageX && !pageY && !width && !height) return;
          if (
            originalX === x &&
            originalY === y &&
            originalWidth === width &&
            originalHeight === height &&
            originalPageX === pageX &&
            originalPageY === pageY
          ) {
            return;
          }

          setOriginalX(x);
          setOriginalY(y);
          setOriginalWidth(width);
          setOriginalHeight(height);
          setOriginalPageX(pageX);
          setOriginalPageY(pageY);
        });
      });
    });
  });

  useEffect(() => {
    isMounted.current = true;
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
      isMounted.current = false;
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
