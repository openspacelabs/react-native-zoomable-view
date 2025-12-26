"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.ReactNativeZoomableViewContext = exports.ReactNativeZoomableView = void 0;
var _lodash = require("lodash");
var _react = _interopRequireWildcard(require("react"));
var _reactNative = require("react-native");
var _reactNativeGestureHandler = require("react-native-gesture-handler");
var _reactNativeReanimated = _interopRequireWildcard(require("react-native-reanimated"));
var _animations = require("./animations");
var _components = require("./components");
var _StaticPin = require("./components/StaticPin");
var _debugHelper = require("./debugHelper");
var _helper = require("./helper");
var _coordinateConversion = require("./helper/coordinateConversion");
var _getNextZoomStep = require("./helper/getNextZoomStep");
var _useDebugPoints = require("./hooks/useDebugPoints");
var _useLatestCallback = require("./hooks/useLatestCallback");
var _useZoomSubject = require("./hooks/useZoomSubject");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const ReactNativeZoomableViewContext = exports.ReactNativeZoomableViewContext = /*#__PURE__*/_react.default.createContext(undefined);
const ReactNativeZoomableView = (props, ref) => {
  const {
    wrapperRef: zoomSubjectWrapperRef,
    measure: measureZoomSubject,
    originalWidth,
    originalHeight,
    originalX,
    originalY
  } = (0, _useZoomSubject.useZoomSubject)();
  const [pinSize, setPinSize] = (0, _react.useState)({
    width: 0,
    height: 0
  });
  const [stateTouches, setStateTouches] = (0, _react.useState)([]);
  const {
    debugPoints,
    setDebugPoints,
    setPinchDebugPoints
  } = (0, _useDebugPoints.useDebugPoints)();
  const doubleTapFirstTapReleaseTimestamp = (0, _reactNativeReanimated.useSharedValue)(undefined);
  props = (0, _lodash.defaults)({}, props, {
    zoomEnabled: true,
    panEnabled: true,
    initialZoom: 1,
    initialOffsetX: 0,
    initialOffsetY: 0,
    maxZoom: 1.5,
    minZoom: 0.5,
    pinchToZoomInSensitivity: 1,
    pinchToZoomOutSensitivity: 1,
    movementSensibility: 1,
    doubleTapDelay: 300,
    zoomStep: 0.5,
    onLongPress: undefined,
    longPressDuration: 700,
    contentWidth: undefined,
    contentHeight: undefined,
    visualTouchFeedbackEnabled: true,
    staticPinPosition: undefined,
    staticPinIcon: undefined,
    onStaticPinPositionChange: undefined,
    onStaticPinPositionMoveWorklet: undefined,
    disablePanOnInitialZoom: false
  });
  const {
    debug,
    staticPinIcon,
    children,
    visualTouchFeedbackEnabled,
    doubleTapDelay,
    staticPinPosition: propStaticPinPosition,
    contentWidth: propContentWidth,
    contentHeight: propContentHeight,
    onTransformWorklet,
    onStaticPinPositionMoveWorklet,
    zoomEnabled: propZoomEnabled,
    maxZoom: propMaxZoom,
    minZoom: propMinZoom,
    pinchToZoomInSensitivity: propPinchToZoomInSensitivity,
    pinchToZoomOutSensitivity: propPinchToZoomOutSensitivity,
    movementSensibility: propMovementSensibility,
    panEnabled: propPanEnabled,
    disablePanOnInitialZoom: propDisablePanOnInitialZoom,
    initialZoom: propsInitialZoom,
    pinProps
  } = props;
  const offsetX = (0, _reactNativeReanimated.useSharedValue)(0);
  const offsetY = (0, _reactNativeReanimated.useSharedValue)(0);
  const zoom = (0, _reactNativeReanimated.useSharedValue)(1);
  const inverseZoomStyle = (0, _reactNativeReanimated.useAnimatedStyle)(() => ({
    transform: [{
      scale: 1 / zoom.value
    }]
  }));
  const lastGestureCenterPosition = (0, _reactNativeReanimated.useSharedValue)(null);
  const lastGestureTouchDistance = (0, _reactNativeReanimated.useSharedValue)(150);
  const gestureStarted = (0, _reactNativeReanimated.useSharedValue)(false);

  /**
   * Last press time (used to evaluate whether user double tapped)
   */
  const longPressTimeout = (0, _reactNativeReanimated.useSharedValue)(undefined);
  const onTransformInvocationInitialized = (0, _reactNativeReanimated.useSharedValue)(false);
  const singleTapTimeoutId = (0, _react.useRef)();
  const touches = (0, _reactNativeReanimated.useSharedValue)([]);
  const doubleTapFirstTap = (0, _reactNativeReanimated.useSharedValue)(undefined);
  const gestureType = (0, _reactNativeReanimated.useSharedValue)(undefined);
  const staticPinPosition = (0, _reactNativeReanimated.useDerivedValue)(() => propStaticPinPosition);
  const contentWidth = (0, _reactNativeReanimated.useDerivedValue)(() => propContentWidth);
  const contentHeight = (0, _reactNativeReanimated.useDerivedValue)(() => propContentHeight);
  const zoomEnabled = (0, _reactNativeReanimated.useDerivedValue)(() => propZoomEnabled);
  const maxZoom = (0, _reactNativeReanimated.useDerivedValue)(() => propMaxZoom);
  const minZoom = (0, _reactNativeReanimated.useDerivedValue)(() => propMinZoom);
  const pinchToZoomInSensitivity = (0, _reactNativeReanimated.useDerivedValue)(() => propPinchToZoomInSensitivity);
  const pinchToZoomOutSensitivity = (0, _reactNativeReanimated.useDerivedValue)(() => propPinchToZoomOutSensitivity);
  const panEnabled = (0, _reactNativeReanimated.useDerivedValue)(() => propPanEnabled);
  const disablePanOnInitialZoom = (0, _reactNativeReanimated.useDerivedValue)(() => propDisablePanOnInitialZoom);
  const initialZoom = (0, _reactNativeReanimated.useDerivedValue)(() => propsInitialZoom);
  const movementSensibility = (0, _reactNativeReanimated.useDerivedValue)(() => propMovementSensibility);
  const onPanResponderGrant = (0, _useLatestCallback.useLatestCallback)(props.onPanResponderGrant || (() => undefined));
  const onPanResponderEnd = (0, _useLatestCallback.useLatestCallback)(props.onPanResponderEnd || (() => undefined));
  const onZoomEnd = (0, _useLatestCallback.useLatestCallback)(props.onZoomEnd || (() => undefined));
  const onShiftingEnd = (0, _useLatestCallback.useLatestCallback)(props.onShiftingEnd || (() => undefined));

  /**
   * Returns additional information about components current state for external event hooks
   *
   * @returns {{}}
   * @private
   */
  const _getZoomableViewEventObject = (overwriteObj = {}) => {
    'worklet';

    return Object.assign({
      zoomLevel: zoom.value,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
      originalHeight: originalHeight.value,
      originalWidth: originalWidth.value
    }, overwriteObj);
  };
  const _staticPinPosition = () => {
    'worklet';

    if (!staticPinPosition.value) return;
    if (!contentWidth.value || !contentHeight.value) return;
    return (0, _coordinateConversion.viewportPositionToImagePosition)({
      viewportPosition: {
        x: staticPinPosition.value.x,
        y: staticPinPosition.value.y
      },
      imageSize: {
        height: contentHeight.value,
        width: contentWidth.value
      },
      zoomableEvent: _getZoomableViewEventObject({
        offsetX: offsetX.value,
        offsetY: offsetY.value,
        zoomLevel: zoom.value
      })
    });
  };
  const _updateStaticPin = (0, _useLatestCallback.useLatestCallback)(() => {
    const position = _staticPinPosition();
    if (!position) return;
    props.onStaticPinPositionChange?.(position);
  });
  const _addTouch = (0, _useLatestCallback.useLatestCallback)(touch => {
    touches.value.push(touch);
    setStateTouches([...touches.value]);
  });
  const _removeTouch = (0, _useLatestCallback.useLatestCallback)(touch => {
    touches.value.splice(touches.value.indexOf(touch), 1);
    setStateTouches([...touches.value]);
  });
  const onStaticPinPositionChange = (0, _useLatestCallback.useLatestCallback)(props.onStaticPinPositionChange || (() => undefined));
  const debouncedOnStaticPinPositionChange = (0, _react.useMemo)(() => (0, _lodash.debounce)(onStaticPinPositionChange, 100), []);

  /**
   * try to invoke onTransform
   * @private
   */
  const _invokeOnTransform = () => {
    'worklet';

    const zoomableViewEvent = _getZoomableViewEventObject();
    const position = _staticPinPosition();
    if (!zoomableViewEvent.originalWidth || !zoomableViewEvent.originalHeight) return {
      successful: false
    };
    onTransformWorklet?.(zoomableViewEvent);
    if (position) {
      onStaticPinPositionMoveWorklet?.(position);
      (0, _reactNativeReanimated.runOnJS)(debouncedOnStaticPinPositionChange)(position);
    }
    return {
      successful: true
    };
  };
  (0, _react.useLayoutEffect)(() => {
    if (props.initialZoom) zoom.value = props.initialZoom;
    if (props.initialOffsetX != null) offsetX.value = props.initialOffsetX;
    if (props.initialOffsetY != null) offsetY.value = props.initialOffsetY;
  }, []);
  (0, _react.useLayoutEffect)(() => {
    if (!propZoomEnabled && initialZoom.value) {
      zoom.value = initialZoom.value;
    }
  }, [propZoomEnabled]);
  (0, _reactNativeReanimated.useAnimatedReaction)(_getZoomableViewEventObject, () => {
    if (!onTransformInvocationInitialized.value && _invokeOnTransform().successful) {
      onTransformInvocationInitialized.value = true;
      return;
    }
    if (onTransformInvocationInitialized.value) _invokeOnTransform();
  },
  // _invokeOnTransform may cause a re-render, which would call the evaluation again,
  // causing an infinite loop. This deps array prevents the re-evaluation caused
  // by the re-render, thus breaking the infinite loop.
  []);
  const onLayout = (0, _useLatestCallback.useLatestCallback)(props.onLayout || (() => undefined));

  // Handle original measurements changed
  (0, _reactNativeReanimated.useAnimatedReaction)(() => [originalHeight.value, originalWidth.value, originalX.value, originalY.value], () => {
    // We use a custom `onLayout` event, so the clients can stay in-sync
    // with when the internal measurements are actually saved to the state,
    // thus helping them apply transformations at more accurate timings
    const layout = {
      width: originalWidth.value,
      height: originalHeight.value,
      x: originalX.value,
      y: originalY.value
    };
    (0, _reactNativeReanimated.runOnJS)(onLayout)({
      nativeEvent: {
        layout
      }
    });
  });

  // Handle staticPinPosition changed
  (0, _react.useLayoutEffect)(() => {
    if (onTransformInvocationInitialized.value) _invokeOnTransform();
  }, [props.staticPinPosition?.x, props.staticPinPosition?.y]);
  const scheduleLongPressTimeout = (0, _useLatestCallback.useLatestCallback)(e => {
    if (props.onLongPress && props.longPressDuration) {
      longPressTimeout.value = setTimeout(() => {
        props.onLongPress?.(e, _getZoomableViewEventObject());
        longPressTimeout.value = undefined;
      }, props.longPressDuration);
    }
  });
  const clearLongPressTimeout = (0, _useLatestCallback.useLatestCallback)(() => {
    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
      longPressTimeout.value = undefined;
    }
  });
  const _handlePanResponderGrant = e => {
    'worklet';

    (0, _reactNativeReanimated.runOnJS)(scheduleLongPressTimeout)(e);
    (0, _reactNativeReanimated.runOnJS)(onPanResponderGrant)(e, _getZoomableViewEventObject());
    (0, _reactNativeReanimated.cancelAnimation)(zoom);
    (0, _reactNativeReanimated.cancelAnimation)(offsetX);
    (0, _reactNativeReanimated.cancelAnimation)(offsetY);
    gestureStarted.value = true;
  };

  /**
   * Calculates the amount the offset should shift since the last position during panning
   *
   * @param {Vec2D} gestureCenterPoint
   *
   * @private
   */
  const _calcOffsetShiftSinceLastGestureState = gestureCenterPoint => {
    'worklet';

    let shift = null;
    if (lastGestureCenterPosition.value && movementSensibility.value) {
      const dx = gestureCenterPoint.x - lastGestureCenterPosition.value.x;
      const dy = gestureCenterPoint.y - lastGestureCenterPosition.value.y;
      const shiftX = dx / zoom.value / movementSensibility.value;
      const shiftY = dy / zoom.value / movementSensibility.value;
      shift = {
        x: shiftX,
        y: shiftY
      };
    }
    lastGestureCenterPosition.value = gestureCenterPoint;
    return shift;
  };

  /**
   * Handles the pinch movement and zooming
   */
  const _handlePinching = e => {
    'worklet';

    if (!zoomEnabled.value) return;
    const distance = (0, _helper.calcGestureTouchDistance)(e);
    if (!distance) return;
    if (!lastGestureTouchDistance.value) return;

    // define the new zoom level and take zoom level sensitivity into consideration
    const zoomGrowthFromLastGestureState = distance / lastGestureTouchDistance.value;
    lastGestureTouchDistance.value = distance;
    const pinchToZoomSensitivity = zoomGrowthFromLastGestureState < 1 ? pinchToZoomOutSensitivity.value : pinchToZoomInSensitivity.value;
    if (pinchToZoomSensitivity == null) return;
    const deltaGrowth = zoomGrowthFromLastGestureState - 1;
    // 0 - no resistance
    // 10 - 90% resistance
    const deltaGrowthAdjustedBySensitivity = deltaGrowth * (1 - pinchToZoomSensitivity * 9 / 100);
    let newZoomLevel = zoom.value * (1 + deltaGrowthAdjustedBySensitivity);

    // make sure max and min zoom levels are respected
    if (maxZoom.value != null && newZoomLevel > maxZoom.value) {
      newZoomLevel = maxZoom.value;
    }
    if (minZoom.value != null && newZoomLevel < minZoom.value) {
      newZoomLevel = minZoom.value;
    }
    const gestureCenterPoint = (0, _helper.calcGestureCenterPoint)(e);
    if (!gestureCenterPoint) return;
    let zoomCenter = {
      x: gestureCenterPoint.x,
      y: gestureCenterPoint.y
    };
    if (staticPinPosition.value) {
      // When we use a static pin position, the zoom centre is the same as that position,
      // otherwise the pin moves around way too much while zooming.
      zoomCenter = {
        x: staticPinPosition.value.x,
        y: staticPinPosition.value.y
      };
    }

    // Uncomment to debug
    debug && (0, _reactNativeReanimated.runOnJS)(setPinchDebugPoints)(e, zoomCenter);
    const oldOffsetX = offsetX.value;
    const oldOffsetY = offsetY.value;
    const oldScale = zoom.value;
    const newScale = newZoomLevel;
    if (!originalHeight.value || !originalWidth.value) return;
    let newOffsetY = (0, _helper.calcNewScaledOffsetForZoomCentering)(oldOffsetY, originalHeight.value, oldScale, newScale, zoomCenter.y);
    let newOffsetX = (0, _helper.calcNewScaledOffsetForZoomCentering)(oldOffsetX, originalWidth.value, oldScale, newScale, zoomCenter.x);
    const offsetShift = _calcOffsetShiftSinceLastGestureState(gestureCenterPoint);
    if (offsetShift) {
      newOffsetX += offsetShift.x;
      newOffsetY += offsetShift.y;
    }
    offsetX.value = newOffsetX;
    offsetY.value = newOffsetY;
    zoom.value = newScale;
  };

  /**
   * Set the state to offset moved
   *
   * @param {number} newOffsetX
   * @param {number} newOffsetY
   * @returns
   */
  const _setNewOffsetPosition = (newOffsetX, newOffsetY) => {
    'worklet';

    offsetX.value = newOffsetX;
    offsetY.value = newOffsetY;
  };

  /**
   * Handles movement by tap and move
   *
   * @param gestureState
   *
   * @private
   */
  const _handleShifting = e => {
    'worklet';

    // Skips shifting if panEnabled is false or disablePanOnInitialZoom is true and we're on the initial zoom level
    if (!panEnabled.value || disablePanOnInitialZoom.value && zoom.value === initialZoom.value) {
      return;
    }
    const shift = _calcOffsetShiftSinceLastGestureState({
      x: e.allTouches[0].x,
      y: e.allTouches[0].y
    });
    if (!shift) return;
    const newOffsetX = offsetX.value + shift.x;
    const newOffsetY = offsetY.value + shift.y;
    if (debug) {
      const x = e.allTouches[0].x;
      const y = e.allTouches[0].y;
      (0, _reactNativeReanimated.runOnJS)(setDebugPoints)([{
        x,
        y
      }]);
    }
    _setNewOffsetPosition(newOffsetX, newOffsetY);
  };
  const prevZoom = (0, _reactNativeReanimated.useSharedValue)(1);
  const zoomToDestination = (0, _reactNativeReanimated.useSharedValue)(undefined);

  /**
   * Zooms to a specific level. A "zoom center" can be provided, which specifies
   * the point that will remain in the same position on the screen after the zoom.
   * The coordinates of the zoom center is relative to the zoom subject.
   * { x: 0, y: 0 } is the very center of the zoom subject.
   *
   * @param newZoomLevel
   * @param zoomCenter - If not supplied, the container's center is the zoom center
   */
  const publicZoomTo = (0, _useLatestCallback.useLatestCallback)((newZoomLevel, zoomCenter) => {
    if (!props.zoomEnabled) return false;
    if (props.maxZoom && newZoomLevel > props.maxZoom) return false;
    if (props.minZoom && newZoomLevel < props.minZoom) return false;

    // == Trigger Pan Animation to preserve the zoom center while zooming ==
    // See the "Zoom Animation Support" block more details
    zoomToDestination.value = zoomCenter;
    prevZoom.value = zoom.value;

    // == Perform Zoom Animation ==
    zoom.value = (0, _reactNativeReanimated.withTiming)(newZoomLevel, _animations.zoomToAnimation, () => {
      'worlet';

      // == Zoom Animation Ends ==
      zoomToDestination.value = undefined;
    });
    return true;
  });

  // Zoom Animation Support:
  // Adapt offsets when zoom level changes during zoomTo animation
  (0, _reactNativeReanimated.useAnimatedReaction)(() => zoom.value, newZoom => {
    if (!zoomToDestination.value) return;
    offsetX.value = (0, _helper.calcNewScaledOffsetForZoomCentering)(offsetX.value, originalWidth.value, prevZoom.value, newZoom, zoomToDestination.value.x);
    offsetY.value = (0, _helper.calcNewScaledOffsetForZoomCentering)(offsetY.value, originalHeight.value, prevZoom.value, newZoom, zoomToDestination.value.y);
    prevZoom.value = newZoom;
  });

  /**
   * Handles the double tap event
   *
   * @param e
   *
   * @private
   */
  const _handleDoubleTap = (0, _useLatestCallback.useLatestCallback)(e => {
    const {
      onDoubleTapBefore,
      onDoubleTapAfter,
      doubleTapZoomToCenter
    } = props;
    onDoubleTapBefore?.(e, _getZoomableViewEventObject());
    const nextZoomStep = (0, _getNextZoomStep.getNextZoomStep)({
      zoomLevel: zoom.value,
      zoomStep: props.zoomStep,
      maxZoom: props.maxZoom,
      initialZoom: props.initialZoom
    });
    if (nextZoomStep == null) return;

    // define new zoom position coordinates
    const zoomPositionCoordinates = {
      x: e.allTouches[0].x,
      y: e.allTouches[0].y
    };

    // if doubleTapZoomToCenter enabled -> always zoom to center instead
    if (doubleTapZoomToCenter) {
      zoomPositionCoordinates.x = 0;
      zoomPositionCoordinates.y = 0;
    }
    publicZoomTo(nextZoomStep, zoomPositionCoordinates);
    onDoubleTapAfter?.(e, _getZoomableViewEventObject({
      zoomLevel: nextZoomStep
    }));
  });

  /**
   * Check whether the press event is double tap
   * or single tap and handle the event accordingly
   *
   * @param e
   *
   * @private
   */
  const _resolveAndHandleTap = e => {
    const now = Date.now();
    if (doubleTapFirstTapReleaseTimestamp.value && props.doubleTapDelay && now - doubleTapFirstTapReleaseTimestamp.value < props.doubleTapDelay) {
      doubleTapFirstTap.value && _addTouch({
        ...doubleTapFirstTap.value,
        id: now.toString(),
        isSecondTap: true
      });
      singleTapTimeoutId.current && clearTimeout(singleTapTimeoutId.current);
      delete doubleTapFirstTapReleaseTimestamp.value;
      delete singleTapTimeoutId.current;
      delete doubleTapFirstTap.value;
      _handleDoubleTap(e);
    } else {
      doubleTapFirstTapReleaseTimestamp.value = now;
      doubleTapFirstTap.value = {
        id: now.toString(),
        x: e.allTouches[0].x,
        y: e.allTouches[0].y
      };
      _addTouch(doubleTapFirstTap.value);
      singleTapTimeoutId.current = setTimeout(() => {
        delete doubleTapFirstTapReleaseTimestamp.value;
        delete singleTapTimeoutId.current;

        // Pan to the tapped location
        if (props.staticPinPosition && doubleTapFirstTap.value) {
          const tapX = props.staticPinPosition.x - doubleTapFirstTap.value.x;
          const tapY = props.staticPinPosition.y - doubleTapFirstTap.value.y;
          const toX = offsetX.value + tapX / zoom.value;
          const toY = offsetY.value + tapY / zoom.value;
          const animationsDone = (0, _reactNativeReanimated.makeMutable)(0);
          const done = () => {
            'worklet';

            if (++animationsDone.value >= 2) (0, _reactNativeReanimated.runOnJS)(_updateStaticPin)();
          };
          offsetX.value = (0, _reactNativeReanimated.withTiming)(toX, {
            duration: 200
          }, done);
          offsetY.value = (0, _reactNativeReanimated.withTiming)(toY, {
            duration: 200
          }, done);
        }
        props.onSingleTap?.(e, _getZoomableViewEventObject());
      }, props.doubleTapDelay);
    }
  };
  const publicMoveStaticPinTo = (0, _useLatestCallback.useLatestCallback)((position, duration) => {
    const {
      staticPinPosition,
      contentWidth,
      contentHeight
    } = props;
    if (!staticPinPosition) return;
    if (!originalWidth.value || !originalHeight.value) return;
    if (!contentWidth || !contentHeight) return;

    // Offset for the static pin
    const pinX = staticPinPosition.x - originalWidth.value / 2;
    const pinY = staticPinPosition.y - originalHeight.value / 2;
    const newOffsetX = contentWidth / 2 - position.x + pinX / zoom.value;
    const newOffsetY = contentHeight / 2 - position.y + pinY / zoom.value;
    if (duration) {
      offsetX.value = (0, _reactNativeReanimated.withTiming)(newOffsetX, {
        duration
      });
      offsetY.value = (0, _reactNativeReanimated.withTiming)(newOffsetY, {
        duration
      });
    } else {
      offsetX.value = newOffsetX;
      offsetY.value = newOffsetY;
    }
  });

  /**
   * Zooms in or out by a specified change level
   * Use a positive number for `zoomLevelChange` to zoom in
   * Use a negative number for `zoomLevelChange` to zoom out
   *
   * Returns a promise if everything was updated and a boolean, whether it could be updated or if it exceeded the min/max zoom limits.
   *
   * @param {number | null} zoomLevelChange
   *
   * @return {bool}
   */
  const publicZoomBy = (0, _useLatestCallback.useLatestCallback)(zoomLevelChange => {
    // if no zoom level Change given -> just use zoom step
    zoomLevelChange ||= props.zoomStep || 0;
    return publicZoomTo(zoom.value + zoomLevelChange);
  });

  /**
   * Moves the zoomed view to a specified position
   * Returns a promise when finished
   *
   * @param {number} newOffsetX the new position we want to move it to (x-axis)
   * @param {number} newOffsetY the new position we want to move it to (y-axis)
   *
   * @return {bool}
   */
  const publicMoveTo = (0, _useLatestCallback.useLatestCallback)((newOffsetX, newOffsetY) => {
    if (!originalWidth.value || !originalHeight.value) return;
    const offsetX = (newOffsetX - originalWidth.value / 2) / zoom.value;
    const offsetY = (newOffsetY - originalHeight.value / 2) / zoom.value;
    _setNewOffsetPosition(-offsetX, -offsetY);
  });

  /**
   * Moves the zoomed view by a certain amount.
   *
   * Returns a promise when finished
   *
   * @param {number} offsetChangeX the amount we want to move the offset by (x-axis)
   * @param {number} offsetChangeY the amount we want to move the offset by (y-axis)
   *
   * @return {bool}
   */
  const publicMoveBy = (0, _useLatestCallback.useLatestCallback)((offsetChangeX, offsetChangeY) => {
    const newOffsetX = (offsetX.value * zoom.value - offsetChangeX) / zoom.value;
    const newOffsetY = (offsetY.value * zoom.value - offsetChangeY) / zoom.value;
    _setNewOffsetPosition(newOffsetX, newOffsetY);
  });
  (0, _react.useImperativeHandle)(ref, () => ({
    zoomTo: publicZoomTo,
    zoomBy: publicZoomBy,
    moveTo: publicMoveTo,
    moveBy: publicMoveBy,
    moveStaticPinTo: publicMoveStaticPinTo,
    get gestureStarted() {
      return gestureStarted.value;
    }
  }));

  /**
   * Handles the end of touch events
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  const _handlePanResponderEnd = e => {
    'worklet';

    if (!gestureType.value) {
      (0, _reactNativeReanimated.runOnJS)(_resolveAndHandleTap)(e);
    }
    (0, _reactNativeReanimated.runOnJS)(setDebugPoints)([]);
    lastGestureCenterPosition.value = null;
    (0, _reactNativeReanimated.runOnJS)(clearLongPressTimeout)();
    (0, _reactNativeReanimated.runOnJS)(onPanResponderEnd)(e, _getZoomableViewEventObject());
    if (gestureType.value === 'pinch') {
      (0, _reactNativeReanimated.runOnJS)(onZoomEnd)(e, _getZoomableViewEventObject());
    } else if (gestureType.value === 'shift') {
      (0, _reactNativeReanimated.runOnJS)(onShiftingEnd)(e, _getZoomableViewEventObject());
    }
    if (staticPinPosition.value) {
      (0, _reactNativeReanimated.runOnJS)(_updateStaticPin)();
    }
    gestureType.value = undefined;
    gestureStarted.value = false;
  };

  /**
   * Handles the actual movement of our pan responder
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  const _handlePanResponderMove = (e, gestureState) => {
    'worklet';

    // Only supports 2 touches and below,
    // any invalid number will cause the gesture to end.
    if (e.numberOfTouches <= 2) {
      if (!gestureStarted.value) {
        _handlePanResponderGrant(e);
      }
    } else {
      if (gestureStarted.value) {
        _handlePanResponderEnd(e);
      }
      return true;
    }
    if (e.numberOfTouches === 2) {
      (0, _reactNativeReanimated.runOnJS)(clearLongPressTimeout)();

      // change some measurement states when switching gesture to ensure a smooth transition
      if (gestureType.value !== 'pinch') {
        lastGestureCenterPosition.value = (0, _helper.calcGestureCenterPoint)(e);
        lastGestureTouchDistance.value = (0, _helper.calcGestureTouchDistance)(e);
      }
      gestureType.value = 'pinch';
      _handlePinching(e);
    } else if (e.numberOfTouches === 1) {
      const {
        dx,
        dy
      } = gestureState;
      if (longPressTimeout.value && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        (0, _reactNativeReanimated.runOnJS)(clearLongPressTimeout)();
      }

      // change some measurement states when switching gesture to ensure a smooth transition
      if (gestureType.value !== 'shift') {
        lastGestureCenterPosition.value = (0, _helper.calcGestureCenterPoint)(e);
      }
      const isShiftGesture = Math.abs(dx) > 2 || Math.abs(dy) > 2;
      if (isShiftGesture) {
        gestureType.value = 'shift';
        _handleShifting(e);
      }
    }
  };
  const firstTouch = (0, _reactNativeReanimated.useSharedValue)(undefined);
  const gesture = _reactNativeGestureHandler.Gesture.Manual().onTouchesDown((e, stateManager) => {
    // only begin if this is the first touch
    if (!firstTouch.value) {
      stateManager.activate();
      stateManager.begin();
      firstTouch.value = {
        x: e.allTouches[0].x,
        y: e.allTouches[0].y
      };
      _handlePanResponderGrant(e);
    }
  }).onTouchesMove(e => {
    const dx = e.allTouches[0].x - (firstTouch.value?.x || 0);
    const dy = e.allTouches[0].y - (firstTouch.value?.y || 0);
    _handlePanResponderMove(e, {
      dx,
      dy
    });
  }).onTouchesUp((e, stateManager) => {
    // only end if this is the last touch being lifted
    if (e.numberOfTouches === 0) {
      _handlePanResponderEnd(e);
      stateManager.end();
    }
  }).onTouchesCancelled((e, stateManager) => {
    _handlePanResponderEnd(e);
    stateManager.end();
  }).onFinalize(() => {
    firstTouch.value = undefined;
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(ReactNativeZoomableViewContext.Provider, {
    value: {
      zoom,
      offsetX,
      offsetY,
      inverseZoomStyle
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNativeGestureHandler.GestureHandlerRootView, {
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNativeGestureHandler.GestureDetector, {
        gesture: gesture,
        children: /*#__PURE__*/(0, _jsxRuntime.jsxs)(_reactNative.View
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        , {
          style: styles.container,
          ref: zoomSubjectWrapperRef,
          onLayout: measureZoomSubject,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNativeReanimated.default.View, {
            style: [
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            styles.zoomSubject, props.style, (0, _reactNativeReanimated.useAnimatedStyle)(() => {
              return {
                transform: [
                // In RN79, we need to split the scale into X and Y to avoid
                // the content getting pixelated when zooming in
                {
                  scaleX: zoom.value
                }, {
                  scaleY: zoom.value
                }, {
                  translateX: offsetX.value
                }, {
                  translateY: offsetY.value
                }]
              };
            })],
            children: children
          }), visualTouchFeedbackEnabled && stateTouches.map(touch => doubleTapDelay && /*#__PURE__*/(0, _jsxRuntime.jsx)(_components.AnimatedTouchFeedback, {
            x: touch.x,
            y: touch.y,
            animationDuration: doubleTapDelay,
            onAnimationDone: () => {
              _removeTouch(touch);
            }
          }, touch.id)), debugPoints.map(({
            x,
            y
          }, index) => {
            return /*#__PURE__*/(0, _jsxRuntime.jsx)(_debugHelper.DebugTouchPoint, {
              x: x,
              y: y
            }, index);
          }), propStaticPinPosition && /*#__PURE__*/(0, _jsxRuntime.jsx)(_StaticPin.StaticPin, {
            staticPinIcon: staticPinIcon,
            staticPinPosition: propStaticPinPosition,
            pinSize: pinSize,
            setPinSize: setPinSize,
            pinProps: pinProps
          })]
        })
      })
    })
  });
};
exports.ReactNativeZoomableView = ReactNativeZoomableView;
const styles = _reactNative.StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative'
  },
  zoomSubject: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%'
  }
});
var _default = exports.default = ReactNativeZoomableView;
//# sourceMappingURL=ReactNativeZoomableView.js.map