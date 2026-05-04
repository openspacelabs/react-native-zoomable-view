import React, {
  forwardRef,
  ForwardRefRenderFunction,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
import { ReactNativeZoomableViewProvider } from './ReactNativeZoomableViewContext';
import {
  ReactNativeZoomableViewProps,
  ReactNativeZoomableViewRef,
  TouchPoint,
  Vec2D,
  ZoomableViewEvent,
} from './typings';

// Native replacement for `lodash.defaults` — preserves the same semantics:
// only `undefined` triggers the default; `null`/`0`/`false`/`""` are treated
// as explicit consumer values and override the default. Avoids pulling lodash
// into the library's runtime/peer dependency surface for a single helper.
function applyDefaults<T extends object>(input: T, defaults: T): T {
  const result = { ...defaults };
  for (const key in input) {
    if (input[key] !== undefined) result[key] = input[key];
  }
  return result;
}

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

  // `movementSensibility` is the legacy (typo) name of `movementSensitivity`.
  // Accept the old prop name so existing consumers keep working through one
  // major version, then warn in dev so they migrate. Removal is tracked as a
  // breaking change for the next major.
  const legacyMovementSensibility = (
    props as { movementSensibility?: number | null }
  ).movementSensibility;
  if (legacyMovementSensibility !== undefined) {
    if (__DEV__) {
      // Once-per-render-cycle in dev only; not throttled across renders, but
      // the cost is negligible and the goal is consumer migration, not perf.
      // eslint-disable-next-line no-console
      console.warn(
        '`movementSensibility` is deprecated and will be removed in the next major. Rename to `movementSensitivity`.'
      );
    }
    if (props.movementSensitivity === undefined) {
      // Coerce a legacy `null` to `undefined` so the `applyDefaults` call below
      // applies `1`, matching what `movementSensitivity: null` would have
      // produced (the runtime guard is `if (lastGestureCenterPosition.value
      // && movementSensitivity.value)` which treats falsy as no-op).
      props = {
        ...props,
        movementSensitivity: legacyMovementSensibility ?? undefined,
      };
    }
  }

  props = applyDefaults(props, {
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
  // Sentinel used to suppress single/double-tap classification when a long-press
  // already fired during this touch cycle. Without it, releasing after a
  // long-press would also `_resolveAndHandleTap`, producing both `onLongPress`
  // and `onSingleTap` for one gesture. Reset on each `_handlePanResponderGrant`.
  const longPressFired = useSharedValue(false);
  // Sentinel used to suppress tap classification when this touch cycle saw a
  // 3+ finger force-end. Without it, the eventual real release of the fingers
  // (after `onTouchesUp` with `numberOfTouches === 0`) would `_resolveAndHandleTap`,
  // producing a spurious `onSingleTap`/`onDoubleTap*` for what was a multi-finger
  // gesture. Reset on each non-recovery `_handlePanResponderGrant`.
  const forceEndPending = useSharedValue(false);
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
  // `onLongPress` and `onSingleTap` are read inside `setTimeout` bodies whose
  // closure captures `props` at schedule time (long-press: 700ms, single-tap:
  // 300ms). Without a stable wrapper, a parent re-render with new callback
  // refs during the timer window fires the stale callback. `useLatestCallback`
  // returns a stable wrapper that reads the latest prop on fire, eliminating
  // the schedule-vs-fire staleness race.
  const onLongPress = useLatestCallback(props.onLongPress || (() => undefined));
  const onSingleTap = useLatestCallback(props.onSingleTap || (() => undefined));

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
    // Mirror the guard in `_invokeOnTransform` and `onLayoutWorklet`'s
    // reaction: pre-measurement (originalWidth/Height === 0), the
    // coordinate-conversion math divides by zero and yields
    // `{x: Infinity, y: Infinity}`, which the settle reaction's `!current`
    // check would let through to `onStaticPinPositionChange`.
    if (!originalWidth.value || !originalHeight.value) return;

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
    // Symmetric to the render-path gate (`visualTouchFeedbackEnabled &&
    // !!doubleTapDelay`). Skipping either case prevents `touches.value` from
    // growing monotonically — `_removeTouch` only fires from
    // `AnimatedTouchFeedback.onAnimationDone`, which never mounts when the
    // render gate fails.
    if (!visualTouchFeedbackEnabled || !doubleTapDelay) return;
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

  // Mirror worklet-typed prop callbacks into SharedValues so the empty-deps
  // `useAnimatedReaction` below (and the worklet-context `_handlePanResponderMove`)
  // always invoke the LATEST consumer callback, not the first-render snapshot.
  // Without this indirection, the worklet body captures these props by closure
  // at first render — subsequent renders that hand a fresh callback identity
  // (e.g. inline arrow whose closure changes per render) would never reach the
  // worklet, silently invoking stale state forever.
  // `useLatestCallback` (used for the JS-thread callbacks above) is not viable
  // here: it returns a JS-thread function, and these refs must be readable from
  // worklet contexts.
  // The values are wrapped in `{ fn }` rather than stored bare, because
  // Reanimated's `valueSetter` treats raw function values as animation factories
  // (calls them with no args expecting an `AnimationObject`), which crashes
  // immediately on assignment. The object wrapper sidesteps that branch.
  const onTransformWorkletShared = useSharedValue<{
    fn: typeof onTransformWorklet | undefined;
  }>({ fn: undefined });
  const onStaticPinPositionMoveWorkletShared = useSharedValue<{
    fn: typeof onStaticPinPositionMoveWorklet | undefined;
  }>({ fn: undefined });
  const onPanResponderMoveWorkletShared = useSharedValue<{
    fn: typeof onPanResponderMoveWorklet | undefined;
  }>({ fn: undefined });
  useEffect(() => {
    onTransformWorkletShared.value = { fn: onTransformWorklet };
  }, [onTransformWorklet]);
  useEffect(() => {
    onStaticPinPositionMoveWorkletShared.value = {
      fn: onStaticPinPositionMoveWorklet,
    };
  }, [onStaticPinPositionMoveWorklet]);
  useEffect(() => {
    onPanResponderMoveWorkletShared.value = { fn: onPanResponderMoveWorklet };
  }, [onPanResponderMoveWorklet]);

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

    onTransformWorkletShared.value.fn?.(zoomableViewEvent);

    if (position) {
      onStaticPinPositionMoveWorkletShared.value.fn?.(position);
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
    if (!current) {
      // Pin/content went away — cancel any armed timer so it can't fire
      // `onStaticPinPositionChange` with a closure-captured stale Vec2D after
      // the consumer just unset the pin (or contentWidth/contentHeight
      // collapsed to 0).
      if (settleTimer.value !== null) {
        clearTimeout(settleTimer.value);
        settleTimer.value = null;
      }
      return;
    }

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
      // Mirror the cancellation contract documented on publicZoomTo's
      // withTiming completion ("Each cancellation path is responsible for
      // its own zoomToDestination cleanup"): the direct `zoom.value =` write
      // cancels any in-flight zoomTo animation, but the unified transform
      // reaction would still see `zoomToDestination.value` set and run its
      // recompute branch — producing an unexpected pan jump on what should
      // be an instant snap.
      cancelAnimation(zoom);
      zoomToDestination.value = undefined;
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

  // Mirror `onLayoutWorklet` into a SharedValue so the empty-deps reaction
  // below always invokes the latest consumer callback. Same pattern (and same
  // function-wrapping rationale) as `onTransformWorkletShared` above.
  const onLayoutWorkletShared = useSharedValue<{
    fn: typeof props.onLayoutWorklet | undefined;
  }>({ fn: undefined });
  useEffect(() => {
    onLayoutWorkletShared.value = { fn: props.onLayoutWorklet };
  }, [props.onLayoutWorklet]);

  // Handle original measurements changed — invoke `onLayoutWorklet` directly
  // on the UI thread (no `runOnJS` hop). Guard against the initial mapper
  // registration fire (all SharedValues start at 0); matches the equivalent
  // guard in `_invokeOnTransform`.
  useAnimatedReaction(
    () => [
      originalHeight.value,
      originalWidth.value,
      originalX.value,
      originalY.value,
    ],
    () => {
      if (!originalWidth.value || !originalHeight.value) return;
      onLayoutWorkletShared.value.fn?.({
        width: originalWidth.value,
        height: originalHeight.value,
        x: originalX.value,
        y: originalY.value,
      });
    }
  );

  // Handle staticPinPosition changed
  useLayoutEffect(() => {
    // `_invokeOnTransform` is a worklet that calls the consumer's
    // `onTransformWorklet` and `onStaticPinPositionMoveWorklet` (both
    // documented as UI-thread). The primary call site is the unified
    // transform reaction (UI thread); this prop-change path must hop to UI
    // explicitly, otherwise the same callback runs on the JS thread here
    // and on the UI thread elsewhere — producing inconsistent threading
    // semantics for consumers using UI-thread APIs (e.g. `scheduleOnRN`)
    // inside the callback.
    if (onTransformInvocationInitialized.value) runOnUI(_invokeOnTransform)();
  }, [props.staticPinPosition?.x, props.staticPinPosition?.y]);

  const scheduleLongPressTimeout = useLatestCallback((e: GestureTouchEvent) => {
    if (props.onLongPress && props.longPressDuration) {
      longPressTimeout.value = setTimeout(() => {
        // Invoke the stable `onLongPress` wrapper rather than the captured
        // `props.onLongPress` — the closure was captured at schedule time and
        // would fire a stale callback if the parent re-rendered during the
        // 700ms timer window.
        onLongPress(e, _getZoomableViewEventObject());
        longPressTimeout.value = undefined;
        // Mark long-press as fired so `_handlePanResponderEnd` skips
        // tap classification — otherwise the same touch release would
        // fire both `onLongPress` and `onSingleTap`.
        longPressFired.value = true;
        // Also clear `doubleTapFirstTapReleaseTimestamp` so a subsequent
        // tap is classified as the FIRST tap, not the second of a double-tap
        // straddling the long-press.
        doubleTapFirstTapReleaseTimestamp.value = undefined;
      }, props.longPressDuration);
    }
  });
  const clearLongPressTimeout = useLatestCallback(() => {
    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
      longPressTimeout.value = undefined;
    }
  });

  const clearSingleTapTimeout = useLatestCallback(() => {
    if (singleTapTimeoutId.current) {
      clearTimeout(singleTapTimeoutId.current);
      singleTapTimeoutId.current = undefined;
    }
  });

  const _handlePanResponderGrant = (
    e: GestureTouchEvent,
    isRecovery = false
  ) => {
    'worklet';

    // Cancel any pending single-tap fire from the previous gesture cycle —
    // a fresh touch invalidates the still-classifying single-tap, otherwise
    // the previous tap's `setTimeout` could fire alongside this gesture's
    // `onPanResponderEnd`-driven tap classification.
    runOnJS(clearSingleTapTimeout)();

    if (!isRecovery) {
      // First grant of a touch cycle: reset cycle-scoped sentinels and arm
      // consumer-visible grant + long-press timer. The recovery path (a 3+
      // finger transient that force-ended an active gesture, then dropped back
      // to ≤2 fingers without all touches lifting) is a continuation of the
      // same gesture cycle — preserving `longPressFired` and `forceEndPending`
      // is what suppresses spurious trailing tap events on the eventual real
      // release.
      longPressFired.value = false;
      forceEndPending.value = false;
      runOnJS(scheduleLongPressTimeout)(e);
      runOnJS(onPanResponderGrant)(e, _getZoomableViewEventObject());
    }

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
   * The coordinates of the zoom center are subject-relative pixels with the
   * top-left at (0, 0); the visual centre is
   * `{ x: originalWidth / 2, y: originalHeight / 2 }`.
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
    zoom.value = withTiming(newZoomLevel, zoomToAnimation, (finished) => {
      'worklet';
      // Bail on cancellation. The zoomToDestination cleanup does NOT run
      // here — the entity that cancelled us (pinch handler, another
      // zoomTo, moveTo, or unmount) has its own state to set up, and
      // clearing here would clobber theirs. Each cancellation path is
      // responsible for its own zoomToDestination cleanup.
      if (!finished) return;

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

    // if doubleTapZoomToCenter enabled -> always zoom to the centre of the
    // zoom subject. Coordinates are subject-relative pixels (top-left origin),
    // so the centre is `(originalWidth/2, originalHeight/2)` — not `(0, 0)`,
    // which is the top-left corner.
    if (doubleTapZoomToCenter) {
      zoomPositionCoordinates.x = originalWidth.value / 2;
      zoomPositionCoordinates.y = originalHeight.value / 2;
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
      // `delete` on a SharedValue's `.value` setter was a no-op — assigning
      // `undefined` is the defined way to clear the value. Same for the
      // plain ref above.
      doubleTapFirstTapReleaseTimestamp.value = undefined;
      singleTapTimeoutId.current = undefined;
      doubleTapFirstTap.value = undefined;
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
        doubleTapFirstTapReleaseTimestamp.value = undefined;
        singleTapTimeoutId.current = undefined;

        // Read `staticPinPosition` from the existing `useDerivedValue` mirror
        // rather than the closure-captured `props.staticPinPosition` — the
        // closure was captured at schedule time (300ms ago) and may now be
        // stale if the consumer moved the pin during the timer window.
        const currentStaticPinPosition = staticPinPosition.value;

        // Pan to the tapped location
        if (currentStaticPinPosition && doubleTapFirstTap.value) {
          const tapX = currentStaticPinPosition.x - doubleTapFirstTap.value.x;
          const tapY = currentStaticPinPosition.y - doubleTapFirstTap.value.y;

          const toX = offsetX.value + tapX / zoom.value;
          const toY = offsetY.value + tapY / zoom.value;

          // No animation-end callback here — the unified `_staticPinPosition`
          // reaction with UI-thread settle detection catches the final pin
          // position ~100ms after `withTiming` stops emitting frames, and
          // fires `onStaticPinPositionChange` once for the entire animation.
          offsetX.value = withTiming(toX, { duration: 200 });
          offsetY.value = withTiming(toY, { duration: 200 });
        }

        // Invoke the stable `onSingleTap` wrapper rather than the captured
        // `props.onSingleTap` — same staleness reasoning as `onLongPress`.
        onSingleTap(e, _getZoomableViewEventObject());
      }, props.doubleTapDelay);
    }
  };

  const publicMoveStaticPinTo = (position: Vec2D, duration?: number) => {
    'worklet';

    // Same hazard as publicMoveTo / publicMoveBy: a concurrent zoomTo would
    // keep recentering offsets via the unified transform reaction's
    // recompute branch, clobbering the offset writes below (direct `.value`
    // assignments cancel `withTiming` on the same SharedValue).
    cancelAnimation(zoom);
    zoomToDestination.value = undefined;

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

    // Cancel any in-flight zoomTo() so its zoom-centering reaction doesn't
    // fight the move we're about to apply — without this, a concurrent
    // zoomTo's per-tick offset recompute would clobber our final position.
    cancelAnimation(zoom);
    zoomToDestination.value = undefined;

    if (!originalWidth.value || !originalHeight.value) return;

    const offsetX = (newOffsetX - originalWidth.value / 2) / zoom.value;
    const offsetY = (newOffsetY - originalHeight.value / 2) / zoom.value;

    _setNewOffsetPosition(-offsetX, -offsetY);
  };

  /** Moves the zoomed view by the given delta in container coordinates. */
  const publicMoveBy = (offsetChangeX: number, offsetChangeY: number) => {
    'worklet';

    // Cancel any in-flight zoomTo() so its zoom-centering reaction doesn't
    // fight the move we're about to apply.
    cancelAnimation(zoom);
    zoomToDestination.value = undefined;

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
   * @param wasReleased — `true` only when the gesture ended via a genuine
   *   touch release (`onTouchesUp` with `numberOfTouches === 0`). The forced
   *   end on `numberOfTouches > 2` and the cancellation path
   *   (`onTouchesCancelled`) pass `false`. Default is `false` so adding a new
   *   call site cannot accidentally classify a non-release as a tap. Tap
   *   classification (`_resolveAndHandleTap`) only runs when `wasReleased`
   *   is `true` — otherwise multi-finger force-end and RNGH cancellations
   *   would each produce a spurious `onSingleTap` event.
   *
   * @private
   */
  const _handlePanResponderEnd = (
    e: GestureTouchEvent,
    wasReleased = false
  ) => {
    'worklet';

    if (wasReleased && !gestureType.value) {
      // Skip tap classification entirely if a long-press already fired during
      // this touch cycle, or if a 3+ finger force-end armed `forceEndPending`
      // earlier in this cycle — otherwise the same release would produce a
      // spurious single/double-tap event for what was a long-press or a
      // multi-finger gesture.
      if (longPressFired.value || forceEndPending.value) {
        longPressFired.value = false;
        forceEndPending.value = false;
      } else {
        runOnJS(_resolveAndHandleTap)(e);
      }
    }

    if (debug) runOnJS(setDebugPoints)([]);

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

    if (
      onPanResponderMoveWorkletShared.value.fn?.(
        e,
        _getZoomableViewEventObject()
      )
    ) {
      return;
    }

    // Only supports 2 touches and below,
    // any invalid number will cause the gesture to end.
    if (e.numberOfTouches <= 2) {
      if (!gestureStarted.value) {
        // Recovery from a 3+ finger transient that force-ended the
        // gesture: fingers are still down, so don't re-fire the
        // consumer-visible `onPanResponderGrant` or re-arm long-press.
        _handlePanResponderGrant(e, true);
      }
    } else {
      if (gestureStarted.value) {
        // Forced end on `numberOfTouches > 2` — the user is still touching
        // the screen, just with too many fingers. Pass `wasReleased=false`
        // (default) so this path does not run tap classification, and arm
        // `forceEndPending` so the eventual real release of these fingers
        // is also suppressed (per SPECS L178). Also clear stale double-tap
        // state — the touch cycle aborted before it could combine into a
        // double-tap with a future tap.
        forceEndPending.value = true;
        doubleTapFirstTapReleaseTimestamp.value = undefined;
        doubleTapFirstTap.value = undefined;
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
        // Pinch starts → previous tap-release timestamp can no longer
        // contribute to a double-tap; reset so the next 1-finger tap is
        // classified as a fresh first-tap.
        doubleTapFirstTapReleaseTimestamp.value = undefined;
        // Clear any stale zoomTo target so the unified transform reaction
        // doesn't fight pinch's own offset math — pinch computes its own
        // zoom centre and shouldn't be re-centered against the previous
        // `zoomTo()`'s destination.
        zoomToDestination.value = undefined;
      }
      gestureType.value = 'pinch';
      _handlePinching(e);
    } else if (e.numberOfTouches === 1) {
      const { dx, dy } = gestureState;

      if (longPressTimeout.value && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        runOnJS(clearLongPressTimeout)();
      }

      const isShiftGesture = Math.abs(dx) > 2 || Math.abs(dy) > 2;
      if (isShiftGesture) {
        // change some measurement states when switching gesture to ensure
        // a smooth transition. Both updates are gated by `isShiftGesture`
        // so sub-2px finger jitter on a held tap does not clobber the
        // double-tap window: real-device touch sensors emit sub-pixel
        // updates even for held fingers, so a reset gated only by
        // `gestureType.value !== 'shift'` would fire on every move event
        // before the threshold is crossed and silently drop double-taps.
        if (gestureType.value !== 'shift') {
          lastGestureCenterPosition.value = calcGestureCenterPoint(e);
          // Shift starts → previous tap-release timestamp can no longer
          // contribute to a double-tap; reset so the next tap is fresh.
          doubleTapFirstTapReleaseTimestamp.value = undefined;
        }
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
        // RNGH state machine order: UNDETERMINED → BEGAN (begin) → ACTIVE
        // (activate). Calling activate() first relies on activate's force-true
        // path to jump straight to ACTIVE, which makes the subsequent begin()
        // a no-op (ACTIVE cannot regress to BEGAN).
        stateManager.begin();
        stateManager.activate();
        firstTouch.value = { x: e.allTouches[0].x, y: e.allTouches[0].y };
        _handlePanResponderGrant(e);
      } else if (e.numberOfTouches >= 2) {
        // RNGH `onTouchesMove` only fires on actual position change, so a
        // user who places two fingers and pauses ~700ms before pinching
        // would otherwise see the single-finger long-press timer fire
        // through (the move-driven clear paths never run). Long-press is
        // a single-finger gesture — disarm it as soon as a second finger
        // arrives.
        runOnJS(clearLongPressTimeout)();
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
        // Genuine touch release — `wasReleased=true` enables tap
        // classification (single/double/long press resolution).
        _handlePanResponderEnd(e, true);
        stateManager.end();
      }
    })
    .onTouchesCancelled((e, stateManager) => {
      // RNGH cancellation — gesture aborted, not released. Pass
      // `wasReleased=false` (default) so this path does not produce a
      // spurious `onSingleTap`.
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
    <ReactNativeZoomableViewProvider
      value={{ zoom, inverseZoom, inverseZoomStyle, offsetX, offsetY }}
    >
      <GestureHandlerRootView>
        <GestureDetector gesture={gesture}>
          <View
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            style={styles.container}
            ref={zoomSubjectWrapperRef}
            onLayout={measureZoomSubject}
          >
            <Animated.View
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              style={[styles.zoomSubject, props.style, transformStyle]}
            >
              {children}
            </Animated.View>

            {visualTouchFeedbackEnabled &&
              stateTouches.map(
                (touch) =>
                  // Coerce `doubleTapDelay` to a strict boolean — bare
                  // `doubleTapDelay && (...)` evaluates to `0` when delay is
                  // `0`, and React will then try to render the literal `0` as
                  // a text child outside a <Text>, crashing with the
                  // "Text strings must be rendered within a <Text> component"
                  // error.
                  !!doubleTapDelay && (
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
    </ReactNativeZoomableViewProvider>
  );
};

export const ReactNativeZoomableView = forwardRef(ReactNativeZoomableViewInner);

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
