import { debounce, defaults } from 'lodash';
import React, {
  ForwardRefRenderFunction,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  GestureTouchEvent,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { zoomToAnimation } from './animations';
import { AnimatedTouchFeedback } from './components';
import { StaticPin } from './components/StaticPin';
import { DebugTouchPoint } from './debugHelper';
import {
  calcGestureCenterPoint,
  calcGestureTouchDistance,
  calcNewScaledOffsetForZoomCentering,
} from './helper';
import { viewportPositionToImagePosition } from './helper/coordinateConversion';
import { useLatestCallback } from './hooks/useLatestCallback';
import {
  ReactNativeZoomableViewProps,
  TouchPoint,
  Vec2D,
  ZoomableViewEvent,
} from './typings';

type ReactNativeZoomableView = {
  moveTo(newOffsetX: number, newOffsetY: number): void;
  moveBy(offsetChangeX: number, offsetChangeY: number): void;
  zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean;
  zoomBy(zoomLevelChange: number): boolean;
  moveStaticPinTo: (position: Vec2D, duration?: number) => void;
  readonly gestureStarted: boolean;
};

const ReactNativeZoomableView: ForwardRefRenderFunction<
  ReactNativeZoomableView,
  ReactNativeZoomableViewProps
> = (props, ref) => {
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [originalPageX, setOriginalPageX] = useState(0);
  const [originalPageY, setOriginalPageY] = useState(0);
  const [originalX, setOriginalX] = useState(0);
  const [originalY, setOriginalY] = useState(0);
  const [pinSize, setPinSize] = useState({ width: 0, height: 0 });
  const [debugPoints, setDebugPoints] = useState<Vec2D[]>([]);
  const [stateTouches, setStateTouches] = useState<TouchPoint[]>([]);

  const zoomSubjectWrapperRef = useAnimatedRef<View>();
  const doubleTapFirstTapReleaseTimestamp = useSharedValue<number | undefined>(
    undefined
  );

  props = defaults({}, props, {
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
    onStaticPinPositionMove: undefined,
    disablePanOnInitialZoom: false,
  });

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const zoom = useSharedValue(1);
  const lastGestureCenterPosition = useSharedValue<Vec2D | null>(null);
  const lastGestureTouchDistance = useSharedValue<number | null>(150);
  const gestureStarted = useSharedValue(false);

  /**
   * Last press time (used to evaluate whether user double tapped)
   */
  const longPressTimeout = useRef<NodeJS.Timeout>();
  const onTransformInvocationInitialized = useSharedValue(false);
  const singleTapTimeoutId = useRef<NodeJS.Timeout>();
  const touches = useSharedValue<TouchPoint[]>([]);
  const doubleTapFirstTap = useSharedValue<TouchPoint | undefined>(undefined);
  const measureZoomSubjectInterval = useRef<NodeJS.Timer>();
  const gestureType = useSharedValue<'shift' | 'pinch' | undefined>(undefined);

  useLayoutEffect(() => {
    if (props.initialZoom) zoom.value = props.initialZoom;
    if (props.initialOffsetX != null) offsetX.value = props.initialOffsetX;
    if (props.initialOffsetY != null) offsetY.value = props.initialOffsetY;
  }, []);

  const { zoomEnabled } = props;
  const initialZoom = useRef(props.initialZoom);
  initialZoom.current = props.initialZoom;
  useLayoutEffect(() => {
    if (!zoomEnabled && initialZoom.current) {
      zoom.value = initialZoom.current;
    }
  }, [zoomEnabled]);

  useLayoutEffect(() => {
    if (
      !onTransformInvocationInitialized.value &&
      _invokeOnTransform().successful
    ) {
      onTransformInvocationInitialized.value = true;
    }
  }, [originalHeight, originalWidth]);

  const onLayout = useRef(props.onLayout);
  onLayout.current = props.onLayout;

  // Handle original measurements changed
  useLayoutEffect(() => {
    // We use a custom `onLayout` event, so the clients can stay in-sync
    // with when the internal measurements are actually saved to the state,
    // thus helping them apply transformations at more accurate timings
    const layout = {
      width: originalWidth,
      height: originalHeight,
      x: originalX,
      y: originalY,
    };
    onLayout.current?.({ nativeEvent: { layout } });

    if (onTransformInvocationInitialized.value) _invokeOnTransform();
  }, [
    originalHeight,
    originalWidth,
    originalPageX,
    originalPageY,
    originalX,
    originalY,
  ]);

  // Handle staticPinPosition changed
  useLayoutEffect(() => {
    if (onTransformInvocationInitialized.value) _invokeOnTransform();
  }, [props.staticPinPosition?.x, props.staticPinPosition?.y]);

  useEffect(() => {
    measureZoomSubject();
    // We've already run `grabZoomSubjectOriginalMeasurements` at various events
    // to make sure the measurements are promptly updated.
    // However, there might be cases we haven't accounted for, especially when
    // native processes are involved. To account for those cases,
    // we'll use an interval here to ensure we're always up-to-date.
    // The `setState` in `grabZoomSubjectOriginalMeasurements` won't trigger a rerender
    // if the values given haven't changed, so we're not running performance risk here.
    measureZoomSubjectInterval.current = setInterval(measureZoomSubject, 1e3);

    return () => {
      measureZoomSubjectInterval.current &&
        clearInterval(measureZoomSubjectInterval.current);
    };
  }, []);

  const onStaticPinPositionChange = useLatestCallback(
    props.onStaticPinPositionChange || (() => undefined)
  );

  const debouncedOnStaticPinPositionChange = useMemo(
    () => debounce(onStaticPinPositionChange, 100),
    []
  );

  /**
   * Returns additional information about components current state for external event hooks
   *
   * @returns {{}}
   * @private
   */
  const _getZoomableViewEventObject = (
    overwriteObj: Partial<ZoomableViewEvent> = {}
  ): ZoomableViewEvent => {
    'worklet';

    return Object.assign(
      {
        zoomLevel: zoom.value,
        offsetX: offsetX.value,
        offsetY: offsetY.value,
        originalHeight,
        originalWidth,
        originalPageX,
        originalPageY,
      },
      overwriteObj
    );
  };

  const _staticPinPosition = () => {
    'worklet';

    if (!props.staticPinPosition) return;
    if (!props.contentWidth || !props.contentHeight) return;

    return viewportPositionToImagePosition({
      viewportPosition: {
        x: props.staticPinPosition.x,
        y: props.staticPinPosition.y,
      },
      imageSize: {
        height: props.contentHeight,
        width: props.contentWidth,
      },
      zoomableEvent: _getZoomableViewEventObject({
        offsetX: offsetX.value,
        offsetY: offsetY.value,
        zoomLevel: zoom.value,
      }),
    });
  };

  /**
   * try to invoke onTransform
   * @private
   */
  const _invokeOnTransform = () => {
    'worklet';

    const zoomableViewEvent = _getZoomableViewEventObject();
    const position = _staticPinPosition();

    if (!zoomableViewEvent.originalWidth || !zoomableViewEvent.originalHeight)
      return { successful: false };

    props.onTransformWorklet?.(zoomableViewEvent);

    if (position) {
      if (props.onStaticPinPositionMove)
        runOnJS(props.onStaticPinPositionMove)(position);

      runOnJS(debouncedOnStaticPinPositionChange)(position);
    }

    return { successful: true };
  };

  /**
   * Get the original box dimensions and save them for later use.
   * (They will be used to calculate boxBorders)
   *
   * @private
   */
  const measureZoomSubject = useLatestCallback(() => {
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
        zoomSubjectWrapperRef.current?.measure(
          (x, y, width, height, pageX, pageY) => {
            // When the component is off-screen, these become all 0s, so we don't set them
            // to avoid messing up calculations, especially ones that are done right after
            // the component transitions from hidden to visible.
            if (!pageX && !pageY && !width && !height) return;

            setOriginalX(x);
            setOriginalY(y);
            setOriginalWidth(width);
            setOriginalHeight(height);
            setOriginalPageX(pageX);
            setOriginalPageY(pageY);
          }
        );
      });
    });
  });

  const scheduleLongPressTimeout = useLatestCallback((e: GestureTouchEvent) => {
    if (props.onLongPress && props.longPressDuration) {
      longPressTimeout.current = setTimeout(() => {
        props.onLongPress?.(e, _getZoomableViewEventObject());
        longPressTimeout.current = undefined;
      }, props.longPressDuration);
    }
  });
  const clearLongPressTimeout = useLatestCallback(() => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = undefined;
    }
  });

  const _handlePanResponderGrant = (e: GestureTouchEvent) => {
    'worklet';

    runOnJS(scheduleLongPressTimeout)(e);

    if (props.onPanResponderGrant)
      runOnJS(props.onPanResponderGrant)(e, _getZoomableViewEventObject());

    cancelAnimation(zoom);
    cancelAnimation(offsetX);
    cancelAnimation(offsetY);
    gestureStarted.value = true;
  };

  /**
   * Handles the end of touch events
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  const _handlePanResponderEnd = (e: GestureTouchEvent) => {
    'worklet';

    if (!gestureType.value) {
      _resolveAndHandleTap(e);
    }

    setDebugPoints([]);

    lastGestureCenterPosition.value = null;

    runOnJS(clearLongPressTimeout)();

    if (props.onPanResponderEnd)
      runOnJS(props.onPanResponderEnd)(e, _getZoomableViewEventObject());

    if (gestureType.value === 'pinch') {
      if (props.onZoomEnd)
        runOnJS(props.onZoomEnd)(e, _getZoomableViewEventObject());
    } else if (gestureType.value === 'shift') {
      if (props.onShiftingEnd)
        runOnJS(props.onShiftingEnd)(e, _getZoomableViewEventObject());
    }

    if (props.staticPinPosition) {
      runOnJS(_updateStaticPin)();
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
  const _handlePanResponderMove = (e: GestureTouchEvent) => {
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
    const newGestureCenterPosition = calcGestureCenterPoint(e);
    let dx = 0;
    let dy = 0;

    if (newGestureCenterPosition && lastGestureCenterPosition.value) {
      dx = newGestureCenterPosition.x - lastGestureCenterPosition.value.x;
      dy = newGestureCenterPosition.y - lastGestureCenterPosition.value.y;
    }

    lastGestureCenterPosition.value = newGestureCenterPosition;

    if (e.numberOfTouches === 2) {
      runOnJS(clearLongPressTimeout);

      // change some measurement states when switching gesture to ensure a smooth transition
      if (gestureType.value !== 'pinch') {
        lastGestureTouchDistance.value = calcGestureTouchDistance(e);
      }
      gestureType.value = 'pinch';
      _handlePinching(e);
    } else if (e.numberOfTouches === 1) {
      if (longPressTimeout.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        runOnJS(clearLongPressTimeout)();
      }

      const isShiftGesture = Math.abs(dx) > 2 || Math.abs(dy) > 2;
      if (isShiftGesture) {
        gestureType.value = 'shift';
        _handleShifting(e);
      }
    }
  };

  /**
   * Handles the pinch movement and zooming
   */
  const _handlePinching = (e: GestureTouchEvent) => {
    'worklet';

    if (!props.zoomEnabled) return;

    const {
      maxZoom,
      minZoom,
      pinchToZoomInSensitivity,
      pinchToZoomOutSensitivity,
    } = props;

    const distance = calcGestureTouchDistance(e);

    // TODO this gets called way too often, we need to find a better way
    // if (
    //   props.onZoomBefore &&
    //   props.onZoomBefore(e, _getZoomableViewEventObject())
    // ) {
    //   return;
    // }

    if (!distance) return;
    if (!lastGestureTouchDistance.value) return;

    // define the new zoom level and take zoom level sensitivity into consideration
    const zoomGrowthFromLastGestureState =
      distance / lastGestureTouchDistance.value;
    lastGestureTouchDistance.value = distance;

    const pinchToZoomSensitivity =
      zoomGrowthFromLastGestureState < 1
        ? pinchToZoomOutSensitivity
        : pinchToZoomInSensitivity;

    if (pinchToZoomSensitivity == null) return;
    const deltaGrowth = zoomGrowthFromLastGestureState - 1;
    // 0 - no resistance
    // 10 - 90% resistance
    const deltaGrowthAdjustedBySensitivity =
      deltaGrowth * (1 - (pinchToZoomSensitivity * 9) / 100);

    let newZoomLevel = zoom.value * (1 + deltaGrowthAdjustedBySensitivity);

    // make sure max and min zoom levels are respected
    if (maxZoom != null && newZoomLevel > maxZoom) {
      newZoomLevel = maxZoom;
    }

    if (minZoom != null && newZoomLevel < minZoom) {
      newZoomLevel = minZoom;
    }

    const gestureCenterPoint = calcGestureCenterPoint(e);

    if (!gestureCenterPoint) return;

    let zoomCenter = {
      x: gestureCenterPoint.x - originalPageX,
      y: gestureCenterPoint.y - originalPageY,
    };

    if (props.staticPinPosition) {
      // When we use a static pin position, the zoom centre is the same as that position,
      // otherwise the pin moves around way too much while zooming.
      zoomCenter = {
        x: props.staticPinPosition.x,
        y: props.staticPinPosition.y,
      };
    }

    // Uncomment to debug
    props.debug && _setPinchDebugPoints(e, zoomCenter);

    const oldOffsetX = offsetX.value;
    const oldOffsetY = offsetY.value;
    const oldScale = zoom.value;
    const newScale = newZoomLevel;

    if (!originalHeight || !originalWidth) return;

    let newOffsetY = calcNewScaledOffsetForZoomCentering(
      oldOffsetY,
      originalHeight,
      oldScale,
      newScale,
      zoomCenter.y
    );
    let newOffsetX = calcNewScaledOffsetForZoomCentering(
      oldOffsetX,
      originalWidth,
      oldScale,
      newScale,
      zoomCenter.x
    );

    const offsetShift =
      _calcOffsetShiftSinceLastGestureState(gestureCenterPoint);
    if (offsetShift) {
      newOffsetX += offsetShift.x;
      newOffsetY += offsetShift.y;
    }

    offsetX.value = newOffsetX;
    offsetY.value = newOffsetY;
    zoom.value = newScale;

    // TODO this gets called way too often, we need to find a better way
    // if (props.onZoomAfter)
    //   runOnJS(props.onZoomAfter)(e, _getZoomableViewEventObject());
  };

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const _setPinchDebugPoints = useLatestCallback(
    (e: GestureTouchEvent, zoomCenter: Vec2D, ...points: Vec2D[]) => {
      setDebugPoints([
        {
          x: e.allTouches[0].absoluteX - originalPageX,
          y: e.allTouches[0].absoluteY - originalPageY,
        },
        {
          x: e.allTouches[1].absoluteX - originalPageX,
          y: e.allTouches[1].absoluteY - originalPageY,
        },
        zoomCenter,
        ...points,
      ]);
    }
  );

  /**
   * Calculates the amount the offset should shift since the last position during panning
   *
   * @param {Vec2D} gestureCenterPoint
   *
   * @private
   */
  const _calcOffsetShiftSinceLastGestureState = (gestureCenterPoint: Vec2D) => {
    'worklet';

    const { movementSensibility } = props;

    let shift = null;

    if (lastGestureCenterPosition.value && movementSensibility) {
      const dx = gestureCenterPoint.x - lastGestureCenterPosition.value.x;
      const dy = gestureCenterPoint.y - lastGestureCenterPosition.value.y;

      const shiftX = dx / zoom.value / movementSensibility;
      const shiftY = dy / zoom.value / movementSensibility;

      shift = {
        x: shiftX,
        y: shiftY,
      };
    }

    lastGestureCenterPosition.value = gestureCenterPoint;

    return shift;
  };

  /**
   * Handles movement by tap and move
   *
   * @param gestureState
   *
   * @private
   */
  const _handleShifting = (e: GestureTouchEvent) => {
    'worklet';
    // Skips shifting if panEnabled is false or disablePanOnInitialZoom is true and we're on the initial zoom level
    if (
      !props.panEnabled ||
      (props.disablePanOnInitialZoom && zoom.value === props.initialZoom)
    ) {
      return;
    }
    const shift = _calcOffsetShiftSinceLastGestureState({
      x: e.allTouches[0].absoluteX,
      y: e.allTouches[0].absoluteY,
    });
    if (!shift) return;

    const newOffsetX = offsetX.value + shift.x;
    const newOffsetY = offsetY.value + shift.y;

    if (props.debug && originalPageX && originalPageY) {
      const x = e.allTouches[0].absoluteX - originalPageX;
      const y = e.allTouches[0].absoluteY - originalPageY;
      setDebugPoints([{ x, y }]);
    }

    _setNewOffsetPosition(newOffsetX, newOffsetY);
  };

  /**
   * Set the state to offset moved
   *
   * @param {number} newOffsetX
   * @param {number} newOffsetY
   * @returns
   */
  const _setNewOffsetPosition = (newOffsetX: number, newOffsetY: number) => {
    'worklet';

    const { onShiftingBefore, onShiftingAfter } = props;

    // TODO this gets called way too often, we need to find a better way
    // if (onShiftingBefore?.(null, _getZoomableViewEventObject())) {
    //   return;
    // }

    offsetX.value = newOffsetX;
    offsetY.value = newOffsetY;

    // TODO this gets called way too often, we need to find a better way
    // onShiftingAfter?.(null, _getZoomableViewEventObject());
  };

  /**
   * Check whether the press event is double tap
   * or single tap and handle the event accordingly
   *
   * @param e
   *
   * @private
   */
  const _resolveAndHandleTap = (e: GestureTouchEvent) => {
    const now = Date.now();
    if (
      doubleTapFirstTapReleaseTimestamp.value &&
      props.doubleTapDelay &&
      now - doubleTapFirstTapReleaseTimestamp.value < props.doubleTapDelay
    ) {
      doubleTapFirstTap.value &&
        _addTouch({
          ...doubleTapFirstTap.value,
          id: now.toString(),
          isSecondTap: true,
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
        x: e.allTouches[0].absoluteX - originalPageX,
        y: e.allTouches[0].absoluteY - originalPageY,
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

          let xAnimationFinished = false;
          let yAnimationFinished = false;

          offsetX.value = withTiming(toX, { duration: 200 }, () => {
            xAnimationFinished = true;
            if (yAnimationFinished) runOnJS(_updateStaticPin)();
          });
          offsetY.value = withTiming(toY, { duration: 200 }, () => {
            yAnimationFinished = true;
            if (xAnimationFinished) runOnJS(_updateStaticPin)();
          });
        }

        props.onSingleTap?.(e, _getZoomableViewEventObject());
      }, props.doubleTapDelay);
    }
  };

  const publicMoveStaticPinTo = useLatestCallback(
    (position: Vec2D, duration?: number) => {
      const { staticPinPosition, contentWidth, contentHeight } = props;

      if (!staticPinPosition) return;
      if (!originalWidth || !originalHeight) return;
      if (!contentWidth || !contentHeight) return;

      // Offset for the static pin
      const pinX = staticPinPosition.x - originalWidth / 2;
      const pinY = staticPinPosition.y - originalHeight / 2;

      const newOffsetX = contentWidth / 2 - position.x + pinX / zoom.value;
      const newOffsetY = contentHeight / 2 - position.y + pinY / zoom.value;

      if (duration) {
        offsetX.value = withTiming(newOffsetX, { duration });
        offsetY.value = withTiming(newOffsetY, { duration });
      } else {
        offsetX.value = newOffsetX;
        offsetY.value = newOffsetY;
      }
    }
  );

  const _updateStaticPin = useLatestCallback(() => {
    const position = _staticPinPosition();
    if (!position) return;
    props.onStaticPinPositionChange?.(position);
  });

  const _addTouch = useLatestCallback((touch: TouchPoint) => {
    touches.value.push(touch);
    setStateTouches([...touches.value]);
  });

  const _removeTouch = useLatestCallback((touch: TouchPoint) => {
    touches.value.splice(touches.value.indexOf(touch), 1);
    setStateTouches([...touches.value]);
  });

  /**
   * Handles the double tap event
   *
   * @param e
   *
   * @private
   */
  const _handleDoubleTap = useLatestCallback((e: GestureTouchEvent) => {
    const { onDoubleTapBefore, onDoubleTapAfter, doubleTapZoomToCenter } =
      props;

    onDoubleTapBefore?.(e, _getZoomableViewEventObject());

    const nextZoomStep = _getNextZoomStep();
    if (nextZoomStep == null) return;

    // define new zoom position coordinates
    const zoomPositionCoordinates = {
      x: e.allTouches[0].absoluteX - originalPageX,
      y: e.allTouches[0].absoluteY - originalPageY,
    };

    // if doubleTapZoomToCenter enabled -> always zoom to center instead
    if (doubleTapZoomToCenter) {
      zoomPositionCoordinates.x = 0;
      zoomPositionCoordinates.y = 0;
    }

    publicZoomTo(nextZoomStep, zoomPositionCoordinates);

    onDoubleTapAfter?.(
      e,
      _getZoomableViewEventObject({ zoomLevel: nextZoomStep })
    );
  });

  /**
   * Returns the next zoom step based on current step and zoomStep property.
   * If we are zoomed all the way in -> return to initialzoom
   *
   * @returns {*}
   */
  const _getNextZoomStep = useLatestCallback(() => {
    const { zoomStep, maxZoom, initialZoom } = props;

    if (maxZoom == null) return;

    if (zoom.value.toFixed(2) === maxZoom.toFixed(2)) {
      return initialZoom;
    }

    if (zoomStep == null) return;

    const nextZoomStep = zoom.value * (1 + zoomStep);
    if (nextZoomStep > maxZoom) {
      return maxZoom;
    }

    return nextZoomStep;
  });

  /**
   * Zooms to a specific level. A "zoom center" can be provided, which specifies
   * the point that will remain in the same position on the screen after the zoom.
   * The coordinates of the zoom center is relative to the zoom subject.
   * { x: 0, y: 0 } is the very center of the zoom subject.
   *
   * @param newZoomLevel
   * @param zoomCenter - If not supplied, the container's center is the zoom center
   */
  const publicZoomTo = useLatestCallback(
    (newZoomLevel: number, zoomCenter?: Vec2D) => {
      if (!props.zoomEnabled) return false;
      if (props.maxZoom && newZoomLevel > props.maxZoom) return false;
      if (props.minZoom && newZoomLevel < props.minZoom) return false;

      props.onZoomBefore?.(null, _getZoomableViewEventObject());

      // == Trigger Pan Animation to preserve the zoom center while zooming ==
      // See the "Zoom Animation Support" block more details
      zoomToDestination.value = zoomCenter;
      prevZoom.value = zoom.value;

      // == Perform Zoom Animation ==
      zoom.value = withTiming(newZoomLevel, zoomToAnimation, () => {
        'worlet';

        // == Zoom Animation Ends ==
        zoomToDestination.value = undefined;
        props.onZoomAfter?.(null, _getZoomableViewEventObject());
      });

      return true;
    }
  );

  const prevZoom = useSharedValue(zoom.value);
  const zoomToDestination = useSharedValue<Vec2D | undefined>(undefined);

  // Zoom Animation Support:
  // Adapt offsets when zoom level changes during zoomTo animation
  useAnimatedReaction(
    () => zoom.value,
    (newZoom) => {
      if (!zoomToDestination.value) return;
      offsetX.value = calcNewScaledOffsetForZoomCentering(
        offsetX.value,
        originalWidth,
        prevZoom.value,
        newZoom,
        zoomToDestination.value.x
      );
      offsetY.value = calcNewScaledOffsetForZoomCentering(
        offsetY.value,
        originalHeight,
        prevZoom.value,
        newZoom,
        zoomToDestination.value.y
      );
      prevZoom.value = newZoom;
    }
  );

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
  const publicZoomBy = useLatestCallback((zoomLevelChange: number) => {
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
  const publicMoveTo = useLatestCallback(
    (newOffsetX: number, newOffsetY: number) => {
      if (!originalWidth || !originalHeight) return;

      const offsetX = (newOffsetX - originalWidth / 2) / zoom.value;
      const offsetY = (newOffsetY - originalHeight / 2) / zoom.value;

      _setNewOffsetPosition(-offsetX, -offsetY);
    }
  );

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
  const publicMoveBy = useLatestCallback(
    (offsetChangeX: number, offsetChangeY: number) => {
      const newOffsetX =
        (offsetX.value * zoom.value - offsetChangeX) / zoom.value;
      const newOffsetY =
        (offsetY.value * zoom.value - offsetChangeY) / zoom.value;

      _setNewOffsetPosition(newOffsetX, newOffsetY);
    }
  );

  useImperativeHandle(ref, () => ({
    zoomTo: publicZoomTo,
    zoomBy: publicZoomBy,
    moveTo: publicMoveTo,
    moveBy: publicMoveBy,
    moveStaticPinTo: publicMoveStaticPinTo,
    get gestureStarted() {
      return gestureStarted.value;
    },
  }));

  const {
    staticPinIcon,
    children,
    visualTouchFeedbackEnabled,
    doubleTapDelay,
    staticPinPosition,
    onStaticPinLongPress,
    onStaticPinPress,
    pinProps,
  } = props;

  useAnimatedReaction(
    () => [zoom.value, offsetX.value, offsetY.value],
    () => {
      if (onTransformInvocationInitialized.value) _invokeOnTransform();
    }
  );

  const gesture = Gesture.Manual()
    .onTouchesDown((e) => {
      console.log('start', e);
      _handlePanResponderGrant(e);
    })
    .onTouchesMove((e) => {
      console.log('move', e);
      _handlePanResponderMove(e);
    })
    .onFinalize((e) => {
      console.log('end', e);
      _handlePanResponderEnd(e);
    });

  return (
    <GestureHandlerRootView>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={styles.container}
          ref={zoomSubjectWrapperRef}
          onLayout={measureZoomSubject}
        >
          <Animated.View
            style={[
              styles.zoomSubject,
              props.style,
              useAnimatedStyle(() => {
                return {
                  transform: [
                    // In RN79, we need to split the scale into X and Y to avoid
                    // the content getting pixelated when zooming in
                    { scaleX: zoom.value },
                    { scaleY: zoom.value },
                    { translateX: offsetX.value },
                    { translateY: offsetY.value },
                  ],
                };
              }),
            ]}
          >
            {children}
          </Animated.View>

          {visualTouchFeedbackEnabled &&
            stateTouches.map(
              (touch) =>
                doubleTapDelay && (
                  <AnimatedTouchFeedback
                    x={touch.x}
                    y={touch.y}
                    key={touch.id}
                    animationDuration={doubleTapDelay}
                    onAnimationDone={() => {
                      _removeTouch(touch);
                    }}
                  />
                )
            )}

          {/* For Debugging Only */}
          {debugPoints.map(({ x, y }, index) => {
            return <DebugTouchPoint key={index} x={x} y={y} />;
          })}

          {/* TODO */}
          {/*{staticPinPosition && false && (*/}
          {/*  <StaticPin*/}
          {/*    staticPinIcon={staticPinIcon}*/}
          {/*    staticPinPosition={staticPinPosition}*/}
          {/*    pinSize={pinSize}*/}
          {/*    onPress={onStaticPinPress}*/}
          {/*    onLongPress={onStaticPinLongPress}*/}
          {/*    onParentMove={_handlePanResponderMove}*/}
          {/*    setPinSize={setPinSize}*/}
          {/*    pinProps={pinProps}*/}
          {/*  />*/}
          {/*)}*/}
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  zoomSubject: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
});

export default ReactNativeZoomableView;

export { ReactNativeZoomableView };
