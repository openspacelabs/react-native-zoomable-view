"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.ReactNativeZoomableView = void 0;
var _lodash = require("lodash");
var _react = _interopRequireWildcard(require("react"));
var _reactNative = require("react-native");
var _animations = require("./animations");
var _components = require("./components");
var _StaticPin = require("./components/StaticPin");
var _debugHelper = require("./debugHelper");
var _helper = require("./helper");
var _applyPanBoundariesToOffset = require("./helper/applyPanBoundariesToOffset");
var _coordinateConversion = require("./helper/coordinateConversion");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const initialState = {
  originalWidth: 0,
  originalHeight: 0,
  originalPageX: 0,
  originalPageY: 0,
  originalX: 0,
  originalY: 0,
  pinSize: {
    width: 0,
    height: 0
  }
};
class ReactNativeZoomableView extends _react.Component {
  static defaultProps = {
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
    bindToBorders: true,
    zoomStep: 0.5,
    onLongPress: null,
    longPressDuration: 700,
    contentWidth: undefined,
    contentHeight: undefined,
    panBoundaryPadding: 0,
    visualTouchFeedbackEnabled: true,
    staticPinPosition: undefined,
    staticPinIcon: undefined,
    onStaticPinPositionChange: undefined,
    onStaticPinPositionMove: undefined,
    animatePin: true,
    disablePanOnInitialZoom: false
  };
  panAnim = new _reactNative.Animated.ValueXY({
    x: 0,
    y: 0
  });
  zoomAnim = new _reactNative.Animated.Value(1);
  pinAnim = new _reactNative.Animated.ValueXY({
    x: 0,
    y: 0
  });
  __offsets = {
    x: {
      value: 0,
      boundaryCrossedAnimInEffect: false
    },
    y: {
      value: 0,
      boundaryCrossedAnimInEffect: false
    }
  };
  zoomLevel = 1;
  lastGestureCenterPosition = null;
  lastGestureTouchDistance = null;
  _gestureStarted = false;
  set gestureStarted(v) {
    this._gestureStarted = v;
  }
  get gestureStarted() {
    return this._gestureStarted;
  }

  /**
   * Last press time (used to evaluate whether user double tapped)
   * @type {number}
   */
  longPressTimeout = null;
  touches = [];
  constructor(props) {
    super(props);
    // This needs to be done before anything else to initialize the state.
    // Otherwise, the logic below may reference the state when it's undefined,
    // causing runtime errors.
    this.state = {
      ...initialState
    };
    this.gestureHandlers = _reactNative.PanResponder.create({
      onStartShouldSetPanResponder: this._handleStartShouldSetPanResponder,
      onPanResponderGrant: this._handlePanResponderGrant,
      onPanResponderMove: this._handlePanResponderMove,
      onPanResponderRelease: this._handlePanResponderEnd,
      onPanResponderTerminate: (evt, gestureState) => {
        // We should also call _handlePanResponderEnd
        // to properly perform cleanups when the gesture is terminated
        // (aka gesture handling responsibility is taken over by another component).
        // This also fixes a weird issue where
        // on real device, sometimes onPanResponderRelease is not called when you lift 2 fingers up,
        // but onPanResponderTerminate is called instead for no apparent reason.
        this._handlePanResponderEnd(evt, gestureState);
        this.props.onPanResponderTerminate?.(evt, gestureState, this._getZoomableViewEventObject());
      },
      onPanResponderTerminationRequest: (evt, gestureState) => !!this.props.onPanResponderTerminationRequest?.(evt, gestureState, this._getZoomableViewEventObject()),
      // Defaults to true to prevent parent components, such as React Navigation's tab view, from taking over as responder.
      onShouldBlockNativeResponder: (evt, gestureState) => this.props.onShouldBlockNativeResponder?.(evt, gestureState, this._getZoomableViewEventObject()) ?? true,
      onStartShouldSetPanResponderCapture: (evt, gestureState) => !!this.props.onStartShouldSetPanResponderCapture?.(evt, gestureState),
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => !!this.props.onMoveShouldSetPanResponderCapture?.(evt, gestureState)
    });
    this.zoomSubjectWrapperRef = /*#__PURE__*/(0, _react.createRef)();
    if (this.props.zoomAnimatedValue) this.zoomAnim = this.props.zoomAnimatedValue;
    if (this.props.panAnimatedValueXY) this.panAnim = this.props.panAnimatedValueXY;
    if (this.props.initialZoom) this.zoomLevel = this.props.initialZoom;
    if (this.props.initialOffsetX != null) this.offsetX = this.props.initialOffsetX;
    if (this.props.initialOffsetY != null) this.offsetY = this.props.initialOffsetY;
    this.panAnim.setValue({
      x: this.offsetX,
      y: this.offsetY
    });
    this.zoomAnim.setValue(this.zoomLevel);
    this.panAnim.addListener(({
      x,
      y
    }) => {
      this.offsetX = x;
      this.offsetY = y;
    });
    this.zoomAnim.addListener(({
      value
    }) => {
      this.zoomLevel = value;
    });
    this.lastGestureTouchDistance = 150;
    this.gestureType = null;
  }
  raisePin() {
    if (!this.props.animatePin) return;
    _reactNative.Animated.timing(this.pinAnim, {
      toValue: {
        x: 0,
        y: -10
      },
      useNativeDriver: true,
      easing: _reactNative.Easing.out(_reactNative.Easing.ease),
      duration: 100
    }).start();
  }
  dropPin() {
    if (!this.props.animatePin) return;
    _reactNative.Animated.timing(this.pinAnim, {
      toValue: {
        x: 0,
        y: 0
      },
      useNativeDriver: true,
      easing: _reactNative.Easing.out(_reactNative.Easing.ease),
      duration: 100
    }).start();
  }
  set offsetX(x) {
    this.__setOffset('x', x);
  }
  set offsetY(y) {
    this.__setOffset('y', y);
  }
  get offsetX() {
    return this.__getOffset('x');
  }
  get offsetY() {
    return this.__getOffset('y');
  }
  __setOffset(axis, offset) {
    const offsetState = this.__offsets[axis];
    if (this.props.bindToBorders) {
      const containerSize = axis === 'x' ? this.state.originalWidth : this.state.originalHeight;
      const contentSize = axis === 'x' ? this.props.contentWidth || this.state.originalWidth : this.props.contentHeight || this.state.originalHeight;
      const boundOffset = contentSize && containerSize && this.props.panBoundaryPadding != null ? (0, _applyPanBoundariesToOffset.applyPanBoundariesToOffset)(offset, containerSize, contentSize, this.zoomLevel, this.props.panBoundaryPadding) : offset;
      if (!this.gestureType && !offsetState.boundaryCrossedAnimInEffect) {
        const boundariesApplied = boundOffset !== offset && boundOffset.toFixed(3) !== offset.toFixed(3);
        if (boundariesApplied) {
          offsetState.boundaryCrossedAnimInEffect = true;
          (0, _animations.getBoundaryCrossedAnim)(this.panAnim[axis], boundOffset).start(() => {
            offsetState.boundaryCrossedAnimInEffect = false;
          });
          return;
        }
      }
    }
    offsetState.value = offset;
  }
  __getOffset(axis) {
    return this.__offsets[axis].value;
  }
  componentDidUpdate(prevProps, prevState) {
    const {
      zoomEnabled,
      initialZoom
    } = this.props;
    if (prevProps.zoomEnabled && !zoomEnabled && initialZoom) {
      this.zoomLevel = initialZoom;
      this.zoomAnim.setValue(this.zoomLevel);
    }
    if (!this.onTransformInvocationInitialized && this._invokeOnTransform().successful) {
      this.panAnim.addListener(() => this._invokeOnTransform());
      this.zoomAnim.addListener(() => this._invokeOnTransform());
      this.onTransformInvocationInitialized = true;
    }
    const currState = this.state;
    const originalMeasurementsChanged = currState.originalHeight !== prevState.originalHeight || currState.originalWidth !== prevState.originalWidth || currState.originalPageX !== prevState.originalPageX || currState.originalPageY !== prevState.originalPageY || currState.originalX !== prevState.originalX || currState.originalY !== prevState.originalY;
    const staticPinPositionChanged = prevProps.staticPinPosition?.x !== this.props.staticPinPosition?.x || prevProps.staticPinPosition?.y !== this.props.staticPinPosition?.y;

    // We use a custom `onLayout` event, so the clients can stay in-sync
    // with when the internal measurements are actually saved to the state,
    // thus helping them apply transformations at more accurate timings
    if (originalMeasurementsChanged) {
      const layout = {
        width: currState.originalWidth,
        height: currState.originalHeight,
        x: currState.originalX,
        y: currState.originalY
      };
      this.props.onLayout?.({
        nativeEvent: {
          layout
        }
      });
    }
    if (this.onTransformInvocationInitialized && (originalMeasurementsChanged || staticPinPositionChanged)) {
      this._invokeOnTransform();
    }
  }
  componentDidMount() {
    this.measureZoomSubject();
    // We've already run `grabZoomSubjectOriginalMeasurements` at various events
    // to make sure the measurements are promptly updated.
    // However, there might be cases we haven't accounted for, especially when
    // native processes are involved. To account for those cases,
    // we'll use an interval here to ensure we're always up-to-date.
    // The `setState` in `grabZoomSubjectOriginalMeasurements` won't trigger a rerender
    // if the values given haven't changed, so we're not running performance risk here.
    this.measureZoomSubjectInterval = setInterval(this.measureZoomSubject, 1e3);
  }
  componentWillUnmount() {
    this.measureZoomSubjectInterval && clearInterval(this.measureZoomSubjectInterval);
  }
  debouncedOnStaticPinPositionChange = (0, _lodash.debounce)(position => this.props.onStaticPinPositionChange?.(position), 100);

  /**
   * try to invoke onTransform
   * @private
   */
  _invokeOnTransform() {
    const zoomableViewEvent = this._getZoomableViewEventObject();
    const position = this._staticPinPosition();
    if (!zoomableViewEvent.originalWidth || !zoomableViewEvent.originalHeight) return {
      successful: false
    };
    this.props.onTransform?.(zoomableViewEvent);
    if (position) {
      this.props.onStaticPinPositionMove?.(position);
      this.debouncedOnStaticPinPositionChange(position);
    }
    return {
      successful: true
    };
  }

  /**
   * Returns additional information about components current state for external event hooks
   *
   * @returns {{}}
   * @private
   */
  _getZoomableViewEventObject(overwriteObj = {}) {
    return {
      zoomLevel: this.zoomLevel,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      originalHeight: this.state.originalHeight,
      originalWidth: this.state.originalWidth,
      originalPageX: this.state.originalPageX,
      originalPageY: this.state.originalPageY,
      ...overwriteObj
    };
  }

  /**
   * Get the original box dimensions and save them for later use.
   * (They will be used to calculate boxBorders)
   *
   * @private
   */
  measureZoomSubject = () => {
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
        this.zoomSubjectWrapperRef.current?.measure((x, y, width, height, pageX, pageY) => {
          // When the component is off-screen, these become all 0s, so we don't set them
          // to avoid messing up calculations, especially ones that are done right after
          // the component transitions from hidden to visible.
          if (!pageX && !pageY && !width && !height) return;

          // If these values are all the same, don't re-set them in state
          // this way we don't re-render
          if (this.state.originalX === x && this.state.originalY === y && this.state.originalWidth === width && this.state.originalHeight === height && this.state.originalPageX === pageX && this.state.originalPageY === pageY) {
            return;
          }
          this.setState({
            originalX: x,
            originalY: y,
            originalWidth: width,
            originalHeight: height,
            originalPageX: pageX,
            originalPageY: pageY
          });
        });
      });
    });
  };

  /**
   * Handles the start of touch events and checks for taps
   *
   * @param e
   * @param gestureState
   * @returns {boolean}
   *
   * @private
   */
  _handleStartShouldSetPanResponder = (e, gestureState) => {
    if (this.props.onStartShouldSetPanResponder) {
      this.props.onStartShouldSetPanResponder(e, gestureState, this._getZoomableViewEventObject(), false);
    }

    // Always set pan responder on start
    // of gesture so we can handle tap.
    // "Pan threshold validation" will be handled
    // in `onPanResponderMove` instead of in `onMoveShouldSetPanResponder`
    return true;
  };

  /**
   * Calculates pinch distance
   *
   * @param e
   * @param gestureState
   * @private
   */
  _handlePanResponderGrant = (e, gestureState) => {
    if (this.props.onLongPress) {
      e.persist();
      this.longPressTimeout = setTimeout(() => {
        this.props.onLongPress?.(e, gestureState, this._getZoomableViewEventObject());
        this.longPressTimeout = null;
      }, this.props.longPressDuration);
    }
    this.props.onPanResponderGrant?.(e, gestureState, this._getZoomableViewEventObject());
    this.panAnim.stopAnimation();
    this.zoomAnim.stopAnimation();
    this.gestureStarted = true;
    this.raisePin();
  };

  /**
   * Handles the end of touch events
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  _handlePanResponderEnd = (e, gestureState) => {
    if (!this.gestureType) {
      this._resolveAndHandleTap(e);
    }
    this.setState({
      debugPoints: []
    });
    this.lastGestureCenterPosition = null;
    const disableMomentum = this.props.disableMomentum || this.props.panEnabled && this.gestureType === 'shift' && this.props.disablePanOnInitialZoom && this.zoomLevel === this.props.initialZoom;

    // Trigger final shift animation unless disablePanOnInitialZoom is set and we're on the initial zoom level
    // or disableMomentum
    if (!disableMomentum) {
      (0, _animations.getPanMomentumDecayAnim)(this.panAnim, {
        x: gestureState.vx / this.zoomLevel,
        y: gestureState.vy / this.zoomLevel
      }).start();
    }
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
    this.props.onPanResponderEnd?.(e, gestureState, this._getZoomableViewEventObject());
    if (this.gestureType === 'pinch') {
      this.props.onZoomEnd?.(e, gestureState, this._getZoomableViewEventObject());
    } else if (this.gestureType === 'shift') {
      this.props.onShiftingEnd?.(e, gestureState, this._getZoomableViewEventObject());
    }
    if (this.props.staticPinPosition) {
      this._updateStaticPin();
    }
    this.dropPin();
    this.gestureType = null;
    this.gestureStarted = false;
  };

  /**
   * Handles the actual movement of our pan responder
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  _handlePanResponderMove = (e, gestureState) => {
    if (this.props.onPanResponderMove) {
      if (this.props.onPanResponderMove(e, gestureState, this._getZoomableViewEventObject())) {
        return false;
      }
    }

    // Only supports 2 touches and below,
    // any invalid number will cause the gesture to end.
    if (gestureState.numberActiveTouches <= 2) {
      if (!this.gestureStarted) {
        this._handlePanResponderGrant(e, gestureState);
      }
    } else {
      if (this.gestureStarted) {
        this._handlePanResponderEnd(e, gestureState);
      }
      return true;
    }
    if (gestureState.numberActiveTouches === 2) {
      if (this.longPressTimeout) {
        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = null;
      }

      // change some measurement states when switching gesture to ensure a smooth transition
      if (this.gestureType !== 'pinch') {
        this.lastGestureCenterPosition = (0, _helper.calcGestureCenterPoint)(e, gestureState);
        this.lastGestureTouchDistance = (0, _helper.calcGestureTouchDistance)(e, gestureState);
      }
      this.gestureType = 'pinch';
      this._handlePinching(e, gestureState);
    } else if (gestureState.numberActiveTouches === 1) {
      if (this.longPressTimeout && (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5)) {
        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = null;
      }
      // change some measurement states when switching gesture to ensure a smooth transition
      if (this.gestureType !== 'shift') {
        this.lastGestureCenterPosition = (0, _helper.calcGestureCenterPoint)(e, gestureState);
      }
      const {
        dx,
        dy
      } = gestureState;
      const isShiftGesture = Math.abs(dx) > 2 || Math.abs(dy) > 2;
      if (isShiftGesture) {
        this.gestureType = 'shift';
        this._handleShifting(gestureState);
      }
    }
  };

  /**
   * Handles the pinch movement and zooming
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  _handlePinching(e, gestureState) {
    if (!this.props.zoomEnabled) return;
    const {
      maxZoom,
      minZoom,
      pinchToZoomInSensitivity,
      pinchToZoomOutSensitivity
    } = this.props;
    const distance = (0, _helper.calcGestureTouchDistance)(e, gestureState);
    if (this.props.onZoomBefore && this.props.onZoomBefore(e, gestureState, this._getZoomableViewEventObject())) {
      return;
    }
    if (!distance) return;
    if (!this.lastGestureTouchDistance) return;

    // define the new zoom level and take zoom level sensitivity into consideration
    const zoomGrowthFromLastGestureState = distance / this.lastGestureTouchDistance;
    this.lastGestureTouchDistance = distance;
    const pinchToZoomSensitivity = zoomGrowthFromLastGestureState < 1 ? pinchToZoomOutSensitivity : pinchToZoomInSensitivity;
    if (pinchToZoomSensitivity == null) return;
    const deltaGrowth = zoomGrowthFromLastGestureState - 1;
    // 0 - no resistance
    // 10 - 90% resistance
    const deltaGrowthAdjustedBySensitivity = deltaGrowth * (1 - pinchToZoomSensitivity * 9 / 100);
    let newZoomLevel = this.zoomLevel * (1 + deltaGrowthAdjustedBySensitivity);

    // make sure max and min zoom levels are respected
    if (maxZoom != null && newZoomLevel > maxZoom) {
      newZoomLevel = maxZoom;
    }
    if (minZoom != null && newZoomLevel < minZoom) {
      newZoomLevel = minZoom;
    }
    const gestureCenterPoint = (0, _helper.calcGestureCenterPoint)(e, gestureState);
    if (!gestureCenterPoint) return;
    let zoomCenter = {
      x: gestureCenterPoint.x - this.state.originalPageX,
      y: gestureCenterPoint.y - this.state.originalPageY
    };
    if (this.props.staticPinPosition) {
      // When we use a static pin position, the zoom centre is the same as that position,
      // otherwise the pin moves around way too much while zooming.
      zoomCenter = {
        x: this.props.staticPinPosition.x,
        y: this.props.staticPinPosition.y
      };
    }

    // Uncomment to debug
    this.props.debug && this._setPinchDebugPoints(e, zoomCenter);
    const {
      originalHeight,
      originalWidth
    } = this.state;
    const oldOffsetX = this.offsetX;
    const oldOffsetY = this.offsetY;
    const oldScale = this.zoomLevel;
    const newScale = newZoomLevel;
    if (!originalHeight || !originalWidth) return;
    let offsetY = (0, _helper.calcNewScaledOffsetForZoomCentering)(oldOffsetY, originalHeight, oldScale, newScale, zoomCenter.y);
    let offsetX = (0, _helper.calcNewScaledOffsetForZoomCentering)(oldOffsetX, originalWidth, oldScale, newScale, zoomCenter.x);
    const offsetShift = this._calcOffsetShiftSinceLastGestureState(gestureCenterPoint);
    if (offsetShift) {
      offsetX += offsetShift.x;
      offsetY += offsetShift.y;
    }
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.zoomLevel = newScale;
    this.panAnim.setValue({
      x: this.offsetX,
      y: this.offsetY
    });
    this.zoomAnim.setValue(this.zoomLevel);
    this.props.onZoomAfter?.(e, gestureState, this._getZoomableViewEventObject());
  }

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  _setPinchDebugPoints(gestureResponderEvent, zoomCenter, ...points) {
    const {
      touches
    } = gestureResponderEvent.nativeEvent;
    const {
      originalPageY,
      originalPageX
    } = this.state;
    this.setState({
      debugPoints: [{
        x: touches[0].pageX - originalPageX,
        y: touches[0].pageY - originalPageY
      }, {
        x: touches[1].pageX - originalPageX,
        y: touches[1].pageY - originalPageY
      }, zoomCenter, ...points]
    });
  }

  /**
   * Calculates the amount the offset should shift since the last position during panning
   *
   * @param {Vec2D} gestureCenterPoint
   *
   * @private
   */
  _calcOffsetShiftSinceLastGestureState(gestureCenterPoint) {
    const {
      movementSensibility
    } = this.props;
    let shift = null;
    if (this.lastGestureCenterPosition && movementSensibility) {
      const dx = gestureCenterPoint.x - this.lastGestureCenterPosition.x;
      const dy = gestureCenterPoint.y - this.lastGestureCenterPosition.y;
      const shiftX = dx / this.zoomLevel / movementSensibility;
      const shiftY = dy / this.zoomLevel / movementSensibility;
      shift = {
        x: shiftX,
        y: shiftY
      };
    }
    this.lastGestureCenterPosition = gestureCenterPoint;
    return shift;
  }

  /**
   * Handles movement by tap and move
   *
   * @param gestureState
   *
   * @private
   */
  _handleShifting(gestureState) {
    // Skips shifting if panEnabled is false or disablePanOnInitialZoom is true and we're on the initial zoom level
    if (!this.props.panEnabled || this.props.disablePanOnInitialZoom && this.zoomLevel === this.props.initialZoom) {
      return;
    }
    const shift = this._calcOffsetShiftSinceLastGestureState({
      x: gestureState.moveX,
      y: gestureState.moveY
    });
    if (!shift) return;
    const offsetX = this.offsetX + shift.x;
    const offsetY = this.offsetY + shift.y;
    if (this.props.debug && this.state.originalPageX && this.state.originalPageY) {
      const x = gestureState.moveX - this.state.originalPageX;
      const y = gestureState.moveY - this.state.originalPageY;
      this.setState({
        debugPoints: [{
          x,
          y
        }]
      });
    }
    this._setNewOffsetPosition(offsetX, offsetY);
    this.raisePin();
  }

  /**
   * Set the state to offset moved
   *
   * @param {number} newOffsetX
   * @param {number} newOffsetY
   * @returns
   */
  _setNewOffsetPosition(newOffsetX, newOffsetY) {
    const {
      onShiftingBefore,
      onShiftingAfter
    } = this.props;
    if (onShiftingBefore?.(null, null, this._getZoomableViewEventObject())) {
      return;
    }
    this.offsetX = newOffsetX;
    this.offsetY = newOffsetY;
    this.panAnim.setValue({
      x: this.offsetX,
      y: this.offsetY
    });
    this.zoomAnim.setValue(this.zoomLevel);
    onShiftingAfter?.(null, null, this._getZoomableViewEventObject());
  }

  /**
   * Check whether the press event is double tap
   * or single tap and handle the event accordingly
   *
   * @param e
   *
   * @private
   */
  _resolveAndHandleTap = e => {
    const now = Date.now();
    if (this.doubleTapFirstTapReleaseTimestamp && this.props.doubleTapDelay && now - this.doubleTapFirstTapReleaseTimestamp < this.props.doubleTapDelay) {
      this.doubleTapFirstTap && this._addTouch({
        ...this.doubleTapFirstTap,
        id: now.toString(),
        isSecondTap: true
      });
      this.singleTapTimeoutId && clearTimeout(this.singleTapTimeoutId);
      delete this.doubleTapFirstTapReleaseTimestamp;
      delete this.singleTapTimeoutId;
      delete this.doubleTapFirstTap;
      this._handleDoubleTap(e);
    } else {
      this.doubleTapFirstTapReleaseTimestamp = now;
      this.doubleTapFirstTap = {
        id: now.toString(),
        x: e.nativeEvent.pageX - this.state.originalPageX,
        y: e.nativeEvent.pageY - this.state.originalPageY
      };
      this._addTouch(this.doubleTapFirstTap);

      // persist event so e.nativeEvent is preserved after a timeout delay
      e.persist();
      this.singleTapTimeoutId = setTimeout(() => {
        delete this.doubleTapFirstTapReleaseTimestamp;
        delete this.singleTapTimeoutId;

        // Pan to the tapped location
        if (this.props.staticPinPosition && this.doubleTapFirstTap) {
          const tapX = this.props.staticPinPosition.x - this.doubleTapFirstTap.x;
          const tapY = this.props.staticPinPosition.y - this.doubleTapFirstTap.y;
          _reactNative.Animated.timing(this.panAnim, {
            toValue: {
              x: this.offsetX + tapX / this.zoomLevel,
              y: this.offsetY + tapY / this.zoomLevel
            },
            useNativeDriver: true,
            duration: 200
          }).start(() => {
            this._updateStaticPin();
          });
        }
        this.props.onSingleTap?.(e, this._getZoomableViewEventObject());
      }, this.props.doubleTapDelay);
    }
  };
  moveStaticPinTo = (position, duration) => {
    const {
      originalWidth,
      originalHeight
    } = this.state;
    const {
      staticPinPosition,
      contentWidth,
      contentHeight
    } = this.props;
    if (!staticPinPosition) return;
    if (!originalWidth || !originalHeight) return;
    if (!contentWidth || !contentHeight) return;

    // Offset for the static pin
    const pinX = staticPinPosition.x - originalWidth / 2;
    const pinY = staticPinPosition.y - originalHeight / 2;
    this.offsetX = contentWidth / 2 - position.x + pinX / this.zoomLevel;
    this.offsetY = contentHeight / 2 - position.y + pinY / this.zoomLevel;
    if (duration) {
      _reactNative.Animated.timing(this.panAnim, {
        toValue: {
          x: this.offsetX,
          y: this.offsetY
        },
        useNativeDriver: true,
        duration
      }).start();
    } else {
      this.panAnim.setValue({
        x: this.offsetX,
        y: this.offsetY
      });
    }
  };
  _staticPinPosition = () => {
    if (!this.props.staticPinPosition) return;
    if (!this.props.contentWidth || !this.props.contentHeight) return;
    return (0, _coordinateConversion.viewportPositionToImagePosition)({
      viewportPosition: {
        x: this.props.staticPinPosition.x,
        y: this.props.staticPinPosition.y
      },
      imageSize: {
        height: this.props.contentHeight,
        width: this.props.contentWidth
      },
      zoomableEvent: {
        ...this._getZoomableViewEventObject(),
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        zoomLevel: this.zoomLevel
      }
    });
  };
  _updateStaticPin = () => {
    const position = this._staticPinPosition();
    if (!position) return;
    this.props.onStaticPinPositionChange?.(position);
  };
  _addTouch(touch) {
    this.touches.push(touch);
    this.setState({
      touches: [...this.touches]
    });
  }
  _removeTouch(touch) {
    this.touches.splice(this.touches.indexOf(touch), 1);
    this.setState({
      touches: [...this.touches]
    });
  }

  /**
   * Handles the double tap event
   *
   * @param e
   *
   * @private
   */
  _handleDoubleTap(e) {
    const {
      onDoubleTapBefore,
      onDoubleTapAfter,
      doubleTapZoomToCenter
    } = this.props;
    onDoubleTapBefore?.(e, this._getZoomableViewEventObject());
    const nextZoomStep = this._getNextZoomStep();
    if (nextZoomStep == null) return;
    const {
      originalPageX,
      originalPageY
    } = this.state;

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
    this.zoomTo(nextZoomStep, zoomPositionCoordinates);
    onDoubleTapAfter?.(e, this._getZoomableViewEventObject({
      zoomLevel: nextZoomStep
    }));
  }

  /**
   * Returns the next zoom step based on current step and zoomStep property.
   * If we are zoomed all the way in -> return to initialzoom
   *
   * @returns {*}
   */
  _getNextZoomStep() {
    const {
      zoomStep,
      maxZoom,
      initialZoom
    } = this.props;
    const {
      zoomLevel
    } = this;
    if (maxZoom == null) return;
    if (zoomLevel.toFixed(2) === maxZoom.toFixed(2)) {
      return initialZoom;
    }
    if (zoomStep == null) return;
    const nextZoomStep = zoomLevel * (1 + zoomStep);
    if (nextZoomStep > maxZoom) {
      return maxZoom;
    }
    return nextZoomStep;
  }

  /**
   * Zooms to a specific level. A "zoom center" can be provided, which specifies
   * the point that will remain in the same position on the screen after the zoom.
   * The coordinates of the zoom center is relative to the zoom subject.
   * { x: 0, y: 0 } is the very center of the zoom subject.
   *
   * @param newZoomLevel
   * @param zoomCenter - If not supplied, the container's center is the zoom center
   */
  zoomTo(newZoomLevel, zoomCenter) {
    if (!this.props.zoomEnabled) return false;
    if (this.props.maxZoom && newZoomLevel > this.props.maxZoom) return false;
    if (this.props.minZoom && newZoomLevel < this.props.minZoom) return false;
    this.props.onZoomBefore?.(null, null, this._getZoomableViewEventObject());

    // == Perform Pan Animation to preserve the zoom center while zooming ==
    let listenerId = '';
    if (zoomCenter) {
      // Calculates panAnim values based on changes in zoomAnim.
      let prevScale = this.zoomLevel;
      // Since zoomAnim is calculated in native driver,
      //  it will jitter panAnim once in a while,
      //  because here panAnim is being calculated in js.
      // However the jittering should mostly occur in simulator.
      listenerId = this.zoomAnim.addListener(({
        value: newScale
      }) => {
        this.panAnim.setValue({
          x: (0, _helper.calcNewScaledOffsetForZoomCentering)(this.offsetX, this.state.originalWidth, prevScale, newScale, zoomCenter.x),
          y: (0, _helper.calcNewScaledOffsetForZoomCentering)(this.offsetY, this.state.originalHeight, prevScale, newScale, zoomCenter.y)
        });
        prevScale = newScale;
      });
    }

    // == Perform Zoom Animation ==
    (0, _animations.getZoomToAnimation)(this.zoomAnim, newZoomLevel).start(() => {
      this.zoomAnim.removeListener(listenerId);
    });
    // == Zoom Animation Ends ==

    this.props.onZoomAfter?.(null, null, this._getZoomableViewEventObject());
    return true;
  }

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
  zoomBy(zoomLevelChange) {
    // if no zoom level Change given -> just use zoom step
    zoomLevelChange ||= this.props.zoomStep || 0;
    return this.zoomTo(this.zoomLevel + zoomLevelChange);
  }

  /**
   * Moves the zoomed view to a specified position
   * Returns a promise when finished
   *
   * @param {number} newOffsetX the new position we want to move it to (x-axis)
   * @param {number} newOffsetY the new position we want to move it to (y-axis)
   *
   * @return {bool}
   */
  moveTo(newOffsetX, newOffsetY) {
    const {
      originalWidth,
      originalHeight
    } = this.state;
    if (!originalWidth || !originalHeight) return;
    const offsetX = (newOffsetX - originalWidth / 2) / this.zoomLevel;
    const offsetY = (newOffsetY - originalHeight / 2) / this.zoomLevel;
    this._setNewOffsetPosition(-offsetX, -offsetY);
  }

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
  moveBy(offsetChangeX, offsetChangeY) {
    const offsetX = (this.offsetX * this.zoomLevel - offsetChangeX) / this.zoomLevel;
    const offsetY = (this.offsetY * this.zoomLevel - offsetChangeY) / this.zoomLevel;
    this._setNewOffsetPosition(offsetX, offsetY);
  }
  render() {
    const {
      staticPinIcon,
      children,
      visualTouchFeedbackEnabled,
      doubleTapDelay,
      staticPinPosition,
      onStaticPinLongPress,
      onStaticPinPress,
      pinProps
    } = this.props;
    const {
      pinSize,
      touches,
      debugPoints = []
    } = this.state;
    return /*#__PURE__*/(0, _jsxRuntime.jsxs)(_reactNative.View, {
      style: styles.container,
      ...this.gestureHandlers.panHandlers,
      ref: this.zoomSubjectWrapperRef,
      onLayout: this.measureZoomSubject,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.Animated.View, {
        style: [styles.zoomSubject, this.props.style, {
          transform: [
          // In RN79, we need to split the scale into X and Y to avoid
          // the content getting pixelated when zooming in
          {
            scaleX: this.zoomAnim
          }, {
            scaleY: this.zoomAnim
          }, ...this.panAnim.getTranslateTransform()]
        }],
        children: children
      }), visualTouchFeedbackEnabled && touches?.map(touch => doubleTapDelay && /*#__PURE__*/(0, _jsxRuntime.jsx)(_components.AnimatedTouchFeedback, {
        x: touch.x,
        y: touch.y,
        animationDuration: doubleTapDelay,
        onAnimationDone: () => {
          this._removeTouch(touch);
        }
      }, touch.id)), debugPoints.map(({
        x,
        y
      }, index) => {
        return /*#__PURE__*/(0, _jsxRuntime.jsx)(_debugHelper.DebugTouchPoint, {
          x: x,
          y: y
        }, index);
      }), staticPinPosition && /*#__PURE__*/(0, _jsxRuntime.jsx)(_StaticPin.StaticPin, {
        staticPinIcon: staticPinIcon,
        staticPinPosition: staticPinPosition,
        pinSize: pinSize,
        onPress: onStaticPinPress,
        onLongPress: onStaticPinLongPress,
        onParentMove: this._handlePanResponderMove,
        pinAnim: this.pinAnim,
        setPinSize: size => {
          this.setState({
            pinSize: size
          });
        },
        pinProps: pinProps
      })]
    });
  }
}
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