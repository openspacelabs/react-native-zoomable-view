import { debounce, defaults } from 'lodash';
import React, {
  forwardRef,
  ForwardRefRenderFunction,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  GestureTouchEvent,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  makeMutable,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';

import { zoomToAnimation } from './animations';
import { AnimatedTouchFeedback } from './components';
import { StaticPin } from './components/StaticPin';
import { DebugTouchPoint } from './debugHelper';
import {
  calcGestureCenterPoint,
  calcGestureTouchAngle,
  calcGestureTouchDistance,
  calcNewScaledOffsetForZoomCentering,
} from './helper';
import { viewportPositionToImagePosition } from './helper/coordinateConversion';
import { getNextZoomStep } from './helper/getNextZoomStep';
import { useDebugPoints } from './hooks/useDebugPoints';
import { useLatestCallback } from './hooks/useLatestCallback';
import { useZoomSubject } from './hooks/useZoomSubject';
import { ReactNativeZoomableViewContext } from './ReactNativeZoomableViewContext';
import { styles } from './styles';
import {
  ReactNativeZoomableViewProps,
  ReactNativeZoomableViewRef,
  TouchPoint,
  Vec2D,
  ZoomableViewEvent,
} from './typings';

const ReactNativeZoomableViewInner: ForwardRefRenderFunction<
  ReactNativeZoomableViewRef,
  ReactNativeZoomableViewProps
> = (props, ref) => {
  const {
    wrapperRef: zoomSubjectWrapperRef,
    measure: measureZoomSubject,
    originalWidth,
    originalHeight,
    originalX,
    originalY,
  } = useZoomSubject();

  const [pinSize, setPinSize] = useState({ width: 0, height: 0 });
  const [stateTouches, setStateTouches] = useState<TouchPoint[]>([]);

  const { debugPoints, setDebugPoints, setPinchDebugPoints } = useDebugPoints();

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
    movementSensitivity: 1,
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
    pinchPanEnabled: true,
  });

  const {
    debug,
    staticPinIcon,
    children,
    overlayContent,
    visualTouchFeedbackEnabled,
    doubleTapDelay,
    staticPinPosition: propStaticPinPosition,
    contentWidth: propContentWidth,
    contentHeight: propContentHeight,
    onTransform,
    onStaticPinPositionMove,
    onPanResponderMove,
    onRotation,
    zoomEnabled: propZoomEnabled,
    maxZoom: propMaxZoom,
    minZoom: propMinZoom,
    pinchToZoomInSensitivity: propPinchToZoomInSensitivity,
    pinchToZoomOutSensitivity: propPinchToZoomOutSensitivity,
    movementSensitivity: propMovementSensitivity,
    panEnabled: propPanEnabled,
    disablePanOnInitialZoom: propDisablePanOnInitialZoom,
    pinchPanEnabled: propPinchPanEnabled,
    contentRotation: propContentRotation,
    initialZoom: propsInitialZoom,
    pinProps,
  } = props;

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const zoom = useSharedValue(1);
  const inverseZoom = useDerivedValue(() => 1 / zoom.value);
  const inverseZoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: inverseZoom.value }],
  }));

  const lastGestureCenterPosition = useSharedValue<Vec2D | null>(null);
  const lastGestureTouchDistance = useSharedValue<number | null>(150);
  const gestureStarted = useSharedValue(false);

  /**
   * Last press time (used to evaluate whether user double tapped)
   */
  const longPressTimeout = useSharedValue<NodeJS.Timeout | undefined>(
    undefined
  );
  const onTransformInvocationInitialized = useSharedValue(false);
  const singleTapTimeoutId = useRef<NodeJS.Timeout | undefined>(undefined);
  const touches = useSharedValue<TouchPoint[]>([]);
  const doubleTapFirstTap = useSharedValue<TouchPoint | undefined>(undefined);
  const gestureType = useSharedValue<'shift' | 'pinch' | undefined>(undefined);

  const staticPinPosition = useDerivedValue(() => propStaticPinPosition);
  const contentWidth = useDerivedValue(() => propContentWidth);
  const contentHeight = useDerivedValue(() => propContentHeight);
  const zoomEnabled = useDerivedValue(() => propZoomEnabled);
  const maxZoom = useDerivedValue(() => propMaxZoom);
  const minZoom = useDerivedValue(() => propMinZoom);
  const pinchToZoomInSensitivity = useDerivedValue(
    () => propPinchToZoomInSensitivity
  );
  const pinchToZoomOutSensitivity = useDerivedValue(
    () => propPinchToZoomOutSensitivity
  );
  const panEnabled = useDerivedValue(() => propPanEnabled);
  const disablePanOnInitialZoom = useDerivedValue(
    () => propDisablePanOnInitialZoom
  );
  const initialZoom = useDerivedValue(() => propsInitialZoom);
  const movementSensitivity = useDerivedValue(() => propMovementSensitivity);
  const pinchPanEnabled = useDerivedValue(() => propPinchPanEnabled);
  const lastGestureTouchAngle = useSharedValue<number | null>(null);
  const lastTouchTimestamp = useSharedValue<number>(0);
  const velocityX = useSharedValue<number>(0);
  const velocityY = useSharedValue<number>(0);
  const onMomentumEnd = useLatestCallback(
    props.onMomentumEnd || (() => undefined)
  );
  const lastPinBridgeTimestamp = useSharedValue<number>(0);
  const onPanResponderGrant = useLatestCallback(
    props.onPanResponderGrant || (() => undefined)
  );
  const onPanResponderEnd = useLatestCallback(
    props.onPanResponderEnd || (() => undefined)
  );
  const onPanResponderTerminate = useLatestCallback(
    props.onPanResponderTerminate || (() => undefined)
  );
  const onZoomEnd = useLatestCallback(props.onZoomEnd || (() => undefined));
  const onShiftingEnd = useLatestCallback(
    props.onShiftingEnd || (() => undefined)
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
        originalHeight: originalHeight.value,
        originalWidth: originalWidth.value,
        gestureType: gestureType.value,
      },
      overwriteObj
    );
  };

  const _staticPinPosition = () => {
    'worklet';

    if (!staticPinPosition.value) return;
    if (!contentWidth.value || !contentHeight.value) return;

    return viewportPositionToImagePosition({
      viewportPosition: {
        x: staticPinPosition.value.x,
        y: staticPinPosition.value.y,
      },
      imageSize: {
        height: contentHeight.value,
        width: contentWidth.value,
      },
      zoomableEvent: _getZoomableViewEventObject({
        offsetX: offsetX.value,
        offsetY: offsetY.value,
        zoomLevel: zoom.value,
      }),
      contentRotation: propContentRotation?.value,
    });
  };

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

  const onStaticPinPositionChange = useLatestCallback(
    props.onStaticPinPositionChange || (() => undefined)
  );

  const debouncedOnStaticPinPositionChange = useMemo(
    () => debounce(onStaticPinPositionChange, 100),
    []
  );

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

    onTransform?.(zoomableViewEvent);

    if (position && gestureStarted.value) {
      // Throttle JS bridge calls for pin position to avoid per-frame overhead
      // Only bridge during active gestures; skip during decay/animation.
      const now = Date.now();
      if (now - lastPinBridgeTimestamp.value > 200) {
        lastPinBridgeTimestamp.value = now;
        onStaticPinPositionMove?.(position);
        runOnJS(debouncedOnStaticPinPositionChange)(position);
      }
    }

    return { successful: true };
  };

  useLayoutEffect(() => {
    if (props.initialZoom) zoom.value = props.initialZoom;
    if (props.initialOffsetX != null) offsetX.value = props.initialOffsetX;
    if (props.initialOffsetY != null) offsetY.value = props.initialOffsetY;
  }, []);

  useLayoutEffect(() => {
    if (!propZoomEnabled && initialZoom.value) {
      zoom.value = initialZoom.value;
    }
  }, [propZoomEnabled]);

  useAnimatedReaction(
    _getZoomableViewEventObject,
    () => {
      if (
        !onTransformInvocationInitialized.value &&
        _invokeOnTransform().successful
      ) {
        onTransformInvocationInitialized.value = true;
        return;
      }

      if (onTransformInvocationInitialized.value) _invokeOnTransform();
    },
    // _invokeOnTransform may cause a re-render, which would call the evaluation again,
    // causing an infinite loop. This deps array prevents the re-evaluation caused
    // by the re-render, thus breaking the infinite loop.
    []
  );

  const onLayout = useLatestCallback(props.onLayout || (() => undefined));

  // Handle original measurements changed
  useAnimatedReaction(
    () => [
      originalHeight.value,
      originalWidth.value,
      originalX.value,
      originalY.value,
    ],
    () => {
      // We use a custom `onLayout` event, so the clients can stay in-sync
      // with when the internal measurements are actually saved to the state,
      // thus helping them apply transformations at more accurate timings
      const layout = {
        width: originalWidth.value,
        height: originalHeight.value,
        x: originalX.value,
        y: originalY.value,
      };
      runOnJS(onLayout)({ nativeEvent: { layout } });
    }
  );

  // Handle staticPinPosition changed
  useLayoutEffect(() => {
    if (onTransformInvocationInitialized.value) _invokeOnTransform();
  }, [props.staticPinPosition?.x, props.staticPinPosition?.y]);

  const scheduleLongPressTimeout = useLatestCallback((e: GestureTouchEvent) => {
    if (props.onLongPress && props.longPressDuration) {
      longPressTimeout.value = setTimeout(() => {
        props.onLongPress?.(e, _getZoomableViewEventObject());
        longPressTimeout.value = undefined;
      }, props.longPressDuration);
    }
  });
  const clearLongPressTimeout = useLatestCallback(() => {
    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
      longPressTimeout.value = undefined;
    }
  });

  const _handlePanResponderGrant = (e: GestureTouchEvent) => {
    'worklet';
    runOnJS(scheduleLongPressTimeout)(e);

    runOnJS(onPanResponderGrant)(e, _getZoomableViewEventObject());

    cancelAnimation(zoom);
    cancelAnimation(offsetX);
    cancelAnimation(offsetY);
    gestureStarted.value = true;
  };

  /**
   * Calculates the amount the offset should shift since the last position during panning
   *
   * @param {Vec2D} gestureCenterPoint
   *
   * @private
   */
  const _calcOffsetShiftSinceLastGestureState = (gestureCenterPoint: Vec2D) => {
    'worklet';

    let shift = null;

    if (lastGestureCenterPosition.value && movementSensitivity.value) {
      let dx = gestureCenterPoint.x - lastGestureCenterPosition.value.x;
      let dy = gestureCenterPoint.y - lastGestureCenterPosition.value.y;

      // Counter-rotate screen-space delta into content-space when content is rotated
      if (propContentRotation) {
        const angle = propContentRotation.value;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rx = dx * cos + dy * sin;
        const ry = -dx * sin + dy * cos;
        dx = rx;
        dy = ry;
      }

      const shiftX = dx / zoom.value / movementSensitivity.value;
      const shiftY = dy / zoom.value / movementSensitivity.value;

      shift = {
        x: shiftX,
        y: shiftY,
      };
    }

    lastGestureCenterPosition.value = gestureCenterPoint;

    return shift;
  };

  /**
   * Handles the pinch movement and zooming
   */
  const _handlePinching = (e: GestureTouchEvent) => {
    'worklet';

    if (!zoomEnabled.value) return;

    const distance = calcGestureTouchDistance(e);

    if (!distance) return;
    if (!lastGestureTouchDistance.value) return;

    // define the new zoom level and take zoom level sensitivity into consideration
    const zoomGrowthFromLastGestureState =
      distance / lastGestureTouchDistance.value;
    lastGestureTouchDistance.value = distance;

    const pinchToZoomSensitivity =
      zoomGrowthFromLastGestureState < 1
        ? pinchToZoomOutSensitivity.value
        : pinchToZoomInSensitivity.value;

    if (pinchToZoomSensitivity == null) return;
    const deltaGrowth = zoomGrowthFromLastGestureState - 1;
    // 0 - no resistance
    // 10 - 90% resistance
    const deltaGrowthAdjustedBySensitivity =
      deltaGrowth * (1 - (pinchToZoomSensitivity * 9) / 100);

    let newZoomLevel = zoom.value * (1 + deltaGrowthAdjustedBySensitivity);

    // make sure max and min zoom levels are respected
    if (maxZoom.value != null && newZoomLevel > maxZoom.value) {
      newZoomLevel = maxZoom.value;
    }

    if (minZoom.value != null && newZoomLevel < minZoom.value) {
      newZoomLevel = minZoom.value;
    }

    const gestureCenterPoint = calcGestureCenterPoint(e);

    if (!gestureCenterPoint) return;

    let zoomCenter = {
      x: gestureCenterPoint.x,
      y: gestureCenterPoint.y,
    };

    if (staticPinPosition.value && !pinchPanEnabled.value) {
      // Follow mode: zoom centres on the static pin position.
      // Non-follow (pinchPanEnabled): zoom centres between fingers.
      zoomCenter = {
        x: staticPinPosition.value.x,
        y: staticPinPosition.value.y,
      };
    }

    // Uncomment to debug
    debug && runOnJS(setPinchDebugPoints)(e, zoomCenter);

    const oldOffsetX = offsetX.value;
    const oldOffsetY = offsetY.value;
    const oldScale = zoom.value;
    const newScale = newZoomLevel;

    if (!originalHeight.value || !originalWidth.value) return;

    // Counter-rotate zoom center into content space when content is rotated.
    // The algorithm treats X/Y independently, which is only correct when the
    // zoom subject is axis-aligned. With rotation, the axes are coupled through
    // the rotation matrix.
    let zcX = zoomCenter.x;
    let zcY = zoomCenter.y;
    if (propContentRotation && propContentRotation.value !== 0) {
      const angle = propContentRotation.value;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const cx = originalWidth.value / 2;
      const cy = originalHeight.value / 2;
      const dx = zoomCenter.x - cx;
      const dy = zoomCenter.y - cy;
      zcX = cx + dx * cos + dy * sin;
      zcY = cy - dx * sin + dy * cos;
    }

    let newOffsetY = calcNewScaledOffsetForZoomCentering(
      oldOffsetY,
      originalHeight.value,
      oldScale,
      newScale,
      zcY
    );
    let newOffsetX = calcNewScaledOffsetForZoomCentering(
      oldOffsetX,
      originalWidth.value,
      oldScale,
      newScale,
      zcX
    );

    const offsetShift =
      _calcOffsetShiftSinceLastGestureState(gestureCenterPoint);
    if (pinchPanEnabled.value && offsetShift) {
      newOffsetX += offsetShift.x;
      newOffsetY += offsetShift.y;
    }

    offsetX.value = newOffsetX;
    offsetY.value = newOffsetY;
    zoom.value = newScale;

    if (onRotation) {
      const angle = calcGestureTouchAngle(e);
      if (angle != null && lastGestureTouchAngle.value != null) {
        let delta = angle - lastGestureTouchAngle.value;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;

        // No threshold; pass rotation through directly.
        const fingerDist = calcGestureTouchDistance(e);
        onRotation(delta, fingerDist ?? 0);
      }
      lastGestureTouchAngle.value = angle;
    }
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
  const _handleShifting = (e: GestureTouchEvent) => {
    'worklet';
    // Skips shifting if panEnabled is false or disablePanOnInitialZoom is true and we're on the initial zoom level
    if (
      !panEnabled.value ||
      (disablePanOnInitialZoom.value && zoom.value === initialZoom.value)
    ) {
      return;
    }
    const t0 = e.allTouches[0];
    if (!t0) return;
    const shift = _calcOffsetShiftSinceLastGestureState({
      x: t0.x,
      y: t0.y,
    });
    if (!shift) return;

    // Track velocity for momentum scrolling
    const now = Date.now();
    const dt = now - lastTouchTimestamp.value;
    if (dt > 0 && dt < 100) {
      velocityX.value = shift.x / (dt / 1000);
      velocityY.value = shift.y / (dt / 1000);
    }
    lastTouchTimestamp.value = now;

    const newOffsetX = offsetX.value + shift.x;
    const newOffsetY = offsetY.value + shift.y;

    if (debug) {
      runOnJS(setDebugPoints)([{ x: t0.x, y: t0.y }]);
    }

    _setNewOffsetPosition(newOffsetX, newOffsetY);
  };

  const prevZoom = useSharedValue<number>(1);
  const zoomToDestination = useSharedValue<Vec2D | undefined>(undefined);

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

      // == Trigger Pan Animation to preserve the zoom center while zooming ==
      // See the "Zoom Animation Support" block more details
      zoomToDestination.value = zoomCenter;
      prevZoom.value = zoom.value;

      // == Perform Zoom Animation ==
      zoom.value = withTiming(newZoomLevel, zoomToAnimation, () => {
        'worlet';

        // == Zoom Animation Ends ==
        zoomToDestination.value = undefined;
        runOnJS(onZoomEnd)(undefined, _getZoomableViewEventObject());
      });

      return true;
    }
  );

  // Zoom Animation Support:
  // Adapt offsets when zoom level changes during zoomTo animation
  useAnimatedReaction(
    () => zoom.value,
    (newZoom) => {
      if (!zoomToDestination.value) return;
      offsetX.value = calcNewScaledOffsetForZoomCentering(
        offsetX.value,
        originalWidth.value,
        prevZoom.value,
        newZoom,
        zoomToDestination.value.x
      );
      offsetY.value = calcNewScaledOffsetForZoomCentering(
        offsetY.value,
        originalHeight.value,
        prevZoom.value,
        newZoom,
        zoomToDestination.value.y
      );
      prevZoom.value = newZoom;
    }
  );

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

    const nextZoomStep = getNextZoomStep({
      zoomLevel: zoom.value,
      zoomStep: props.zoomStep,
      maxZoom: props.maxZoom,
      initialZoom: props.initialZoom,
    });
    if (nextZoomStep == null) return;

    // define new zoom position coordinates
    const tapTouch = e.allTouches[0];
    if (!tapTouch) return;
    const zoomPositionCoordinates = {
      x: tapTouch.x,
      y: tapTouch.y,
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
      singleTapTimeoutId.current = undefined;
      delete doubleTapFirstTap.value;
      _handleDoubleTap(e);
    } else {
      doubleTapFirstTapReleaseTimestamp.value = now;
      const firstTapTouch = e.allTouches[0];
      if (!firstTapTouch) return;
      doubleTapFirstTap.value = {
        id: now.toString(),
        x: firstTapTouch.x,
        y: firstTapTouch.y,
      };
      _addTouch(doubleTapFirstTap.value);

      singleTapTimeoutId.current = setTimeout(() => {
        delete doubleTapFirstTapReleaseTimestamp.value;
        singleTapTimeoutId.current = undefined;

        // Call onSingleTap first; if it returns true, skip the pan-to-tap behavior
        const handled = props.onSingleTap?.(e, _getZoomableViewEventObject());
        // Pan to the tapped location (unless onSingleTap handled it)
        if (!handled && props.staticPinPosition && doubleTapFirstTap.value) {
          let tapX = props.staticPinPosition.x - doubleTapFirstTap.value.x;
          let tapY = props.staticPinPosition.y - doubleTapFirstTap.value.y;

          // Counter-rotate screen-space delta into content-space when content is rotated
          if (propContentRotation) {
            const angle = propContentRotation.value;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rx = tapX * cos + tapY * sin;
            const ry = -tapX * sin + tapY * cos;
            tapX = rx;
            tapY = ry;
          }

          const toX = offsetX.value + tapX / zoom.value;
          const toY = offsetY.value + tapY / zoom.value;

          const animationsDone = makeMutable(0);
          const done = () => {
            'worklet';
            if (++animationsDone.value >= 2) runOnJS(_updateStaticPin)();
          };

          offsetX.value = withTiming(toX, { duration: 200 }, done);
          offsetY.value = withTiming(toY, { duration: 200 }, done);
        }
      }, props.doubleTapDelay);
    }
  };

  const publicMoveStaticPinTo = useLatestCallback(
    (position: Vec2D, duration?: number) => {
      const { staticPinPosition, contentWidth, contentHeight } = props;

      if (!staticPinPosition) return;
      if (!originalWidth.value || !originalHeight.value) return;
      if (!contentWidth || !contentHeight) return;

      // Offset for the static pin
      const pinX = staticPinPosition.x - originalWidth.value / 2;
      const pinY = staticPinPosition.y - originalHeight.value / 2;

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

  // Worklet sibling of `publicMoveStaticPinTo`. Reads SharedValue mirrors of
  // `staticPinPosition`, `contentWidth`, `contentHeight` (all declared as
  // `useDerivedValue(() => prop)` at top of component) so the math runs
  // entirely on UI thread — no JS hop. Used by `useAnimatedReaction`-driven
  // centering reactions in consumers (sheetHome's FollowMode reaction).
  //
  // The `withTiming` completion callback on `offsetY` (the second of the
  // two parallel animations) invokes `_invokeOnTransform()` so consumer
  // mirrors of `offsetX/Y` settle on the post-animation value — same
  // rationale as `zoomToWorklet` below: the polling reaction does not
  // reliably fire on the final frame of a worklet-initiated `withTiming`.
  const moveStaticPinToWorklet = (position: Vec2D, duration?: number) => {
    'worklet';
    if (!staticPinPosition.value) return;
    if (!originalWidth.value || !originalHeight.value) return;
    if (!contentWidth.value || !contentHeight.value) return;

    const pinX = staticPinPosition.value.x - originalWidth.value / 2;
    const pinY = staticPinPosition.value.y - originalHeight.value / 2;
    const newOffsetX = contentWidth.value / 2 - position.x + pinX / zoom.value;
    const newOffsetY = contentHeight.value / 2 - position.y + pinY / zoom.value;

    if (duration) {
      offsetX.value = withTiming(newOffsetX, { duration });
      offsetY.value = withTiming(newOffsetY, { duration }, (finished) => {
        'worklet';
        if (!finished) return;
        _invokeOnTransform();
      });
    } else {
      offsetX.value = newOffsetX;
      offsetY.value = newOffsetY;
      _invokeOnTransform();
    }
  };

  // Worklet sibling of `publicZoomTo`. Pure worklet path: animates `zoom`
  // shared value via `withTiming` matching the JS variant's `zoomToAnimation`.
  // When a `center` is provided, snaps the static pin to that bitmap position
  // first (no animation) so the zoom origin is correct, then animates zoom.
  // No `runOnJS` callback for `onZoomEnd` — consumers needing zoom-end
  // notification should use the JS `publicZoomTo` instead.
  //
  // The `withTiming` completion callback explicitly invokes
  // `_invokeOnTransform()` so consumer-side mirrors of zoom (e.g.
  // `zoomSharedValue` in `SheetZoomContext`) reflect the post-animation
  // value. Without this push, the polling `useAnimatedReaction` that
  // normally bridges `zoom` → `onTransform` does not reliably fire on the
  // final frame of a worklet-initiated `withTiming` (the animation settles
  // exactly on the target value, so the frame-to-frame delta the polling
  // reaction watches collapses to zero on the last tick — consumers
  // observe a stale pre-animation value). Calling `_invokeOnTransform`
  // synchronously inside the completion callback guarantees consumers see
  // the final zoom AND offsets, mirroring the public JS variant which
  // always lands consumers on the post-animation state via its own
  // `runOnJS(onZoomEnd)`-style hook chain.
  const zoomToWorklet = (zoomLevel: number, center?: Vec2D) => {
    'worklet';
    if (center) moveStaticPinToWorklet(center, 0);
    zoom.value = withTiming(zoomLevel, zoomToAnimation, (finished) => {
      'worklet';
      if (!finished) return;
      _invokeOnTransform();
    });
  };

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
    (newOffsetX: number, newOffsetY: number, zoomOverride?: number) => {
      if (!originalWidth.value || !originalHeight.value) return;

      const z = zoomOverride ?? zoom.value;
      const oX = (newOffsetX - originalWidth.value / 2) / z;
      const oY = (newOffsetY - originalHeight.value / 2) / z;

      // Cancel ongoing animations before setting an exact viewport position.
      cancelAnimation(offsetX);
      cancelAnimation(offsetY);
      cancelAnimation(zoom);
      zoomToDestination.value = undefined;

      if (zoomOverride) {
        zoom.value = zoomOverride;
      }

      offsetX.value = -oX;
      offsetY.value = -oY;
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
    zoomToWorklet,
    zoomBy: publicZoomBy,
    moveTo: publicMoveTo,
    moveBy: publicMoveBy,
    moveStaticPinTo: publicMoveStaticPinTo,
    moveStaticPinToWorklet,
    get gestureStarted() {
      return gestureStarted.value;
    },
  }));

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
      runOnJS(_resolveAndHandleTap)(e);
    }

    runOnJS(setDebugPoints)([]);

    lastGestureCenterPosition.value = null;

    runOnJS(clearLongPressTimeout)();

    runOnJS(onPanResponderEnd)(e, _getZoomableViewEventObject());

    if (gestureType.value === 'pinch') {
      runOnJS(onZoomEnd)(e, _getZoomableViewEventObject());
    } else if (gestureType.value === 'shift') {
      // Apply momentum decay if velocity is significant
      const vx = velocityX.value;
      const vy = velocityY.value;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > 50) {
        let decayFinishedCount = 0;
        const checkMomentumEnd = () => {
          'worklet';
          decayFinishedCount++;
          if (decayFinishedCount >= 2) runOnJS(onMomentumEnd)();
        };
        offsetX.value = withDecay(
          {
            velocity: vx,
            deceleration: 0.997,
          },
          (finished) => {
            'worklet';
            if (finished) checkMomentumEnd();
          }
        );
        offsetY.value = withDecay(
          {
            velocity: vy,
            deceleration: 0.997,
          },
          (finished) => {
            'worklet';
            if (finished) checkMomentumEnd();
          }
        );
      } else {
        runOnJS(onMomentumEnd)();
      }
      velocityX.value = 0;
      velocityY.value = 0;
      runOnJS(onShiftingEnd)(e, _getZoomableViewEventObject());
    }

    if (staticPinPosition.value) {
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
  const _handlePanResponderMove = (
    e: GestureTouchEvent,
    gestureState: { dx: number; dy: number }
  ) => {
    'worklet';

    if (onPanResponderMove?.(e, _getZoomableViewEventObject())) {
      return;
    }

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
      return;
    }

    if (e.numberOfTouches === 2) {
      runOnJS(clearLongPressTimeout)();

      // change some measurement states when switching gesture to ensure a smooth transition
      if (gestureType.value !== 'pinch') {
        lastGestureCenterPosition.value = calcGestureCenterPoint(e);
        lastGestureTouchDistance.value = calcGestureTouchDistance(e);
        lastGestureTouchAngle.value = calcGestureTouchAngle(e);
      }
      gestureType.value = 'pinch';
      _handlePinching(e);
    } else if (e.numberOfTouches === 1) {
      // Don't downgrade from pinch to shift when lifting one finger
      if (gestureType.value === 'pinch') {
        // Reset rotation state so next 2-finger contact starts fresh
        lastGestureTouchAngle.value = null;
        return;
      }

      const { dx, dy } = gestureState;

      if (longPressTimeout.value && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        runOnJS(clearLongPressTimeout)();
      }

      // change some measurement states when switching gesture to ensure a smooth transition
      if (gestureType.value !== 'shift') {
        lastGestureCenterPosition.value = calcGestureCenterPoint(e);
      }

      const isShiftGesture = Math.abs(dx) > 2 || Math.abs(dy) > 2;
      if (isShiftGesture) {
        gestureType.value = 'shift';
        _handleShifting(e);
      }
    }
  };

  const firstTouch = useSharedValue<Vec2D | undefined>(undefined);
  const gesture = Gesture.Manual()
    .onTouchesDown((e, stateManager) => {
      // only begin if this is the first touch
      if (!firstTouch.value) {
        const touch = e.allTouches[0];
        if (!touch) return;
        stateManager.activate();
        stateManager.begin();
        firstTouch.value = { x: touch.x, y: touch.y };
        _handlePanResponderGrant(e);
      }
    })
    .onTouchesMove((e) => {
      const touch = e.allTouches[0];
      if (!touch) return;
      const dx = touch.x - (firstTouch.value?.x || 0);
      const dy = touch.y - (firstTouch.value?.y || 0);
      _handlePanResponderMove(e, { dx, dy });
    })
    .onTouchesUp((e, stateManager) => {
      // only end if this is the last touch being lifted
      if (e.numberOfTouches === 0) {
        _handlePanResponderEnd(e);
        stateManager.end();
      }
    })
    .onTouchesCancelled((e, stateManager) => {
      _handlePanResponderEnd(e);
      runOnJS(onPanResponderTerminate)(e, _getZoomableViewEventObject());
      stateManager.end();
    })
    .onFinalize(() => {
      firstTouch.value = undefined;
    });

  const transformStyle = useAnimatedStyle(() => {
    if (propContentRotation) {
      return {
        transform: [
          // Content rotation applies before scale/translate so the content
          // rotates around center while the viewport stays axis-aligned.
          { rotate: `${propContentRotation.value}rad` },
          // In RN79, we need to split the scale into X and Y to avoid
          // the content getting pixelated when zooming in
          { scaleX: zoom.value },
          { scaleY: zoom.value },
          { translateX: offsetX.value },
          { translateY: offsetY.value },
        ],
      };
    }

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
  });

  return (
    <ReactNativeZoomableViewContext.Provider
      value={{ zoom, inverseZoom, inverseZoomStyle, offsetX, offsetY }}
    >
      <GestureHandlerRootView>
        <GestureDetector gesture={gesture}>
          <View
            style={styles.container}
            ref={zoomSubjectWrapperRef}
            onLayout={measureZoomSubject}
          >
            <Animated.View
              style={[styles.zoomSubject, props.style, transformStyle]}
            >
              {children}
            </Animated.View>
            {overlayContent}

            {visualTouchFeedbackEnabled && doubleTapDelay
              ? stateTouches.map((touch) => (
                  <AnimatedTouchFeedback
                    x={touch.x}
                    y={touch.y}
                    key={touch.id}
                    animationDuration={doubleTapDelay}
                    onAnimationDone={() => {
                      _removeTouch(touch);
                    }}
                  />
                ))
              : null}

            {/* For Debugging Only */}
            {debugPoints.map(({ x, y }, index) => {
              return <DebugTouchPoint key={index} x={x} y={y} />;
            })}

            {propStaticPinPosition && (
              <StaticPin
                staticPinIcon={staticPinIcon}
                staticPinPosition={propStaticPinPosition}
                pinSize={pinSize}
                setPinSize={setPinSize}
                pinProps={pinProps}
              />
            )}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </ReactNativeZoomableViewContext.Provider>
  );
};

export const ReactNativeZoomableView = forwardRef(ReactNativeZoomableViewInner);
