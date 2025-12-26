import { debounce, defaults } from 'lodash';
import React, {
  ForwardRefRenderFunction,
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
  makeMutable,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SharedValue } from '../node_modules/react-native-reanimated/src/commonTypes';
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

const ReactNativeZoomableViewContext = React.createContext<
  | {
      zoom: SharedValue<number>;
      // A style that applies the inverse zoom level, so that children stay the same size when zooming. Generic type for compatibility with React Native versions.
      inverseZoomStyle: { transform: { scale: number }[] };
      offsetX: SharedValue<number>;
      offsetY: SharedValue<number>;
    }
  | undefined
>(undefined);

export const Unzoom = ({
  left,
  top,
  children,
}: {
  left: number;
  top: number;
  children: React.ReactNode;
}) => {
  const context = React.useContext(ReactNativeZoomableViewContext);

  return (
    <Animated.View
      style={[
        context?.inverseZoomStyle,
        {
          width: 1,
          height: 1,
          position: 'absolute',
          left: `${left}%`,
          top: `${top}%`,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
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
    zoomEnabled: propZoomEnabled,
    maxZoom: propMaxZoom,
    minZoom: propMinZoom,
    pinchToZoomInSensitivity: propPinchToZoomInSensitivity,
    pinchToZoomOutSensitivity: propPinchToZoomOutSensitivity,
    movementSensibility: propMovementSensibility,
    panEnabled: propPanEnabled,
    disablePanOnInitialZoom: propDisablePanOnInitialZoom,
    initialZoom: propsInitialZoom,
    pinProps,
  } = props;

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const zoom = useSharedValue(1);
  const inverseZoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 / zoom.value }],
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
  const movementSensibility = useDerivedValue(() => propMovementSensibility);
  const onPanResponderGrant = useLatestCallback(
    props.onPanResponderGrant || (() => undefined)
  );
  const onPanResponderEnd = useLatestCallback(
    props.onPanResponderEnd || (() => undefined)
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

    onTransformWorklet?.(zoomableViewEvent);

    if (position) {
      onStaticPinPositionMoveWorklet?.(position);
      runOnJS(debouncedOnStaticPinPositionChange)(position);
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

    if (lastGestureCenterPosition.value && movementSensibility.value) {
      const dx = gestureCenterPoint.x - lastGestureCenterPosition.value.x;
      const dy = gestureCenterPoint.y - lastGestureCenterPosition.value.y;

      const shiftX = dx / zoom.value / movementSensibility.value;
      const shiftY = dy / zoom.value / movementSensibility.value;

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

          const animationsDone = makeMutable(0);
          const done = () => {
            'worklet';
            if (++animationsDone.value >= 2) runOnJS(_updateStaticPin)();
          };

          offsetX.value = withTiming(toX, { duration: 200 }, done);
          offsetY.value = withTiming(toY, { duration: 200 }, done);
        }

        props.onSingleTap?.(e, _getZoomableViewEventObject());
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
      if (!originalWidth.value || !originalHeight.value) return;

      const offsetX = (newOffsetX - originalWidth.value / 2) / zoom.value;
      const offsetY = (newOffsetY - originalHeight.value / 2) / zoom.value;

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
      stateManager.end();
    })
    .onFinalize(() => {
      firstTouch.value = undefined;
    });

  return (
    <ReactNativeZoomableViewContext.Provider
      value={{ zoom, offsetX, offsetY, inverseZoomStyle }}
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
              style={[
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
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

export { ReactNativeZoomableView, ReactNativeZoomableViewContext };
