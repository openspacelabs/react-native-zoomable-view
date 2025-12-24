"use strict";

import { debounce, defaults } from 'lodash';
import React, { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { getZoomToAnimation } from './animations';
import { AnimatedTouchFeedback } from './components';
import { StaticPin } from './components/StaticPin';
import { DebugTouchPoint } from './debugHelper';
import { calcGestureCenterPoint, calcGestureTouchDistance, calcNewScaledOffsetForZoomCentering } from './helper';
import { viewportPositionToImagePosition } from './helper/coordinateConversion';
import { useLatestCallback } from './hooks/useLatestCallback';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const ReactNativeZoomableView = (props, ref) => {
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [originalPageX, setOriginalPageX] = useState(0);
  const [originalPageY, setOriginalPageY] = useState(0);
  const [originalX, setOriginalX] = useState(0);
  const [originalY, setOriginalY] = useState(0);
  const [pinSize, setPinSize] = useState({
    width: 0,
    height: 0
  });
  const [debugPoints, setDebugPoints] = useState([]);
  const [stateTouches, setStateTouches] = useState([]);
  const zoomSubjectWrapperRef = useRef(null);
  const gestureHandlers = useRef();
  const doubleTapFirstTapReleaseTimestamp = useRef();
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
    disablePanOnInitialZoom: false
  });
  const panAnim = useRef(new Animated.ValueXY({
    x: 0,
    y: 0
  }));
  const zoomAnim = useRef(new Animated.Value(1));
  const offsetX = useRef(0);
  const offsetY = useRef(0);
  const zoomLevel = useRef(1);
  const lastGestureCenterPosition = useRef(null);
  const lastGestureTouchDistance = useRef(150);
  const gestureType = useRef();
  const gestureStarted = useRef(false);

  /**
   * Last press time (used to evaluate whether user double tapped)
   */
  const longPressTimeout = useRef();
  const onTransformInvocationInitialized = useRef();
  const singleTapTimeoutId = useRef();
  const touches = useRef([]);
  const doubleTapFirstTap = useRef();
  const measureZoomSubjectInterval = useRef();
  useLayoutEffect(() => {
    gestureHandlers.current = PanResponder.create({
      onStartShouldSetPanResponder: _handleStartShouldSetPanResponder,
      onPanResponderGrant: _handlePanResponderGrant,
      onPanResponderMove: _handlePanResponderMove,
      onPanResponderRelease: _handlePanResponderEnd,
      onPanResponderTerminate: (evt, gestureState) => {
        // We should also call _handlePanResponderEnd
        // to properly perform cleanups when the gesture is terminated
        // (aka gesture handling responsibility is taken over by another component).
        // This also fixes a weird issue where
        // on real device, sometimes onPanResponderRelease is not called when you lift 2 fingers up,
        // but onPanResponderTerminate is called instead for no apparent reason.
        _handlePanResponderEnd(evt, gestureState);
        props.onPanResponderTerminate?.(evt, gestureState, _getZoomableViewEventObject());
      },
      onPanResponderTerminationRequest: (evt, gestureState) => !!props.onPanResponderTerminationRequest?.(evt, gestureState, _getZoomableViewEventObject()),
      // Defaults to true to prevent parent components, such as React Navigation's tab view, from taking over as responder.
      onShouldBlockNativeResponder: (evt, gestureState) => props.onShouldBlockNativeResponder?.(evt, gestureState, _getZoomableViewEventObject()) ?? true,
      onStartShouldSetPanResponderCapture: (evt, gestureState) => !!props.onStartShouldSetPanResponderCapture?.(evt, gestureState),
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => !!props.onMoveShouldSetPanResponderCapture?.(evt, gestureState)
    });
    if (props.zoomAnimatedValue) zoomAnim.current = props.zoomAnimatedValue;
    if (props.panAnimatedValueXY) panAnim.current = props.panAnimatedValueXY;
    if (props.initialZoom) zoomLevel.current = props.initialZoom;
    if (props.initialOffsetX != null) offsetX.current = props.initialOffsetX;
    if (props.initialOffsetY != null) offsetY.current = props.initialOffsetY;
    panAnim.current.setValue({
      x: offsetX.current,
      y: offsetY.current
    });
    zoomAnim.current.setValue(zoomLevel.current);
    panAnim.current.addListener(({
      x,
      y
    }) => {
      offsetX.current = x;
      offsetY.current = y;
    });
    zoomAnim.current.addListener(({
      value
    }) => {
      zoomLevel.current = value;
    });
  }, []);
  const {
    zoomEnabled
  } = props;
  const initialZoom = useRef(props.initialZoom);
  initialZoom.current = props.initialZoom;
  useLayoutEffect(() => {
    if (!zoomEnabled && initialZoom.current) {
      zoomLevel.current = initialZoom.current;
      zoomAnim.current.setValue(zoomLevel.current);
    }
  }, [zoomEnabled]);
  useLayoutEffect(() => {
    if (!onTransformInvocationInitialized.current && _invokeOnTransform().successful) {
      panAnim.current.addListener(() => _invokeOnTransform());
      zoomAnim.current.addListener(() => _invokeOnTransform());
      onTransformInvocationInitialized.current = true;
    }
  },
  // FIXME: deps has implicit coupling with internal _invokeOnTransform logic
  [originalWidth, originalHeight]);
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
      y: originalY
    };
    onLayout.current?.({
      nativeEvent: {
        layout
      }
    });
    if (onTransformInvocationInitialized.current) _invokeOnTransform();
  }, [originalHeight, originalWidth, originalPageX, originalPageY, originalX, originalY]);

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
      measureZoomSubjectInterval.current && clearInterval(measureZoomSubjectInterval.current);
    };
  }, []);
  const onStaticPinPositionChange = useLatestCallback(props.onStaticPinPositionChange || (() => undefined));
  const debouncedOnStaticPinPositionChange = useMemo(() => debounce(onStaticPinPositionChange, 100), []);

  /**
   * try to invoke onTransform
   * @private
   */
  const _invokeOnTransform = useLatestCallback(() => {
    const zoomableViewEvent = _getZoomableViewEventObject();
    const position = _staticPinPosition();
    if (!zoomableViewEvent.originalWidth || !zoomableViewEvent.originalHeight) return {
      successful: false
    };
    props.onTransform?.(zoomableViewEvent);
    if (position) {
      props.onStaticPinPositionMove?.(position);
      debouncedOnStaticPinPositionChange(position);
    }
    return {
      successful: true
    };
  });

  /**
   * Returns additional information about components current state for external event hooks
   *
   * @returns {{}}
   * @private
   */
  const _getZoomableViewEventObject = useLatestCallback((overwriteObj = {}) => {
    return {
      zoomLevel: zoomLevel.current,
      offsetX: offsetX.current,
      offsetY: offsetY.current,
      originalHeight,
      originalWidth,
      originalPageX,
      originalPageY,
      ...overwriteObj
    };
  });

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
        zoomSubjectWrapperRef.current?.measure((x, y, width, height, pageX, pageY) => {
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
        });
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
  const _handleStartShouldSetPanResponder = useLatestCallback((e, gestureState) => {
    if (props.onStartShouldSetPanResponder) {
      props.onStartShouldSetPanResponder(e, gestureState, _getZoomableViewEventObject(), false);
    }

    // Always set pan responder on start
    // of gesture so we can handle tap.
    // "Pan threshold validation" will be handled
    // in `onPanResponderMove` instead of in `onMoveShouldSetPanResponder`
    return true;
  });

  /**
   * Calculates pinch distance
   *
   * @param e
   * @param gestureState
   * @private
   */
  const _handlePanResponderGrant = useLatestCallback((e, gestureState) => {
    if (props.onLongPress) {
      e.persist();
      longPressTimeout.current = setTimeout(() => {
        props.onLongPress?.(e, gestureState, _getZoomableViewEventObject());
        longPressTimeout.current = undefined;
      }, props.longPressDuration);
    }
    props.onPanResponderGrant?.(e, gestureState, _getZoomableViewEventObject());
    panAnim.current.stopAnimation();
    zoomAnim.current.stopAnimation();
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
  const _handlePanResponderEnd = useLatestCallback((e, gestureState) => {
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
  const _handlePanResponderMove = useLatestCallback((e, gestureState) => {
    if (props.onPanResponderMove) {
      if (props.onPanResponderMove(e, gestureState, _getZoomableViewEventObject())) {
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
        lastGestureCenterPosition.current = calcGestureCenterPoint(e, gestureState);
        lastGestureTouchDistance.current = calcGestureTouchDistance(e, gestureState);
      }
      gestureType.current = 'pinch';
      _handlePinching(e, gestureState);
    } else if (gestureState.numberActiveTouches === 1) {
      if (longPressTimeout.current && (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5)) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = undefined;
      }
      // change some measurement states when switching gesture to ensure a smooth transition
      if (gestureType.current !== 'shift') {
        lastGestureCenterPosition.current = calcGestureCenterPoint(e, gestureState);
      }
      const {
        dx,
        dy
      } = gestureState;
      const isShiftGesture = Math.abs(dx) > 2 || Math.abs(dy) > 2;
      if (isShiftGesture) {
        gestureType.current = 'shift';
        _handleShifting(gestureState);
      }
    }
  });

  /**
   * Handles the pinch movement and zooming
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  const _handlePinching = useLatestCallback((e, gestureState) => {
    if (!props.zoomEnabled) return;
    const {
      maxZoom,
      minZoom,
      pinchToZoomInSensitivity,
      pinchToZoomOutSensitivity
    } = props;
    const distance = calcGestureTouchDistance(e, gestureState);
    if (props.onZoomBefore && props.onZoomBefore(e, gestureState, _getZoomableViewEventObject())) {
      return;
    }
    if (!distance) return;
    if (!lastGestureTouchDistance.current) return;

    // define the new zoom level and take zoom level sensitivity into consideration
    const zoomGrowthFromLastGestureState = distance / lastGestureTouchDistance.current;
    lastGestureTouchDistance.current = distance;
    const pinchToZoomSensitivity = zoomGrowthFromLastGestureState < 1 ? pinchToZoomOutSensitivity : pinchToZoomInSensitivity;
    if (pinchToZoomSensitivity == null) return;
    const deltaGrowth = zoomGrowthFromLastGestureState - 1;
    // 0 - no resistance
    // 10 - 90% resistance
    const deltaGrowthAdjustedBySensitivity = deltaGrowth * (1 - pinchToZoomSensitivity * 9 / 100);
    let newZoomLevel = zoomLevel.current * (1 + deltaGrowthAdjustedBySensitivity);

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
      y: gestureCenterPoint.y - originalPageY
    };
    if (props.staticPinPosition) {
      // When we use a static pin position, the zoom centre is the same as that position,
      // otherwise the pin moves around way too much while zooming.
      zoomCenter = {
        x: props.staticPinPosition.x,
        y: props.staticPinPosition.y
      };
    }

    // Uncomment to debug
    props.debug && _setPinchDebugPoints(e, zoomCenter);
    const oldOffsetX = offsetX.current;
    const oldOffsetY = offsetY.current;
    const oldScale = zoomLevel.current;
    const newScale = newZoomLevel;
    if (!originalHeight || !originalWidth) return;
    let newOffsetY = calcNewScaledOffsetForZoomCentering(oldOffsetY, originalHeight, oldScale, newScale, zoomCenter.y);
    let newOffsetX = calcNewScaledOffsetForZoomCentering(oldOffsetX, originalWidth, oldScale, newScale, zoomCenter.x);
    const offsetShift = _calcOffsetShiftSinceLastGestureState(gestureCenterPoint);
    if (offsetShift) {
      newOffsetX += offsetShift.x;
      newOffsetY += offsetShift.y;
    }
    offsetX.current = newOffsetX;
    offsetY.current = newOffsetY;
    zoomLevel.current = newScale;
    panAnim.current.setValue({
      x: offsetX.current,
      y: offsetY.current
    });
    zoomAnim.current.setValue(zoomLevel.current);
    props.onZoomAfter?.(e, gestureState, _getZoomableViewEventObject());
  });

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const _setPinchDebugPoints = useLatestCallback((gestureResponderEvent, zoomCenter, ...points) => {
    const {
      touches
    } = gestureResponderEvent.nativeEvent;
    setDebugPoints([{
      x: touches[0].pageX - originalPageX,
      y: touches[0].pageY - originalPageY
    }, {
      x: touches[1].pageX - originalPageX,
      y: touches[1].pageY - originalPageY
    }, zoomCenter, ...points]);
  });

  /**
   * Calculates the amount the offset should shift since the last position during panning
   *
   * @param {Vec2D} gestureCenterPoint
   *
   * @private
   */
  const _calcOffsetShiftSinceLastGestureState = useLatestCallback(gestureCenterPoint => {
    const {
      movementSensibility
    } = props;
    let shift = null;
    if (lastGestureCenterPosition.current && movementSensibility) {
      const dx = gestureCenterPoint.x - lastGestureCenterPosition.current.x;
      const dy = gestureCenterPoint.y - lastGestureCenterPosition.current.y;
      const shiftX = dx / zoomLevel.current / movementSensibility;
      const shiftY = dy / zoomLevel.current / movementSensibility;
      shift = {
        x: shiftX,
        y: shiftY
      };
    }
    lastGestureCenterPosition.current = gestureCenterPoint;
    return shift;
  });

  /**
   * Handles movement by tap and move
   *
   * @param gestureState
   *
   * @private
   */
  const _handleShifting = useLatestCallback(gestureState => {
    // Skips shifting if panEnabled is false or disablePanOnInitialZoom is true and we're on the initial zoom level
    if (!props.panEnabled || props.disablePanOnInitialZoom && zoomLevel.current === props.initialZoom) {
      return;
    }
    const shift = _calcOffsetShiftSinceLastGestureState({
      x: gestureState.moveX,
      y: gestureState.moveY
    });
    if (!shift) return;
    const newOffsetX = offsetX.current + shift.x;
    const newOffsetY = offsetY.current + shift.y;
    if (props.debug && originalPageX && originalPageY) {
      const x = gestureState.moveX - originalPageX;
      const y = gestureState.moveY - originalPageY;
      setDebugPoints([{
        x,
        y
      }]);
    }
    _setNewOffsetPosition(newOffsetX, newOffsetY);
  });

  /**
   * Set the state to offset moved
   *
   * @param {number} newOffsetX
   * @param {number} newOffsetY
   * @returns
   */
  const _setNewOffsetPosition = useLatestCallback((newOffsetX, newOffsetY) => {
    const {
      onShiftingBefore,
      onShiftingAfter
    } = props;
    if (onShiftingBefore?.(null, null, _getZoomableViewEventObject())) {
      return;
    }
    offsetX.current = newOffsetX;
    offsetY.current = newOffsetY;
    panAnim.current.setValue({
      x: offsetX.current,
      y: offsetY.current
    });
    zoomAnim.current.setValue(zoomLevel.current);
    onShiftingAfter?.(null, null, _getZoomableViewEventObject());
  });

  /**
   * Check whether the press event is double tap
   * or single tap and handle the event accordingly
   *
   * @param e
   *
   * @private
   */
  const _resolveAndHandleTap = useLatestCallback(e => {
    const now = Date.now();
    if (doubleTapFirstTapReleaseTimestamp.current && props.doubleTapDelay && now - doubleTapFirstTapReleaseTimestamp.current < props.doubleTapDelay) {
      doubleTapFirstTap.current && _addTouch({
        ...doubleTapFirstTap.current,
        id: now.toString(),
        isSecondTap: true
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
        y: e.nativeEvent.pageY - originalPageY
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
              y: offsetY.current + tapY / zoomLevel.current
            },
            useNativeDriver: true,
            duration: 200
          }).start(() => {
            _updateStaticPin();
          });
        }
        props.onSingleTap?.(e, _getZoomableViewEventObject());
      }, props.doubleTapDelay);
    }
  });
  const publicMoveStaticPinTo = useLatestCallback((position, duration) => {
    const {
      staticPinPosition,
      contentWidth,
      contentHeight
    } = props;
    if (!staticPinPosition) return;
    if (!originalWidth || !originalHeight) return;
    if (!contentWidth || !contentHeight) return;

    // Offset for the static pin
    const pinX = staticPinPosition.x - originalWidth / 2;
    const pinY = staticPinPosition.y - originalHeight / 2;
    offsetX.current = contentWidth / 2 - position.x + pinX / zoomLevel.current;
    offsetY.current = contentHeight / 2 - position.y + pinY / zoomLevel.current;
    if (duration) {
      Animated.timing(panAnim.current, {
        toValue: {
          x: offsetX.current,
          y: offsetY.current
        },
        useNativeDriver: true,
        duration
      }).start();
    } else {
      panAnim.current.setValue({
        x: offsetX.current,
        y: offsetY.current
      });
    }
  });
  const _staticPinPosition = useLatestCallback(() => {
    if (!props.staticPinPosition) return;
    if (!props.contentWidth || !props.contentHeight) return;
    return viewportPositionToImagePosition({
      viewportPosition: {
        x: props.staticPinPosition.x,
        y: props.staticPinPosition.y
      },
      imageSize: {
        height: props.contentHeight,
        width: props.contentWidth
      },
      zoomableEvent: {
        ..._getZoomableViewEventObject(),
        offsetX: offsetX.current,
        offsetY: offsetY.current,
        zoomLevel: zoomLevel.current
      }
    });
  });
  const _updateStaticPin = useLatestCallback(() => {
    const position = _staticPinPosition();
    if (!position) return;
    props.onStaticPinPositionChange?.(position);
  });
  const _addTouch = useLatestCallback(touch => {
    touches.current.push(touch);
    setStateTouches([...touches.current]);
  });
  const _removeTouch = useLatestCallback(touch => {
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
  const _handleDoubleTap = useLatestCallback(e => {
    const {
      onDoubleTapBefore,
      onDoubleTapAfter,
      doubleTapZoomToCenter
    } = props;
    onDoubleTapBefore?.(e, _getZoomableViewEventObject());
    const nextZoomStep = _getNextZoomStep();
    if (nextZoomStep == null) return;

    // define new zoom position coordinates
    const zoomPositionCoordinates = {
      x: e.nativeEvent.pageX - originalPageX,
      y: e.nativeEvent.pageY - originalPageY
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
   * Returns the next zoom step based on current step and zoomStep property.
   * If we are zoomed all the way in -> return to initialzoom
   *
   * @returns {*}
   */
  const _getNextZoomStep = useLatestCallback(() => {
    const {
      zoomStep,
      maxZoom,
      initialZoom
    } = props;
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
  const publicZoomTo = useLatestCallback((newZoomLevel, zoomCenter) => {
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
      listenerId = zoomAnim.current.addListener(({
        value: newScale
      }) => {
        panAnim.current.setValue({
          x: calcNewScaledOffsetForZoomCentering(offsetX.current, originalWidth, prevScale, newScale, zoomCenter.x),
          y: calcNewScaledOffsetForZoomCentering(offsetY.current, originalHeight, prevScale, newScale, zoomCenter.y)
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
  const publicZoomBy = useLatestCallback(zoomLevelChange => {
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
  const publicMoveTo = useLatestCallback((newOffsetX, newOffsetY) => {
    if (!originalWidth || !originalHeight) return;
    const offsetX = (newOffsetX - originalWidth / 2) / zoomLevel.current;
    const offsetY = (newOffsetY - originalHeight / 2) / zoomLevel.current;
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
  const publicMoveBy = useLatestCallback((offsetChangeX, offsetChangeY) => {
    const newOffsetX = (offsetX.current * zoomLevel.current - offsetChangeX) / zoomLevel.current;
    const newOffsetY = (offsetY.current * zoomLevel.current - offsetChangeY) / zoomLevel.current;
    _setNewOffsetPosition(newOffsetX, newOffsetY);
  });
  useImperativeHandle(ref, () => ({
    zoomTo: publicZoomTo,
    zoomBy: publicZoomBy,
    moveTo: publicMoveTo,
    moveBy: publicMoveBy,
    moveStaticPinTo: publicMoveStaticPinTo,
    get gestureStarted() {
      return gestureStarted.current;
    }
  }));
  const {
    staticPinIcon,
    children,
    visualTouchFeedbackEnabled,
    doubleTapDelay,
    staticPinPosition,
    onStaticPinLongPress,
    onStaticPinPress,
    pinProps
  } = props;
  return /*#__PURE__*/_jsxs(View, {
    style: styles.container,
    ...gestureHandlers.current?.panHandlers,
    ref: zoomSubjectWrapperRef,
    onLayout: measureZoomSubject,
    children: [/*#__PURE__*/_jsx(Animated.View, {
      style: [styles.zoomSubject, props.style, {
        transform: [
        // In RN79, we need to split the scale into X and Y to avoid
        // the content getting pixelated when zooming in
        {
          scaleX: zoomAnim.current
        }, {
          scaleY: zoomAnim.current
        }, ...panAnim.current.getTranslateTransform()]
      }],
      children: children
    }), visualTouchFeedbackEnabled && stateTouches.map(touch => doubleTapDelay && /*#__PURE__*/_jsx(AnimatedTouchFeedback, {
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
      return /*#__PURE__*/_jsx(DebugTouchPoint, {
        x: x,
        y: y
      }, index);
    }), staticPinPosition && /*#__PURE__*/_jsx(StaticPin, {
      staticPinIcon: staticPinIcon,
      staticPinPosition: staticPinPosition,
      pinSize: pinSize,
      onPress: onStaticPinPress,
      onLongPress: onStaticPinLongPress,
      onParentMove: _handlePanResponderMove,
      setPinSize: setPinSize,
      pinProps: pinProps
    })]
  });
};
const styles = StyleSheet.create({
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
export default ReactNativeZoomableView;
export { ReactNativeZoomableView };
//# sourceMappingURL=ReactNativeZoomableView.js.map