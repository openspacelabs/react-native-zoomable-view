import { defaults } from 'lodash';
import React, {
  forwardRef,
  ForwardRefRenderFunction,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
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
    onStaticPinPositionMoveWorklet: undefined,
    disablePanOnInitialZoom: false,
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
    onPanResponderMoveWorklet,
    zoomEnabled: propZoomEnabled,
    maxZoom: propMaxZoom,
    minZoom: propMinZoom,
    pinchToZoomInSensitivity: propPinchToZoomInSensitivity,
    pinchToZoomOutSensitivity: propPinchToZoomOutSensitivity,
    movementSensitivity: propMovementSensitivity,
    panEnabled: propPanEnabled,
    disablePanOnInitialZoom: propDisablePanOnInitialZoom,
    initialZoom: propsInitialZoom,
    zoomStep: propZoomStep,
    pinProps,
  } = props;

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const zoom = useSharedValue(1);
  // Programmatic-zoom support state. Declared here (rather than next to
  // `publicZoomTo`) because the unified transform reaction below references
  // them; React hooks are evaluated top-to-bottom and the closure captured by
  // the worklet must see initialised values.
  const prevZoom = useSharedValue<number>(1);
  const zoomToDestination = useSharedValue<Vec2D | undefined>(undefined);
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
  const singleTapTimeoutId = useRef<NodeJS.Timeout>();
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
  const zoomStep = useDerivedValue(() => propZoomStep);
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
    });
  };

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

    onTransformWorklet?.(zoomableViewEvent);

    if (position) {
      onStaticPinPositionMoveWorklet?.(position);
    }

    return { successful: true };
  };

  // Settle-detection state for `onStaticPinPositionChange` (JS-thread callback,
  // fired ~100ms after motion stops). Drives one bridge hop per logical settle
  // event regardless of how many frames moved during the gesture or animation.
  const lastFiredPosition = useSharedValue<Vec2D | null>(null);
  // `NodeJS.Timeout` matches the global `setTimeout` return type that
  // TypeScript sees in this codebase; at runtime on the worklet runtime
  // the value is the numeric handle from the worklet `setTimeout` polyfill.
  const settleTimer = useSharedValue<NodeJS.Timeout | null>(null);
  const SETTLE_QUIET_MS = 100;
  const SAME_POSITION_EPSILON = 0.001;

  const samePosition = (a: Vec2D, b: Vec2D) => {
    'worklet';
    return (
      Math.abs(a.x - b.x) < SAME_POSITION_EPSILON &&
      Math.abs(a.y - b.y) < SAME_POSITION_EPSILON
    );
  };

  useAnimatedReaction(_staticPinPosition, (current) => {
    'worklet';
    if (!current) return;

    // Cancel any in-flight settle — motion is still happening.
    if (settleTimer.value !== null) {
      clearTimeout(settleTimer.value);
      settleTimer.value = null;
    }

    // Schedule the JS-thread fire SETTLE_QUIET_MS after motion stops.
    // Value-based dedup at fire time prevents redundant hops when the
    // settled position equals the last fired one (e.g. a zoomTo whose
    // visual end-state matches the start, or a pan that returns home).
    settleTimer.value = setTimeout(() => {
      'worklet';
      settleTimer.value = null;
      const last = lastFiredPosition.value;
      if (last && samePosition(current, last)) return;
      lastFiredPosition.value = current;
      runOnJS(onStaticPinPositionChange)(current);
    }, SETTLE_QUIET_MS);
  });

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

  // Component-level cleanup. Cancels every animation and pending timer the
  // component owns when it unmounts; without this, an in-flight `withTiming`
  // can fire its callback (or the settle reaction can fire its 100ms timer)
  // after the host has gone away — leaking refs and crashing on `setState`
  // against an unmounted component.
  useEffect(() => {
    return () => {
      // `singleTapTimeoutId` and `longPressTimeout` are scheduled via JS-thread
      // `setTimeout` (the latter via `runOnJS(scheduleLongPressTimeout)` from a
      // worklet), so their handles belong to the JS runtime — clear from JS.
      if (singleTapTimeoutId.current) {
        clearTimeout(singleTapTimeoutId.current);
      }
      if (longPressTimeout.value) {
        clearTimeout(longPressTimeout.value);
      }
      // `settleTimer` is scheduled via `setTimeout` on the UI runtime
      // (worklet polyfill backed by requestAnimationFrame); its handle is
      // only valid in that runtime, so clear it from there. Animations are
      // also cancelled on the UI runtime in the same hop to avoid two
      // round-trips.
      runOnUI(() => {
        'worklet';
        if (settleTimer.value !== null) {
          clearTimeout(settleTimer.value);
          settleTimer.value = null;
        }
        cancelAnimation(zoom);
        cancelAnimation(offsetX);
        cancelAnimation(offsetY);
      })();
    };
    // Refs/SharedValues are stable across the component lifetime; empty deps
    // run the cleanup on unmount only.
  }, []);

  // Unified transform reaction. Two responsibilities, fused into a single
  // reaction so they observe a consistent atomic state on every tick:
  //   1. While `zoomToDestination` is set (programmatic `zoomTo()` is in flight)
  //      and zoom changed, recompute offsets to preserve the zoom centre.
  //      This MUST run BEFORE step 2 so the event object passed to
  //      `_invokeOnTransform` reflects the post-recompute offsets — otherwise
  //      consumers see a chimera state where zoom advanced but offsets haven't.
  //   2. Fire `_invokeOnTransform` (consumer onTransformWorklet etc.).
  // Splitting into two reactions previously caused the chimera state because
  // registration order determined which reaction observed the half-applied
  // tick first.
  useAnimatedReaction(
    _getZoomableViewEventObject,
    (curr, prev) => {
      if (
        zoomToDestination.value &&
        prev &&
        curr.zoomLevel !== prev.zoomLevel
      ) {
        offsetX.value = calcNewScaledOffsetForZoomCentering(
          offsetX.value,
          originalWidth.value,
          prevZoom.value,
          curr.zoomLevel,
          zoomToDestination.value.x
        );
        offsetY.value = calcNewScaledOffsetForZoomCentering(
          offsetY.value,
          originalHeight.value,
          prevZoom.value,
          curr.zoomLevel,
          zoomToDestination.value.y
        );
        prevZoom.value = curr.zoomLevel;
      }

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
      const dx = gestureCenterPoint.x - lastGestureCenterPosition.value.x;
      const dy = gestureCenterPoint.y - lastGestureCenterPosition.value.y;

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

    if (staticPinPosition.value) {
      // When we use a static pin position, the zoom centre is the same as that position,
      // otherwise the pin moves around way too much while zooming.
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

    let newOffsetY = calcNewScaledOffsetForZoomCentering(
      oldOffsetY,
      originalHeight.value,
      oldScale,
      newScale,
      zoomCenter.y
    );
    let newOffsetX = calcNewScaledOffsetForZoomCentering(
      oldOffsetX,
      originalWidth.value,
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
    const shift = _calcOffsetShiftSinceLastGestureState({
      x: e.allTouches[0].x,
      y: e.allTouches[0].y,
    });
    if (!shift) return;

    const newOffsetX = offsetX.value + shift.x;
    const newOffsetY = offsetY.value + shift.y;

    if (debug) {
      const x = e.allTouches[0].x;
      const y = e.allTouches[0].y;
      runOnJS(setDebugPoints)([{ x, y }]);
    }

    _setNewOffsetPosition(newOffsetX, newOffsetY);
  };

  /**
   * Zooms to a specific level. A "zoom center" can be provided, which specifies
   * the point that will remain in the same position on the screen after the zoom.
   * The coordinates of the zoom center is relative to the zoom subject.
   * { x: 0, y: 0 } is the very center of the zoom subject.
   *
   * @param newZoomLevel
   * @param zoomCenter - If not supplied, the container's center is the zoom center
   */
  const publicZoomTo = (newZoomLevel: number, zoomCenter?: Vec2D) => {
    'worklet';

    if (!zoomEnabled.value) return false;
    if (maxZoom.value != null && newZoomLevel > maxZoom.value) return false;
    if (minZoom.value != null && newZoomLevel < minZoom.value) return false;

    // == Trigger Pan Animation to preserve the zoom center while zooming ==
    // The unified transform reaction (above) recomputes offsets every tick that
    // `zoomToDestination` is set, so the centre stays put as zoom animates.
    zoomToDestination.value = zoomCenter;
    prevZoom.value = zoom.value;

    // == Perform Zoom Animation ==
    zoom.value = withTiming(newZoomLevel, zoomToAnimation, () => {
      'worklet';

      // == Zoom Animation Ends ==
      zoomToDestination.value = undefined;
      runOnJS(onZoomEnd)(undefined, _getZoomableViewEventObject());
    });

    return true;
  };

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
    const zoomPositionCoordinates = {
      x: e.allTouches[0].x,
      y: e.allTouches[0].y,
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
      delete singleTapTimeoutId.current;
      delete doubleTapFirstTap.value;
      _handleDoubleTap(e);
    } else {
      doubleTapFirstTapReleaseTimestamp.value = now;
      doubleTapFirstTap.value = {
        id: now.toString(),
        x: e.allTouches[0].x,
        y: e.allTouches[0].y,
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

          // No animation-end callback here — the unified `_staticPinPosition`
          // reaction with UI-thread settle detection catches the final pin
          // position ~100ms after `withTiming` stops emitting frames, and
          // fires `onStaticPinPositionChange` once for the entire animation.
          offsetX.value = withTiming(toX, { duration: 200 });
          offsetY.value = withTiming(toY, { duration: 200 });
        }

        props.onSingleTap?.(e, _getZoomableViewEventObject());
      }, props.doubleTapDelay);
    }
  };

  const publicMoveStaticPinTo = (position: Vec2D, duration?: number) => {
    'worklet';

    if (!staticPinPosition.value) return;
    if (!originalWidth.value || !originalHeight.value) return;
    if (!contentWidth.value || !contentHeight.value) return;

    // Offset for the static pin
    const pinX = staticPinPosition.value.x - originalWidth.value / 2;
    const pinY = staticPinPosition.value.y - originalHeight.value / 2;

    const newOffsetX = contentWidth.value / 2 - position.x + pinX / zoom.value;
    const newOffsetY = contentHeight.value / 2 - position.y + pinY / zoom.value;

    if (duration) {
      offsetX.value = withTiming(newOffsetX, { duration });
      offsetY.value = withTiming(newOffsetY, { duration });
    } else {
      offsetX.value = newOffsetX;
      offsetY.value = newOffsetY;
    }
  };

  /**
   * Zooms in or out by a specified change level.
   * Positive `zoomLevelChange` zooms in, negative zooms out.
   * Returns false if the new level would exceed min/max zoom.
   */
  const publicZoomBy = (zoomLevelChange: number) => {
    'worklet';

    // if no zoom level Change given -> just use zoom step
    zoomLevelChange ||= zoomStep.value || 0;
    return publicZoomTo(zoom.value + zoomLevelChange);
  };

  /** Moves the zoomed view so the given (x, y) lands at the container center. */
  const publicMoveTo = (newOffsetX: number, newOffsetY: number) => {
    'worklet';

    if (!originalWidth.value || !originalHeight.value) return;

    const offsetX = (newOffsetX - originalWidth.value / 2) / zoom.value;
    const offsetY = (newOffsetY - originalHeight.value / 2) / zoom.value;

    _setNewOffsetPosition(-offsetX, -offsetY);
  };

  /** Moves the zoomed view by the given delta in container coordinates. */
  const publicMoveBy = (offsetChangeX: number, offsetChangeY: number) => {
    'worklet';

    const newOffsetX =
      (offsetX.value * zoom.value - offsetChangeX) / zoom.value;
    const newOffsetY =
      (offsetY.value * zoom.value - offsetChangeY) / zoom.value;

    _setNewOffsetPosition(newOffsetX, newOffsetY);
  };

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
      runOnJS(onShiftingEnd)(e, _getZoomableViewEventObject());
    }

    // `onStaticPinPositionChange` fires from the unified settle reaction
    // SETTLE_QUIET_MS after the last position change — gesture end included.
    // No explicit invocation needed here.

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

    if (onPanResponderMoveWorklet?.(e, _getZoomableViewEventObject())) {
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
      }
      gestureType.value = 'pinch';
      _handlePinching(e);
    } else if (e.numberOfTouches === 1) {
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
        stateManager.activate();
        stateManager.begin();
        firstTouch.value = { x: e.allTouches[0].x, y: e.allTouches[0].y };
        _handlePanResponderGrant(e);
      }
    })
    .onTouchesMove((e) => {
      const dx = e.allTouches[0].x - (firstTouch.value?.x || 0);
      const dy = e.allTouches[0].y - (firstTouch.value?.y || 0);
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
