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
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderCallbacks,
  PanResponderGestureState,
  StyleSheet,
  View,
} from 'react-native';

import { getZoomToAnimation } from './animations';
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

  const zoomSubjectWrapperRef = useRef<View>(null);
  const doubleTapFirstTapReleaseTimestamp = useRef<number>();

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

  // Lazy init considers the consumer-provided animated values on first render so
  // the Animated.View transform binds to the correct value before commit. If we
  // assigned consumer values inside useLayoutEffect, the first JSX evaluation
  // would already have subscribed the View to the dormant internal Animated
  // object — gesture writes would update the consumer's value but the View
  // would stay bound to the internal one until something else triggered a
  // re-render, breaking the External Animated Values contract (SPECS.md).
  const panAnim = useRef(
    props.panAnimatedValueXY ?? new Animated.ValueXY({ x: 0, y: 0 })
  );
  const zoomAnim = useRef(props.zoomAnimatedValue ?? new Animated.Value(1));

  // Capture ownership at mount: if the consumer passed an external animated
  // value, they own its lifecycle and we must not stopAnimation() on unmount
  // (per SPECS.md "External Animated Values" — "component won't stop its
  // animation on unmount"). Captured once so later prop changes can't flip
  // ownership mid-life and leave us stopping a value we don't own.
  const ownsPanAnim = useRef(props.panAnimatedValueXY == null);
  const ownsZoomAnim = useRef(props.zoomAnimatedValue == null);

  const offsetX = useRef(0);
  const offsetY = useRef(0);

  const zoomLevel = useRef(1);
  const lastGestureCenterPosition = useRef<{ x: number; y: number } | null>(
    null
  );
  const lastGestureTouchDistance = useRef<number | null>(150);
  const gestureType = useRef<'pinch' | 'shift'>();

  const gestureStarted = useRef(false);

  /**
   * Last press time (used to evaluate whether user double tapped)
   */
  const longPressTimeout = useRef<NodeJS.Timeout>();
  const onTransformInvocationInitialized = useRef<boolean>();
  const singleTapTimeoutId = useRef<NodeJS.Timeout>();
  const touches = useRef<TouchPoint[]>([]);
  const doubleTapFirstTap = useRef<TouchPoint>();
  const measureZoomSubjectInterval = useRef<NodeJS.Timer>();

  // Listener IDs captured at registration so we can removeListener on unmount.
  // Without these, listeners attached to panAnim/zoomAnim leak past unmount and
  // continue mutating refs / firing callbacks on a dead component.
  const panAnimOffsetListenerId = useRef<string>();
  const zoomAnimLevelListenerId = useRef<string>();
  const panAnimTransformListenerId = useRef<string>();
  const zoomAnimTransformListenerId = useRef<string>();

  useLayoutEffect(() => {
    // panAnim/zoomAnim refs are already initialized to the consumer-provided
    // animated values via lazy useRef above — assigning them here would be
    // redundant and could not run early enough anyway (this effect fires after
    // the first commit, by which time the Animated.View is already bound).

    if (props.initialZoom) zoomLevel.current = props.initialZoom;
    if (props.initialOffsetX != null) offsetX.current = props.initialOffsetX;
    if (props.initialOffsetY != null) offsetY.current = props.initialOffsetY;

    panAnim.current.setValue({ x: offsetX.current, y: offsetY.current });
    zoomAnim.current.setValue(zoomLevel.current);
    panAnimOffsetListenerId.current = panAnim.current.addListener(
      ({ x, y }) => {
        offsetX.current = x;
        offsetY.current = y;
      }
    );
    zoomAnimLevelListenerId.current = zoomAnim.current.addListener(
      ({ value }) => {
        zoomLevel.current = value;
      }
    );
  }, []);

  const { zoomEnabled } = props;
  const initialZoom = useRef(props.initialZoom);
  initialZoom.current = props.initialZoom;
  useLayoutEffect(() => {
    if (!zoomEnabled && initialZoom.current) {
      zoomLevel.current = initialZoom.current;
      zoomAnim.current.setValue(zoomLevel.current);
    }
  }, [zoomEnabled]);

  useLayoutEffect(
    () => {
      if (
        !onTransformInvocationInitialized.current &&
        _invokeOnTransform().successful
      ) {
        panAnimTransformListenerId.current = panAnim.current.addListener(() =>
          _invokeOnTransform()
        );
        zoomAnimTransformListenerId.current = zoomAnim.current.addListener(() =>
          _invokeOnTransform()
        );
        onTransformInvocationInitialized.current = true;
      }
    },
    // FIXME: deps has implicit coupling with internal _invokeOnTransform logic
    [originalWidth, originalHeight]
  );

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

    if (onTransformInvocationInitialized.current) _invokeOnTransform();
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
    if (onTransformInvocationInitialized.current) _invokeOnTransform();
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

      // Cancel pending debounced static-pin callback so it cannot fire after unmount.
      debouncedOnStaticPinPositionChange.cancel();

      // Clear pending tap/long-press timeouts so their callbacks (which call
      // user-provided onSingleTap / onLongPress) cannot fire after unmount.
      if (singleTapTimeoutId.current) {
        clearTimeout(singleTapTimeoutId.current);
        singleTapTimeoutId.current = undefined;
      }
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = undefined;
      }

      // Remove listeners attached to panAnim/zoomAnim so they don't keep
      // mutating refs or invoking _invokeOnTransform on a dead component.
      if (panAnimOffsetListenerId.current) {
        panAnim.current.removeListener(panAnimOffsetListenerId.current);
      }
      if (zoomAnimLevelListenerId.current) {
        zoomAnim.current.removeListener(zoomAnimLevelListenerId.current);
      }
      if (panAnimTransformListenerId.current) {
        panAnim.current.removeListener(panAnimTransformListenerId.current);
      }
      if (zoomAnimTransformListenerId.current) {
        zoomAnim.current.removeListener(zoomAnimTransformListenerId.current);
      }

      // Stop any in-flight pan/zoom animations so their step callbacks don't
      // fire on unmounted state. Guarded by ownership: when the consumer
      // provided an external animated value (panAnimatedValueXY /
      // zoomAnimatedValue), they own its lifecycle and the SPECS.md "External
      // Animated Values" contract states the component won't stop their
      // animation on unmount. Calling stopAnimation here would kill an
      // in-flight animation the consumer is driving externally.
      if (ownsPanAnim.current) panAnim.current.stopAnimation();
      if (ownsZoomAnim.current) zoomAnim.current.stopAnimation();
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
   * try to invoke onTransform
   * @private
   */
  const _invokeOnTransform = useLatestCallback(() => {
    const zoomableViewEvent = _getZoomableViewEventObject();
    const position = _staticPinPosition();

    if (!zoomableViewEvent.originalWidth || !zoomableViewEvent.originalHeight)
      return { successful: false };

    props.onTransform?.(zoomableViewEvent);

    if (position) {
      props.onStaticPinPositionMove?.(position);
      debouncedOnStaticPinPositionChange(position);
    }

    return { successful: true };
  });

  /**
   * Returns additional information about components current state for external event hooks
   *
   * @returns {{}}
   * @private
   */
  const _getZoomableViewEventObject = useLatestCallback(
    (overwriteObj: Partial<ZoomableViewEvent> = {}): ZoomableViewEvent => {
      return {
        zoomLevel: zoomLevel.current,
        offsetX: offsetX.current,
        offsetY: offsetY.current,
        originalHeight,
        originalWidth,
        originalPageX,
        originalPageY,
        ...overwriteObj,
      };
    }
  );

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

  /**
   * Handles the start of touch events and checks for taps
   *
   * @param e
   * @param gestureState
   * @returns {boolean}
   *
   * @private
   */
  const _handleStartShouldSetPanResponder = useLatestCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      if (props.onStartShouldSetPanResponder) {
        props.onStartShouldSetPanResponder(
          e,
          gestureState,
          _getZoomableViewEventObject(),
          false
        );
      }

      // Always set pan responder on start
      // of gesture so we can handle tap.
      // "Pan threshold validation" will be handled
      // in `onPanResponderMove` instead of in `onMoveShouldSetPanResponder`
      return true;
    }
  );

  /**
   * Calculates pinch distance
   *
   * @param e
   * @param gestureState
   * @private
   */
  const _handlePanResponderGrant: NonNullable<
    PanResponderCallbacks['onPanResponderGrant']
  > = useLatestCallback((e, gestureState) => {
    // Cancel any pending single-tap timer when a new gesture starts. Without this,
    // a tap-then-long-press sequence fires both onSingleTap (from the prior tap's
    // pending timer) and onLongPress for what should be a single long-press.
    if (singleTapTimeoutId.current) {
      clearTimeout(singleTapTimeoutId.current);
      singleTapTimeoutId.current = undefined;
    }

    if (props.onLongPress) {
      e.persist();
      longPressTimeout.current = setTimeout(() => {
        props.onLongPress?.(e, gestureState, _getZoomableViewEventObject());
        longPressTimeout.current = undefined;
      }, props.longPressDuration);
    }

    props.onPanResponderGrant?.(e, gestureState, _getZoomableViewEventObject());

    // Capture the final animated value into the JS-side mirrors when stopping.
    // For native-driven animations the JS-side `offsetX`/`offsetY`/`zoomLevel`
    // refs are only written via the panAnim/zoomAnim listeners on JS-thread
    // ticks, which can lag the native value. Without the callback form, a new
    // gesture starting mid-animation would compute its first frame against a
    // stale JS mirror and produce a visible offset/zoom drift (SPECS.md
    // "stopAnimation with Callback").
    panAnim.current.x.stopAnimation((x) => {
      offsetX.current = x;
    });
    panAnim.current.y.stopAnimation((y) => {
      offsetY.current = y;
    });
    zoomAnim.current.stopAnimation((zoom) => {
      zoomLevel.current = zoom;
    });
    gestureStarted.current = true;
  });

  /**
   * Handles the end of touch events
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  const _handlePanResponderEnd: NonNullable<
    PanResponderCallbacks['onPanResponderEnd']
  > = useLatestCallback((e, gestureState) => {
    if (!gestureType.current) {
      _resolveAndHandleTap(e);
    }

    setDebugPoints([]);

    lastGestureCenterPosition.current = null;

    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = undefined;
    }

    props.onPanResponderEnd?.(e, gestureState, _getZoomableViewEventObject());

    if (gestureType.current === 'pinch') {
      props.onZoomEnd?.(e, gestureState, _getZoomableViewEventObject());
    } else if (gestureType.current === 'shift') {
      props.onShiftingEnd?.(e, gestureState, _getZoomableViewEventObject());
    }

    if (props.staticPinPosition) {
      _updateStaticPin();
    }

    gestureType.current = undefined;
    gestureStarted.current = false;
  });

  /**
   * Handles the actual movement of our pan responder
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  const _handlePanResponderMove = useLatestCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      if (props.onPanResponderMove) {
        if (
          props.onPanResponderMove(
            e,
            gestureState,
            _getZoomableViewEventObject()
          )
        ) {
          return false;
        }
      }

      // Only supports 2 touches and below,
      // any invalid number will cause the gesture to end.
      if (gestureState.numberActiveTouches <= 2) {
        if (!gestureStarted.current) {
          _handlePanResponderGrant(e, gestureState);
        }
      } else {
        if (gestureStarted.current) {
          _handlePanResponderEnd(e, gestureState);
        }
        return true;
      }

      if (gestureState.numberActiveTouches === 2) {
        if (longPressTimeout.current) {
          clearTimeout(longPressTimeout.current);
          longPressTimeout.current = undefined;
        }

        // change some measurement states when switching gesture to ensure a smooth transition
        if (gestureType.current !== 'pinch') {
          lastGestureCenterPosition.current = calcGestureCenterPoint(
            e,
            gestureState
          );
          lastGestureTouchDistance.current = calcGestureTouchDistance(
            e,
            gestureState
          );
        }
        gestureType.current = 'pinch';
        _handlePinching(e, gestureState);
      } else if (gestureState.numberActiveTouches === 1) {
        if (
          longPressTimeout.current &&
          (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5)
        ) {
          clearTimeout(longPressTimeout.current);
          longPressTimeout.current = undefined;
        }
        // change some measurement states when switching gesture to ensure a smooth transition
        if (gestureType.current !== 'shift') {
          lastGestureCenterPosition.current = calcGestureCenterPoint(
            e,
            gestureState
          );
        }

        const { dx, dy } = gestureState;
        const isShiftGesture = Math.abs(dx) > 2 || Math.abs(dy) > 2;
        if (isShiftGesture) {
          gestureType.current = 'shift';
          _handleShifting(gestureState);
        }
      }
    }
  );

  /**
   * Handles the pinch movement and zooming
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  const _handlePinching = useLatestCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      if (!props.zoomEnabled) return;

      const {
        maxZoom,
        minZoom,
        pinchToZoomInSensitivity,
        pinchToZoomOutSensitivity,
      } = props;

      const distance = calcGestureTouchDistance(e, gestureState);

      if (
        props.onZoomBefore &&
        props.onZoomBefore(e, gestureState, _getZoomableViewEventObject())
      ) {
        return;
      }

      if (!distance) return;
      if (!lastGestureTouchDistance.current) return;

      // define the new zoom level and take zoom level sensitivity into consideration
      const zoomGrowthFromLastGestureState =
        distance / lastGestureTouchDistance.current;
      lastGestureTouchDistance.current = distance;

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

      let newZoomLevel =
        zoomLevel.current * (1 + deltaGrowthAdjustedBySensitivity);

      // make sure max and min zoom levels are respected
      if (maxZoom != null && newZoomLevel > maxZoom) {
        newZoomLevel = maxZoom;
      }

      if (minZoom != null && newZoomLevel < minZoom) {
        newZoomLevel = minZoom;
      }

      const gestureCenterPoint = calcGestureCenterPoint(e, gestureState);

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

      const oldOffsetX = offsetX.current;
      const oldOffsetY = offsetY.current;
      const oldScale = zoomLevel.current;
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

      offsetX.current = newOffsetX;
      offsetY.current = newOffsetY;
      zoomLevel.current = newScale;

      panAnim.current.setValue({ x: offsetX.current, y: offsetY.current });
      zoomAnim.current.setValue(zoomLevel.current);

      props.onZoomAfter?.(e, gestureState, _getZoomableViewEventObject());
    }
  );

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const _setPinchDebugPoints = useLatestCallback(
    (
      gestureResponderEvent: GestureResponderEvent,
      zoomCenter: Vec2D,
      ...points: Vec2D[]
    ) => {
      const { touches } = gestureResponderEvent.nativeEvent;

      setDebugPoints([
        {
          x: touches[0].pageX - originalPageX,
          y: touches[0].pageY - originalPageY,
        },
        {
          x: touches[1].pageX - originalPageX,
          y: touches[1].pageY - originalPageY,
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
  const _calcOffsetShiftSinceLastGestureState = useLatestCallback(
    (gestureCenterPoint: Vec2D) => {
      const { movementSensibility } = props;

      let shift = null;

      if (lastGestureCenterPosition.current && movementSensibility) {
        const dx = gestureCenterPoint.x - lastGestureCenterPosition.current.x;
        const dy = gestureCenterPoint.y - lastGestureCenterPosition.current.y;

        const shiftX = dx / zoomLevel.current / movementSensibility;
        const shiftY = dy / zoomLevel.current / movementSensibility;

        shift = {
          x: shiftX,
          y: shiftY,
        };
      }

      lastGestureCenterPosition.current = gestureCenterPoint;

      return shift;
    }
  );

  /**
   * Handles movement by tap and move
   *
   * @param gestureState
   *
   * @private
   */
  const _handleShifting = useLatestCallback(
    (gestureState: PanResponderGestureState) => {
      // Skips shifting if panEnabled is false or disablePanOnInitialZoom is true and we're on the initial zoom level
      if (
        !props.panEnabled ||
        (props.disablePanOnInitialZoom &&
          zoomLevel.current === props.initialZoom)
      ) {
        return;
      }
      const shift = _calcOffsetShiftSinceLastGestureState({
        x: gestureState.moveX,
        y: gestureState.moveY,
      });
      if (!shift) return;

      const newOffsetX = offsetX.current + shift.x;
      const newOffsetY = offsetY.current + shift.y;

      if (props.debug && originalPageX && originalPageY) {
        const x = gestureState.moveX - originalPageX;
        const y = gestureState.moveY - originalPageY;
        setDebugPoints([{ x, y }]);
      }

      _setNewOffsetPosition(newOffsetX, newOffsetY);
    }
  );

  /**
   * Set the state to offset moved
   *
   * @param {number} newOffsetX
   * @param {number} newOffsetY
   * @returns
   */
  const _setNewOffsetPosition = useLatestCallback(
    (newOffsetX: number, newOffsetY: number) => {
      const { onShiftingBefore, onShiftingAfter } = props;

      if (onShiftingBefore?.(null, null, _getZoomableViewEventObject())) {
        return;
      }

      offsetX.current = newOffsetX;
      offsetY.current = newOffsetY;

      panAnim.current.setValue({ x: offsetX.current, y: offsetY.current });
      zoomAnim.current.setValue(zoomLevel.current);

      onShiftingAfter?.(null, null, _getZoomableViewEventObject());
    }
  );

  /**
   * Check whether the press event is double tap
   * or single tap and handle the event accordingly
   *
   * @param e
   *
   * @private
   */
  const _resolveAndHandleTap = useLatestCallback((e: GestureResponderEvent) => {
    const now = Date.now();
    if (
      doubleTapFirstTapReleaseTimestamp.current &&
      props.doubleTapDelay &&
      now - doubleTapFirstTapReleaseTimestamp.current < props.doubleTapDelay
    ) {
      doubleTapFirstTap.current &&
        _addTouch({
          ...doubleTapFirstTap.current,
          id: now.toString(),
          isSecondTap: true,
        });
      singleTapTimeoutId.current && clearTimeout(singleTapTimeoutId.current);
      delete doubleTapFirstTapReleaseTimestamp.current;
      delete singleTapTimeoutId.current;
      delete doubleTapFirstTap.current;
      _handleDoubleTap(e);
    } else {
      doubleTapFirstTapReleaseTimestamp.current = now;
      doubleTapFirstTap.current = {
        id: now.toString(),
        x: e.nativeEvent.pageX - originalPageX,
        y: e.nativeEvent.pageY - originalPageY,
      };
      _addTouch(doubleTapFirstTap.current);

      // persist event so e.nativeEvent is preserved after a timeout delay
      e.persist();
      singleTapTimeoutId.current = setTimeout(() => {
        delete doubleTapFirstTapReleaseTimestamp.current;
        delete singleTapTimeoutId.current;

        // Pan to the tapped location
        if (props.staticPinPosition && doubleTapFirstTap.current) {
          const tapX = props.staticPinPosition.x - doubleTapFirstTap.current.x;
          const tapY = props.staticPinPosition.y - doubleTapFirstTap.current.y;

          Animated.timing(panAnim.current, {
            toValue: {
              x: offsetX.current + tapX / zoomLevel.current,
              y: offsetY.current + tapY / zoomLevel.current,
            },
            useNativeDriver: true,
            duration: 200,
          }).start(({ finished }) => {
            // Only commit the static pin position when the animation actually
            // completed. If a new gesture interrupted the animation,
            // _handlePanResponderGrant called stopAnimation() and the callback
            // fires with finished=false at an intermediate offset — reporting
            // that midpoint as the final pin position would be wrong.
            if (finished) _updateStaticPin();
          });
        }

        props.onSingleTap?.(e, _getZoomableViewEventObject());
      }, props.doubleTapDelay);
    }
  });

  const publicMoveStaticPinTo = useLatestCallback(
    (position: Vec2D, duration?: number) => {
      const { staticPinPosition, contentWidth, contentHeight } = props;

      if (!staticPinPosition) return;
      if (!originalWidth || !originalHeight) return;
      if (!contentWidth || !contentHeight) return;

      // Offset for the static pin
      const pinX = staticPinPosition.x - originalWidth / 2;
      const pinY = staticPinPosition.y - originalHeight / 2;

      offsetX.current =
        contentWidth / 2 - position.x + pinX / zoomLevel.current;
      offsetY.current =
        contentHeight / 2 - position.y + pinY / zoomLevel.current;

      if (duration) {
        Animated.timing(panAnim.current, {
          toValue: { x: offsetX.current, y: offsetY.current },
          useNativeDriver: true,
          duration,
        }).start();
      } else {
        panAnim.current.setValue({ x: offsetX.current, y: offsetY.current });
      }
    }
  );

  const _staticPinPosition = useLatestCallback(() => {
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
      zoomableEvent: {
        ..._getZoomableViewEventObject(),
        offsetX: offsetX.current,
        offsetY: offsetY.current,
        zoomLevel: zoomLevel.current,
      },
    });
  });

  const _updateStaticPin = useLatestCallback(() => {
    const position = _staticPinPosition();
    if (!position) return;
    props.onStaticPinPositionChange?.(position);
  });

  const _addTouch = useLatestCallback((touch: TouchPoint) => {
    touches.current.push(touch);
    setStateTouches([...touches.current]);
  });

  const _removeTouch = useLatestCallback((touch: TouchPoint) => {
    touches.current.splice(touches.current.indexOf(touch), 1);
    setStateTouches([...touches.current]);
  });

  /**
   * Handles the double tap event
   *
   * @param e
   *
   * @private
   */
  const _handleDoubleTap = useLatestCallback((e: GestureResponderEvent) => {
    const { onDoubleTapBefore, onDoubleTapAfter, doubleTapZoomToCenter } =
      props;

    onDoubleTapBefore?.(e, _getZoomableViewEventObject());

    const nextZoomStep = _getNextZoomStep();
    if (nextZoomStep == null) return;

    // define new zoom position coordinates
    const zoomPositionCoordinates = {
      x: e.nativeEvent.pageX - originalPageX,
      y: e.nativeEvent.pageY - originalPageY,
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

    if (zoomLevel.current.toFixed(2) === maxZoom.toFixed(2)) {
      return initialZoom;
    }

    if (zoomStep == null) return;

    const nextZoomStep = zoomLevel.current * (1 + zoomStep);
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

      props.onZoomBefore?.(null, null, _getZoomableViewEventObject());

      // == Perform Pan Animation to preserve the zoom center while zooming ==
      let listenerId = '';
      if (zoomCenter) {
        // Calculates panAnim values based on changes in zoomAnim.
        let prevScale = zoomLevel.current;
        // Since zoomAnim is calculated in native driver,
        //  it will jitter panAnim once in a while,
        //  because here panAnim is being calculated in js.
        // However the jittering should mostly occur in simulator.
        listenerId = zoomAnim.current.addListener(({ value: newScale }) => {
          panAnim.current.setValue({
            x: calcNewScaledOffsetForZoomCentering(
              offsetX.current,
              originalWidth,
              prevScale,
              newScale,
              zoomCenter.x
            ),
            y: calcNewScaledOffsetForZoomCentering(
              offsetY.current,
              originalHeight,
              prevScale,
              newScale,
              zoomCenter.y
            ),
          });
          prevScale = newScale;
        });
      }

      // == Perform Zoom Animation ==
      getZoomToAnimation(zoomAnim.current, newZoomLevel).start(() => {
        zoomAnim.current.removeListener(listenerId);
      });
      // == Zoom Animation Ends ==

      props.onZoomAfter?.(null, null, _getZoomableViewEventObject());
      return true;
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
    return publicZoomTo(zoomLevel.current + zoomLevelChange);
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

      const offsetX = (newOffsetX - originalWidth / 2) / zoomLevel.current;
      const offsetY = (newOffsetY - originalHeight / 2) / zoomLevel.current;

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
        (offsetX.current * zoomLevel.current - offsetChangeX) /
        zoomLevel.current;
      const newOffsetY =
        (offsetY.current * zoomLevel.current - offsetChangeY) /
        zoomLevel.current;

      _setNewOffsetPosition(newOffsetX, newOffsetY);
    }
  );

  // The five PanResponder callbacks below are wrapped in useLatestCallback so
  // they always invoke the latest props, matching the four already-wrapped
  // handlers above. Without this, PanResponder.create runs once with the
  // first-render props and these callbacks would silently call stale prop
  // references for the lifetime of the component.
  const _handlePanResponderTerminate = useLatestCallback(
    (
      e: GestureResponderEvent,
      gestureState: PanResponderGestureState
    ): void => {
      // We should also call _handlePanResponderEnd
      // to properly perform cleanups when the gesture is terminated
      // (aka gesture handling responsibility is taken over by another component).
      // This also fixes a weird issue where
      // on real device, sometimes onPanResponderRelease is not called when you lift 2 fingers up,
      // but onPanResponderTerminate is called instead for no apparent reason.
      _handlePanResponderEnd(e, gestureState);
      props.onPanResponderTerminate?.(
        e,
        gestureState,
        _getZoomableViewEventObject()
      );
    }
  );

  const _handlePanResponderTerminationRequest = useLatestCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) =>
      !!props.onPanResponderTerminationRequest?.(
        e,
        gestureState,
        _getZoomableViewEventObject()
      )
  );

  // Defaults to true to prevent parent components, such as React Navigation's tab view, from taking over as responder.
  const _handleShouldBlockNativeResponder = useLatestCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) =>
      props.onShouldBlockNativeResponder?.(
        e,
        gestureState,
        _getZoomableViewEventObject()
      ) ?? true
  );

  const _handleStartShouldSetPanResponderCapture = useLatestCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) =>
      !!props.onStartShouldSetPanResponderCapture?.(e, gestureState)
  );

  const _handleMoveShouldSetPanResponderCapture = useLatestCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) =>
      !!props.onMoveShouldSetPanResponderCapture?.(e, gestureState)
  );

  // Build the PanResponder synchronously during the first render so that
  // gesture handlers are attached on the very first commit. A previous
  // implementation deferred PanResponder.create to a useLayoutEffect, which
  // left the View with no pan handlers until the next state-triggered
  // re-render. Because every callback here is the stable wrapper returned by
  // useLatestCallback, a one-shot create is correct and the closure stays
  // up-to-date with the latest props.
  const gestureHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: _handleStartShouldSetPanResponder,
        onPanResponderGrant: _handlePanResponderGrant,
        onPanResponderMove: _handlePanResponderMove,
        onPanResponderRelease: _handlePanResponderEnd,
        onPanResponderTerminate: _handlePanResponderTerminate,
        onPanResponderTerminationRequest: _handlePanResponderTerminationRequest,
        onShouldBlockNativeResponder: _handleShouldBlockNativeResponder,
        onStartShouldSetPanResponderCapture:
          _handleStartShouldSetPanResponderCapture,
        onMoveShouldSetPanResponderCapture:
          _handleMoveShouldSetPanResponderCapture,
      }),
    // Stable wrappers — created once for the lifetime of the component.
    []
  );

  useImperativeHandle(ref, () => ({
    zoomTo: publicZoomTo,
    zoomBy: publicZoomBy,
    moveTo: publicMoveTo,
    moveBy: publicMoveBy,
    moveStaticPinTo: publicMoveStaticPinTo,
    get gestureStarted() {
      return gestureStarted.current;
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

  return (
    <View
      style={styles.container}
      {...gestureHandlers.panHandlers}
      ref={zoomSubjectWrapperRef}
      onLayout={measureZoomSubject}
    >
      <Animated.View
        style={[
          styles.zoomSubject,
          props.style,
          {
            transform: [
              // In RN79, we need to split the scale into X and Y to avoid
              // the content getting pixelated when zooming in
              { scaleX: zoomAnim.current },
              { scaleY: zoomAnim.current },
              ...panAnim.current.getTranslateTransform(),
            ],
          },
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

      {staticPinPosition && (
        <StaticPin
          staticPinIcon={staticPinIcon}
          staticPinPosition={staticPinPosition}
          pinSize={pinSize}
          onPress={onStaticPinPress}
          onLongPress={onStaticPinLongPress}
          onParentMove={_handlePanResponderMove}
          onParentRelease={_handlePanResponderEnd}
          onParentTerminate={(evt, gestureState) => {
            _handlePanResponderEnd(evt, gestureState);
            props.onPanResponderTerminate?.(
              evt,
              gestureState,
              _getZoomableViewEventObject()
            );
          }}
          longPressDuration={props.longPressDuration}
          setPinSize={setPinSize}
          pinProps={pinProps}
        />
      )}
    </View>
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

// Wrap with forwardRef so the ref argument actually reaches
// useImperativeHandle. Without this wrapper, ref={...} from consumers is
// dropped and every method exposed by useImperativeHandle (zoomTo, zoomBy,
// moveTo, moveBy, moveStaticPinTo, gestureStarted) is unreachable.
export default React.forwardRef(ReactNativeZoomableView);

export { ReactNativeZoomableView };
