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
import { getNextZoomStep } from './helper/getNextZoomStep';
import { useDebugPoints } from './hooks/useDebugPoints';
import { useLatestCallback } from './hooks/useLatestCallback';
import { useZoomSubject } from './hooks/useZoomSubject';
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
  const {
    wrapperRef: zoomSubjectWrapperRef,
    measure: measureZoomSubject,
    originalWidth,
    originalHeight,
    originalPageX,
    originalPageY,
    originalX,
    originalY,
  } = useZoomSubject();

  const [pinSize, setPinSize] = useState({ width: 0, height: 0 });
  const [stateTouches, setStateTouches] = useState<TouchPoint[]>([]);

  const { debugPoints, setDebugPoints, setPinchDebugPoints } = useDebugPoints({
    originalPageX,
    originalPageY,
  });

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

  const panAnimRef = useRef<Animated.ValueXY | null>(null);
  if (panAnimRef.current === null) {
    panAnimRef.current =
      props.panAnimatedValueXY ??
      new Animated.ValueXY({
        x: props.initialOffsetX ?? 0,
        y: props.initialOffsetY ?? 0,
      });
  }
  const panAnim = panAnimRef as React.MutableRefObject<Animated.ValueXY>;

  const zoomAnimRef = useRef<Animated.Value | null>(null);
  if (zoomAnimRef.current === null) {
    zoomAnimRef.current =
      props.zoomAnimatedValue ?? new Animated.Value(props.initialZoom || 1);
  }
  const zoomAnim = zoomAnimRef as React.MutableRefObject<Animated.Value>;

  const ownsPanAnim = useRef(props.panAnimatedValueXY == null);
  const ownsZoomAnim = useRef(props.zoomAnimatedValue == null);
  const isMounted = useRef(true);

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
  const panAnimOffsetListenerId = useRef<string>();
  const zoomAnimLevelListenerId = useRef<string>();
  const panAnimTransformListenerId = useRef<string>();
  const zoomAnimTransformListenerId = useRef<string>();
  const zoomToListenerId = useRef<string>();

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

  const _addTouch = useLatestCallback((touch: TouchPoint) => {
    touches.current.push(touch);
    setStateTouches([...touches.current]);
  });

  const _removeTouch = useLatestCallback((touch: TouchPoint) => {
    if (!isMounted.current) return;
    touches.current.splice(touches.current.indexOf(touch), 1);
    setStateTouches([...touches.current]);
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

  useLayoutEffect(() => {
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

  const originalWidthRef = useRef(originalWidth);
  originalWidthRef.current = originalWidth;
  const originalHeightRef = useRef(originalHeight);
  originalHeightRef.current = originalHeight;

  // Handle original measurements changed
  useLayoutEffect(() => {
    if (!originalWidth || !originalHeight) return;
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
    // Restore mounted flag at the top of every (re)mount. React 18 StrictMode
    // dev simulates mount → unmount → remount during development; the cleanup
    // below sets isMounted.current = false on the simulated unmount, so without
    // this re-set the second mount would observe the ref as permanently false
    // for the lifetime of the component — silently dropping the debounced
    // pin flush inside _fireSingleTapTimerBody and breaking
    // onStaticPinPositionChange after a single-tap pan. Mirrors the class
    // component's `this.mounted = true` in componentDidMount.
    isMounted.current = true;

    return () => {
      debouncedOnStaticPinPositionChange.cancel();

      if (singleTapTimeoutId.current) {
        clearTimeout(singleTapTimeoutId.current);
        singleTapTimeoutId.current = undefined;
      }
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = undefined;
      }

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
      if (zoomToListenerId.current) {
        zoomAnim.current.removeListener(zoomToListenerId.current);
        zoomToListenerId.current = undefined;
      }

      if (ownsPanAnim.current) panAnim.current.stopAnimation();
      if (ownsZoomAnim.current) zoomAnim.current.stopAnimation();

      isMounted.current = false;
    };
  }, []);

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

  // Read props.onLongPress at fire time, not at schedule time. The setTimeout
  // body is inside _handlePanResponderGrant's closure, so a bare
  // props.onLongPress?.(...) inside the timer would call the version captured
  // when the gesture started — a parent re-render during the 700ms window would
  // be ignored. The class component used this.props.onLongPress which React
  // updates on every render; useLatestCallback restores that semantic.
  const _fireOnLongPress = useLatestCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      props.onLongPress?.(e, gestureState, _getZoomableViewEventObject());
    }
  );

  /**
   * Cancels any in-flight zoomTo() animation: stops zoomAnim and removes the
   * pan-sync listener registered inside zoomTo(zoomCenter). Called by
   * publicMoveTo / publicMoveBy / _handlePanResponderGrant before applying
   * a programmatic pan or starting a new gesture so the cancelled zoomTo
   * cannot overwrite the new offset on its next animation frame.
   *
   * @return {number} the zoom level at the moment of cancellation
   */
  const _cancelInFlightZoomToAnimation = useLatestCallback(() => {
    let stoppedZoomLevel = zoomLevel.current;

    // Programmatic pan should win over any active zoomTo animation.
    // Stop the zoom first and remove its temporary pan-sync listener
    // so the next zoom frame cannot overwrite the requested offset.
    zoomAnim.current.stopAnimation((value) => {
      stoppedZoomLevel = value;
      zoomLevel.current = value;
    });

    if (zoomToListenerId.current) {
      zoomAnim.current.removeListener(zoomToListenerId.current);
      zoomToListenerId.current = undefined;
    }

    return stoppedZoomLevel;
  });

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
        _fireOnLongPress(e, gestureState);
        longPressTimeout.current = undefined;
        // After a confirmed long-press, clear pending double-tap state so the
        // subsequent release does not match the prior tap's timestamp and
        // spuriously fire onDoubleTap. Matters when longPressDuration <
        // doubleTapDelay.
        delete doubleTapFirstTapReleaseTimestamp.current;
        delete doubleTapFirstTap.current;
      }, props.longPressDuration);
    }

    props.onPanResponderGrant?.(e, gestureState, _getZoomableViewEventObject());

    // Capture the final animated value into the JS-side mirrors when stopping.
    // For native-driven animations the JS-side `offsetX`/`offsetY`/`zoomLevel`
    // refs are only written via the panAnim/zoomAnim listeners on JS-thread
    // ticks, which can lag the native value. Without the callback form, a new
    // gesture starting mid-animation would compute its first frame against a
    // stale JS mirror and produce a visible offset/zoom drift (SPECS.md
    // "stopAnimation with Callback"). For zoom we route through
    // `_cancelInFlightZoomToAnimation()` so any in-flight `zoomTo(zoomCenter)`
    // also has its temporary pan-sync listener removed — without that, the
    // listener keeps firing on every `zoomAnim.setValue()` in `_handlePinching`
    // and overwrites the gesture-computed offset with one anchored at the
    // cancelled zoomTo's center.
    panAnim.current.x.stopAnimation((x) => {
      offsetX.current = x;
    });
    panAnim.current.y.stopAnimation((y) => {
      offsetY.current = y;
    });
    _cancelInFlightZoomToAnimation();
    gestureStarted.current = true;
  });

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
      props.debug && setPinchDebugPoints(e, zoomCenter);

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

      onShiftingAfter?.(null, null, _getZoomableViewEventObject());
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

  // Read props.staticPinPosition / props.onZoomAfter at fire time, not at
  // schedule time. The .start() completion callback below runs ~animation
  // duration after publicZoomTo is invoked; without this wrapper the inner
  // lambda would close over the props snapshot at schedule time and miss
  // any parent re-render during the animation. Mirrors the pattern in
  // _fireSingleTapTimerBody and StaticPin's onPress/onLongPress refs.
  const _onPublicZoomToAnimationComplete = useLatestCallback(
    ({
      finished,
      capturedListenerId,
    }: {
      finished: boolean;
      capturedListenerId?: string;
    }) => {
      if (!isMounted.current) return;
      if (capturedListenerId) {
        zoomAnim.current.removeListener(capturedListenerId);
        if (zoomToListenerId.current === capturedListenerId) {
          zoomToListenerId.current = undefined;
        }
      }
      if (finished) {
        // Flush any pending debounced static-pin position change so
        // consumers observing pin position in onZoomAfter see the final
        // post-animation value, matching the pattern in
        // _handlePanResponderEnd.
        if (props.staticPinPosition) {
          debouncedOnStaticPinPositionChange.flush();
        }
        props.onZoomAfter?.(null, null, _getZoomableViewEventObject());
      }
    }
  );

  /**
   * Zooms to a specific level. A "zoom center" can be provided, which specifies
   * the point that will remain in the same position on the screen after the zoom.
   * The coordinates of the zoom center are viewport-relative (in pixels).
   * { x: 0, y: 0 } is the top-left corner of the viewport.
   * To zoom to the center of the viewport, use
   * { x: originalWidth / 2, y: originalHeight / 2 }.
   *
   * @param newZoomLevel
   * @param zoomCenter - If not supplied, the container's center is the zoom center
   */
  const publicZoomTo = useLatestCallback(
    (newZoomLevel: number, zoomCenter?: Vec2D) => {
      if (!props.zoomEnabled) return false;
      if (props.maxZoom != null && newZoomLevel > props.maxZoom) return false;
      if (props.minZoom != null && newZoomLevel < props.minZoom) return false;

      props.onZoomBefore?.(null, null, _getZoomableViewEventObject());

      // == Perform Pan Animation to preserve the zoom center while zooming ==
      // Defensive removal: if a previous publicZoomTo is still mid-animation
      // and the consumer triggers another, the prior listener would be
      // orphaned (its ID overwritten below) and continue firing for the rest
      // of its animation's lifetime.
      if (zoomToListenerId.current) {
        zoomAnim.current.removeListener(zoomToListenerId.current);
        zoomToListenerId.current = undefined;
      }
      if (zoomCenter) {
        // Calculates panAnim values based on changes in zoomAnim.
        let prevScale = zoomLevel.current;
        // Since zoomAnim is calculated in native driver,
        //  it will jitter panAnim once in a while,
        //  because here panAnim is being calculated in js.
        // However the jittering should mostly occur in simulator.
        zoomToListenerId.current = zoomAnim.current.addListener(
          ({ value: newScale }) => {
            panAnim.current.setValue({
              x: calcNewScaledOffsetForZoomCentering(
                offsetX.current,
                originalWidthRef.current,
                prevScale,
                newScale,
                zoomCenter.x
              ),
              y: calcNewScaledOffsetForZoomCentering(
                offsetY.current,
                originalHeightRef.current,
                prevScale,
                newScale,
                zoomCenter.y
              ),
            });
            prevScale = newScale;
          }
        );
      }

      // == Perform Zoom Animation ==
      // Capture listenerId locally so an interrupting zoomTo (rapid double
      // taps, programmatic chained zoomTo, zoom-slider ramps) cannot make
      // this start() callback clean up the SECOND call's listener. RN's
      // Animated.Value.animate stops a prior animation synchronously, firing
      // this callback with finished=false AFTER the ref has already been
      // overwritten — so reading the ref at fire time would read listener2.
      // Mirrors the class component's local-capture + identity-equality
      // pattern.
      const capturedListenerId = zoomToListenerId.current;
      getZoomToAnimation(zoomAnim.current, newZoomLevel).start(
        ({ finished }) => {
          _onPublicZoomToAnimationComplete({ finished, capturedListenerId });
        }
      );
      // == Zoom Animation Ends ==

      return true;
    }
  );

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

    const nextZoomStep = getNextZoomStep({
      zoomLevel: zoomLevel.current,
      zoomStep: props.zoomStep,
      maxZoom: props.maxZoom,
      initialZoom: props.initialZoom,
    });
    if (nextZoomStep == null) return;

    // define new zoom position coordinates
    const zoomPositionCoordinates = {
      x: e.nativeEvent.pageX - originalPageX,
      y: e.nativeEvent.pageY - originalPageY,
    };

    // if doubleTapZoomToCenter enabled -> always zoom to center instead.
    // publicZoomTo expects viewport-relative coordinates where center is
    // (originalWidth/2, originalHeight/2) — not (0,0). See publicZoomTo JSDoc.
    if (doubleTapZoomToCenter) {
      zoomPositionCoordinates.x = originalWidth / 2;
      zoomPositionCoordinates.y = originalHeight / 2;
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
  const _fireSingleTapTimerBody = useLatestCallback(
    (e: GestureResponderEvent) => {
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
          // that midpoint as the final pin position would be wrong. The
          // isMounted guard mirrors the class's `this.mounted` check: when the
          // consumer owns panAnim, unmount cleanup skips stopAnimation() so
          // the animation can complete with finished=true post-unmount.
          if (finished && isMounted.current) {
            // Flush the pending debounced onStaticPinPositionChange so the
            // final post-animation pin position is delivered synchronously.
            // A direct (non-debounced) call here caused a double-fire
            // (immediate + debounce timer ~100ms later).
            debouncedOnStaticPinPositionChange.flush();
          }
        });
      }

      props.onSingleTap?.(e, _getZoomableViewEventObject());
    }
  );

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
        _fireSingleTapTimerBody(e);
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

      const stoppedZoomLevel = _cancelInFlightZoomToAnimation();
      const offsetX = (newOffsetX - originalWidth / 2) / stoppedZoomLevel;
      const offsetY = (newOffsetY - originalHeight / 2) / stoppedZoomLevel;

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
      const stoppedZoomLevel = _cancelInFlightZoomToAnimation();
      const newOffsetX =
        (offsetX.current * stoppedZoomLevel - offsetChangeX) / stoppedZoomLevel;
      const newOffsetY =
        (offsetY.current * stoppedZoomLevel - offsetChangeY) / stoppedZoomLevel;

      _setNewOffsetPosition(newOffsetX, newOffsetY);
    }
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomTo: publicZoomTo,
      zoomBy: publicZoomBy,
      moveTo: publicMoveTo,
      moveBy: publicMoveBy,
      moveStaticPinTo: publicMoveStaticPinTo,
      get gestureStarted() {
        return gestureStarted.current;
      },
    }),
    []
  );

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
      // Flush the pending debounced onStaticPinPositionChange so the final
      // post-gesture pin position is delivered synchronously. A direct
      // (non-debounced) call here would double-fire (immediate + debounce
      // timer ~100ms later).
      debouncedOnStaticPinPositionChange.flush();
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
          // Clear stale double-tap state on pinch start. Without this, a
          // tap-then-pinch-then-tap sequence within doubleTapDelay can match
          // the first tap's timestamp and spuriously fire onDoubleTap.
          delete doubleTapFirstTapReleaseTimestamp.current;
          delete doubleTapFirstTap.current;
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
          // Clear stale double-tap state when a drag actually starts. Without
          // this, a tap-pan-tap sequence within doubleTapDelay would match
          // the first tap's timestamp and spuriously fire onDoubleTap.
          if (gestureType.current !== 'shift') {
            delete doubleTapFirstTapReleaseTimestamp.current;
            delete doubleTapFirstTap.current;
          }
          gestureType.current = 'shift';
          _handleShifting(gestureState);
        }
      }
    }
  );

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
    []
  );

  return (
    <View
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      style={styles.container}
      {...gestureHandlers.panHandlers}
      ref={zoomSubjectWrapperRef}
      onLayout={measureZoomSubject}
    >
      <Animated.View
        style={[
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
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
          onParentTerminate={_handlePanResponderTerminate}
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

export default React.forwardRef(ReactNativeZoomableView);

export { ReactNativeZoomableView };
