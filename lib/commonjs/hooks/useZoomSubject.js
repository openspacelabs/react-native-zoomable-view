"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useZoomSubject = void 0;
var _react = require("react");
var _reactNativeReanimated = require("react-native-reanimated");
var _useLatestCallback = require("./useLatestCallback");
const useZoomSubject = () => {
  const wrapperRef = (0, _react.useRef)(null);
  const originalWidth = (0, _reactNativeReanimated.useSharedValue)(0);
  const originalHeight = (0, _reactNativeReanimated.useSharedValue)(0);
  const originalX = (0, _reactNativeReanimated.useSharedValue)(0);
  const originalY = (0, _reactNativeReanimated.useSharedValue)(0);
  const measureZoomSubjectInterval = (0, _react.useRef)();

  /**
   * Get the original box dimensions and save them for later use.
   * (They will be used to calculate boxBorders)
   *
   * @private
   */
  const measure = (0, _useLatestCallback.useLatestCallback)(() => {
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
        });
      });
    });
  });
  (0, _react.useEffect)(() => {
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
      measureZoomSubjectInterval.current && clearInterval(measureZoomSubjectInterval.current);
    };
  }, []);
  return {
    wrapperRef,
    measure,
    originalWidth,
    originalHeight,
    originalX,
    originalY
  };
};
exports.useZoomSubject = useZoomSubject;
//# sourceMappingURL=useZoomSubject.js.map