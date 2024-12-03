"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.ReactNativeZoomableView = void 0;

var _react = _interopRequireWildcard(require("react"));

var _reactNative = require("react-native");

var _components = require("./components");

var _debugHelper = require("./debugHelper");

var _helper = require("./helper");

var _applyPanBoundariesToOffset = require("./helper/applyPanBoundariesToOffset");

var _coordinateConversion = require("./helper/coordinateConversion");

var _StaticPin = require("./components/StaticPin");

var _lodash = require("lodash");

var _animations = require("./animations");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const initialState = {
  originalWidth: 0,
  originalHeight: 0,
  originalPageX: 0,
  originalPageY: 0,
  pinSize: {
    width: 0,
    height: 0
  }
};

class ReactNativeZoomableView extends _react.Component {
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


  constructor(props) {
    super(props); // This needs to be done before anything else to initialize the state.
    // Otherwise, the logic below may reference the state when it's undefined,
    // causing runtime errors.

    _defineProperty(this, "zoomSubjectWrapperRef", void 0);

    _defineProperty(this, "gestureHandlers", void 0);

    _defineProperty(this, "doubleTapFirstTapReleaseTimestamp", void 0);

    _defineProperty(this, "panAnim", new _reactNative.Animated.ValueXY({
      x: 0,
      y: 0
    }));

    _defineProperty(this, "zoomAnim", new _reactNative.Animated.Value(1));

    _defineProperty(this, "pinAnim", new _reactNative.Animated.ValueXY({
      x: 0,
      y: 0
    }));

    _defineProperty(this, "__offsets", {
      x: {
        value: 0,
        boundaryCrossedAnimInEffect: false
      },
      y: {
        value: 0,
        boundaryCrossedAnimInEffect: false
      }
    });

    _defineProperty(this, "zoomLevel", 1);

    _defineProperty(this, "lastGestureCenterPosition", null);

    _defineProperty(this, "lastGestureTouchDistance", null);

    _defineProperty(this, "gestureType", void 0);

    _defineProperty(this, "_gestureStarted", false);

    _defineProperty(this, "longPressTimeout", null);

    _defineProperty(this, "onTransformInvocationInitialized", void 0);

    _defineProperty(this, "singleTapTimeoutId", void 0);

    _defineProperty(this, "touches", []);

    _defineProperty(this, "doubleTapFirstTap", void 0);

    _defineProperty(this, "measureZoomSubjectInterval", void 0);

    _defineProperty(this, "debouncedOnStaticPinPositionChange", (0, _lodash.debounce)(position => {
      var _this$props$onStaticP, _this$props;

      return (_this$props$onStaticP = (_this$props = this.props).onStaticPinPositionChange) === null || _this$props$onStaticP === void 0 ? void 0 : _this$props$onStaticP.call(_this$props, position);
    }, 100));

    _defineProperty(this, "grabZoomSubjectOriginalMeasurements", () => {
      // make sure we measure after animations are complete
      requestAnimationFrame(() => {
        // this setTimeout is here to fix a weird issue on iOS where the measurements are all `0`
        // when navigating back (react-navigation stack) from another view
        // while closing the keyboard at the same time
        setTimeout(() => {
          var _zoomSubjectWrapperRe;

          // In normal conditions, we're supposed to measure zoomSubject instead of its wrapper.
          // However, our zoomSubject may have been transformed by an initial zoomLevel or offset,
          // in which case these measurements will not represent the true "original" measurements.
          // We just need to make sure the zoomSubjectWrapper perfectly aligns with the zoomSubject
          // (no border, space, or anything between them)
          const zoomSubjectWrapperRef = this.zoomSubjectWrapperRef; // we don't wanna measure when zoomSubjectWrapperRef is not yet available or has been unmounted

          (_zoomSubjectWrapperRe = zoomSubjectWrapperRef.current) === null || _zoomSubjectWrapperRe === void 0 ? void 0 : _zoomSubjectWrapperRe.measureInWindow((x, y, width, height) => {
            // When the component is off-screen, these become all 0s, so we don't set them
            // to avoid messing up calculations, especially ones that are done right after
            // the component transitions from hidden to visible.
            if (!x && !y && !width && !height) return;
            this.setState({
              originalWidth: width,
              originalHeight: height,
              originalPageX: x,
              originalPageY: y
            });
          });
        });
      });
    });

    _defineProperty(this, "_handleStartShouldSetPanResponder", (e, gestureState) => {
      if (this.props.onStartShouldSetPanResponder) {
        this.props.onStartShouldSetPanResponder(e, gestureState, this._getZoomableViewEventObject(), false);
      } // Always set pan responder on start
      // of gesture so we can handle tap.
      // "Pan threshold validation" will be handled
      // in `onPanResponderMove` instead of in `onMoveShouldSetPanResponder`


      return true;
    });

    _defineProperty(this, "_handlePanResponderGrant", (e, gestureState) => {
      var _this$props$onPanResp, _this$props3;

      if (this.props.onLongPress) {
        this.longPressTimeout = setTimeout(() => {
          var _this$props$onLongPre, _this$props2;

          (_this$props$onLongPre = (_this$props2 = this.props).onLongPress) === null || _this$props$onLongPre === void 0 ? void 0 : _this$props$onLongPre.call(_this$props2, e, gestureState, this._getZoomableViewEventObject());
          this.longPressTimeout = null;
        }, this.props.longPressDuration);
      }

      (_this$props$onPanResp = (_this$props3 = this.props).onPanResponderGrant) === null || _this$props$onPanResp === void 0 ? void 0 : _this$props$onPanResp.call(_this$props3, e, gestureState, this._getZoomableViewEventObject());
      this.panAnim.stopAnimation();
      this.zoomAnim.stopAnimation();
      this.gestureStarted = true;
      this.raisePin();
    });

    _defineProperty(this, "_handlePanResponderEnd", (e, gestureState) => {
      var _this$props$onPanResp2, _this$props4;

      if (!this.gestureType) {
        this._resolveAndHandleTap(e);
      }

      this.setState({
        debugPoints: []
      });
      this.lastGestureCenterPosition = null;
      const disableMomentum = this.props.disableMomentum || this.props.panEnabled && this.gestureType === 'shift' && this.props.disablePanOnInitialZoom && this.zoomLevel === this.props.initialZoom; // Trigger final shift animation unless disablePanOnInitialZoom is set and we're on the initial zoom level
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

      (_this$props$onPanResp2 = (_this$props4 = this.props).onPanResponderEnd) === null || _this$props$onPanResp2 === void 0 ? void 0 : _this$props$onPanResp2.call(_this$props4, e, gestureState, this._getZoomableViewEventObject());

      if (this.gestureType === 'pinch') {
        var _this$props$onZoomEnd, _this$props5;

        (_this$props$onZoomEnd = (_this$props5 = this.props).onZoomEnd) === null || _this$props$onZoomEnd === void 0 ? void 0 : _this$props$onZoomEnd.call(_this$props5, e, gestureState, this._getZoomableViewEventObject());
      } else if (this.gestureType === 'shift') {
        var _this$props$onShiftin, _this$props6;

        (_this$props$onShiftin = (_this$props6 = this.props).onShiftingEnd) === null || _this$props$onShiftin === void 0 ? void 0 : _this$props$onShiftin.call(_this$props6, e, gestureState, this._getZoomableViewEventObject());
      }

      if (this.props.staticPinPosition) {
        this._updateStaticPin();
      }

      this.dropPin();
      this.gestureType = null;
      this.gestureStarted = false;
    });

    _defineProperty(this, "_handlePanResponderMove", (e, gestureState) => {
      if (this.props.onPanResponderMove) {
        if (this.props.onPanResponderMove(e, gestureState, this._getZoomableViewEventObject())) {
          return false;
        }
      } // Only supports 2 touches and below,
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
        } // change some measurement states when switching gesture to ensure a smooth transition


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
        } // change some measurement states when switching gesture to ensure a smooth transition


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
    });

    _defineProperty(this, "_resolveAndHandleTap", e => {
      const now = Date.now();

      if (this.doubleTapFirstTapReleaseTimestamp && this.props.doubleTapDelay && now - this.doubleTapFirstTapReleaseTimestamp < this.props.doubleTapDelay) {
        this.doubleTapFirstTap && this._addTouch({ ...this.doubleTapFirstTap,
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

        this._addTouch(this.doubleTapFirstTap); // persist event so e.nativeEvent is preserved after a timeout delay


        e.persist();
        this.singleTapTimeoutId = setTimeout(() => {
          var _this$props$onSingleT, _this$props7;

          delete this.doubleTapFirstTapReleaseTimestamp;
          delete this.singleTapTimeoutId; // Pan to the tapped location

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

          (_this$props$onSingleT = (_this$props7 = this.props).onSingleTap) === null || _this$props$onSingleT === void 0 ? void 0 : _this$props$onSingleT.call(_this$props7, e, this._getZoomableViewEventObject());
        }, this.props.doubleTapDelay);
      }
    });

    _defineProperty(this, "moveStaticPinTo", (position, duration) => {
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
      if (!contentWidth || !contentHeight) return; // Offset for the static pin

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
    });

    _defineProperty(this, "_staticPinPosition", () => {
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
        zoomableEvent: { ...this._getZoomableViewEventObject(),
          offsetX: this.offsetX,
          offsetY: this.offsetY,
          zoomLevel: this.zoomLevel
        }
      });
    });

    _defineProperty(this, "_updateStaticPin", () => {
      var _this$props$onStaticP2, _this$props8;

      const position = this._staticPinPosition();

      if (!position) return;
      (_this$props$onStaticP2 = (_this$props8 = this.props).onStaticPinPositionChange) === null || _this$props$onStaticP2 === void 0 ? void 0 : _this$props$onStaticP2.call(_this$props8, position);
    });

    this.state = { ...initialState
    };
    this.gestureHandlers = _reactNative.PanResponder.create({
      onStartShouldSetPanResponder: this._handleStartShouldSetPanResponder,
      onPanResponderGrant: this._handlePanResponderGrant,
      onPanResponderMove: this._handlePanResponderMove,
      onPanResponderRelease: this._handlePanResponderEnd,
      onPanResponderTerminate: (evt, gestureState) => {
        var _this$props$onPanResp3, _this$props9;

        // We should also call _handlePanResponderEnd
        // to properly perform cleanups when the gesture is terminated
        // (aka gesture handling responsibility is taken over by another component).
        // This also fixes a weird issue where
        // on real device, sometimes onPanResponderRelease is not called when you lift 2 fingers up,
        // but onPanResponderTerminate is called instead for no apparent reason.
        this._handlePanResponderEnd(evt, gestureState);

        (_this$props$onPanResp3 = (_this$props9 = this.props).onPanResponderTerminate) === null || _this$props$onPanResp3 === void 0 ? void 0 : _this$props$onPanResp3.call(_this$props9, evt, gestureState, this._getZoomableViewEventObject());
      },
      onPanResponderTerminationRequest: (evt, gestureState) => {
        var _this$props$onPanResp4, _this$props10;

        return !!((_this$props$onPanResp4 = (_this$props10 = this.props).onPanResponderTerminationRequest) !== null && _this$props$onPanResp4 !== void 0 && _this$props$onPanResp4.call(_this$props10, evt, gestureState, this._getZoomableViewEventObject()));
      },
      // Defaults to true to prevent parent components, such as React Navigation's tab view, from taking over as responder.
      onShouldBlockNativeResponder: (evt, gestureState) => {
        var _this$props$onShouldB, _this$props$onShouldB2, _this$props11;

        return (_this$props$onShouldB = (_this$props$onShouldB2 = (_this$props11 = this.props).onShouldBlockNativeResponder) === null || _this$props$onShouldB2 === void 0 ? void 0 : _this$props$onShouldB2.call(_this$props11, evt, gestureState, this._getZoomableViewEventObject())) !== null && _this$props$onShouldB !== void 0 ? _this$props$onShouldB : true;
      },
      onStartShouldSetPanResponderCapture: (evt, gestureState) => {
        var _this$props$onStartSh, _this$props12;

        return !!((_this$props$onStartSh = (_this$props12 = this.props).onStartShouldSetPanResponderCapture) !== null && _this$props$onStartSh !== void 0 && _this$props$onStartSh.call(_this$props12, evt, gestureState));
      },
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        var _this$props$onMoveSho, _this$props13;

        return !!((_this$props$onMoveSho = (_this$props13 = this.props).onMoveShouldSetPanResponderCapture) !== null && _this$props$onMoveSho !== void 0 && _this$props$onMoveSho.call(_this$props13, evt, gestureState));
      }
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
    var _prevProps$staticPinP, _this$props$staticPin, _prevProps$staticPinP2, _this$props$staticPin2;

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
    const originalMeasurementsChanged = currState.originalHeight !== prevState.originalHeight || currState.originalWidth !== prevState.originalWidth || currState.originalPageX !== prevState.originalPageX || currState.originalPageY !== prevState.originalPageY;
    const staticPinPositionChanged = ((_prevProps$staticPinP = prevProps.staticPinPosition) === null || _prevProps$staticPinP === void 0 ? void 0 : _prevProps$staticPinP.x) !== ((_this$props$staticPin = this.props.staticPinPosition) === null || _this$props$staticPin === void 0 ? void 0 : _this$props$staticPin.x) || ((_prevProps$staticPinP2 = prevProps.staticPinPosition) === null || _prevProps$staticPinP2 === void 0 ? void 0 : _prevProps$staticPinP2.y) !== ((_this$props$staticPin2 = this.props.staticPinPosition) === null || _this$props$staticPin2 === void 0 ? void 0 : _this$props$staticPin2.y);

    if (this.onTransformInvocationInitialized && (originalMeasurementsChanged || staticPinPositionChanged)) {
      this._invokeOnTransform();
    }
  }

  componentDidMount() {
    this.grabZoomSubjectOriginalMeasurements(); // We've already run `grabZoomSubjectOriginalMeasurements` at various events
    // to make sure the measurements are promptly updated.
    // However, there might be cases we haven't accounted for, especially when
    // native processes are involved. To account for those cases,
    // we'll use an interval here to ensure we're always up-to-date.
    // The `setState` in `grabZoomSubjectOriginalMeasurements` won't trigger a rerender
    // if the values given haven't changed, so we're not running performance risk here.

    this.measureZoomSubjectInterval = setInterval(this.grabZoomSubjectOriginalMeasurements, 1e3);
  }

  componentWillUnmount() {
    this.measureZoomSubjectInterval && clearInterval(this.measureZoomSubjectInterval);
  }

  /**
   * try to invoke onTransform
   * @private
   */
  _invokeOnTransform() {
    var _this$props$onTransfo, _this$props14;

    const zoomableViewEvent = this._getZoomableViewEventObject();

    const position = this._staticPinPosition();

    if (!zoomableViewEvent.originalWidth || !zoomableViewEvent.originalHeight) return {
      successful: false
    };
    (_this$props$onTransfo = (_this$props14 = this.props).onTransform) === null || _this$props$onTransfo === void 0 ? void 0 : _this$props$onTransfo.call(_this$props14, zoomableViewEvent);

    if (position) {
      var _this$props$onStaticP3, _this$props15;

      (_this$props$onStaticP3 = (_this$props15 = this.props).onStaticPinPositionMove) === null || _this$props$onStaticP3 === void 0 ? void 0 : _this$props$onStaticP3.call(_this$props15, position);
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


  /**
   * Handles the pinch movement and zooming
   *
   * @param e
   * @param gestureState
   *
   * @private
   */
  _handlePinching(e, gestureState) {
    var _this$props$onZoomAft, _this$props16;

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
    if (!this.lastGestureTouchDistance) return; // define the new zoom level and take zoom level sensitivity into consideration

    const zoomGrowthFromLastGestureState = distance / this.lastGestureTouchDistance;
    this.lastGestureTouchDistance = distance;
    const pinchToZoomSensitivity = zoomGrowthFromLastGestureState < 1 ? pinchToZoomOutSensitivity : pinchToZoomInSensitivity;
    if (pinchToZoomSensitivity == null) return;
    const deltaGrowth = zoomGrowthFromLastGestureState - 1; // 0 - no resistance
    // 10 - 90% resistance

    const deltaGrowthAdjustedBySensitivity = deltaGrowth * (1 - pinchToZoomSensitivity * 9 / 100);
    let newZoomLevel = this.zoomLevel * (1 + deltaGrowthAdjustedBySensitivity); // make sure max and min zoom levels are respected

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
    } // Uncomment to debug


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
    (_this$props$onZoomAft = (_this$props16 = this.props).onZoomAfter) === null || _this$props$onZoomAft === void 0 ? void 0 : _this$props$onZoomAft.call(_this$props16, e, gestureState, this._getZoomableViewEventObject());
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

    if (onShiftingBefore !== null && onShiftingBefore !== void 0 && onShiftingBefore(null, null, this._getZoomableViewEventObject())) {
      return;
    }

    this.offsetX = newOffsetX;
    this.offsetY = newOffsetY;
    this.panAnim.setValue({
      x: this.offsetX,
      y: this.offsetY
    });
    this.zoomAnim.setValue(this.zoomLevel);
    onShiftingAfter === null || onShiftingAfter === void 0 ? void 0 : onShiftingAfter(null, null, this._getZoomableViewEventObject());
  }
  /**
   * Check whether the press event is double tap
   * or single tap and handle the event accordingly
   *
   * @param e
   *
   * @private
   */


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
    onDoubleTapBefore === null || onDoubleTapBefore === void 0 ? void 0 : onDoubleTapBefore(e, this._getZoomableViewEventObject());

    const nextZoomStep = this._getNextZoomStep();

    if (nextZoomStep == null) return;
    const {
      originalPageX,
      originalPageY
    } = this.state; // define new zoom position coordinates

    const zoomPositionCoordinates = {
      x: e.nativeEvent.pageX - originalPageX,
      y: e.nativeEvent.pageY - originalPageY
    }; // if doubleTapZoomToCenter enabled -> always zoom to center instead

    if (doubleTapZoomToCenter) {
      zoomPositionCoordinates.x = 0;
      zoomPositionCoordinates.y = 0;
    }

    this._zoomToLocation(zoomPositionCoordinates.x, zoomPositionCoordinates.y, nextZoomStep);

    onDoubleTapAfter === null || onDoubleTapAfter === void 0 ? void 0 : onDoubleTapAfter(e, this._getZoomableViewEventObject({
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
   * Zooms to a specific location in our view
   *
   * @param x
   * @param y
   * @param newZoomLevel
   *
   * @private
   */


  _zoomToLocation(x, y, newZoomLevel) {
    var _this$props$onZoomBef, _this$props17, _this$props$onZoomAft2, _this$props18;

    if (!this.props.zoomEnabled) return;
    (_this$props$onZoomBef = (_this$props17 = this.props).onZoomBefore) === null || _this$props$onZoomBef === void 0 ? void 0 : _this$props$onZoomBef.call(_this$props17, null, null, this._getZoomableViewEventObject()); // == Perform Zoom Animation ==
    // Calculates panAnim values based on changes in zoomAnim.

    let prevScale = this.zoomLevel; // Since zoomAnim is calculated in native driver,
    //  it will jitter panAnim once in a while,
    //  because here panAnim is being calculated in js.
    // However the jittering should mostly occur in simulator.

    const listenerId = this.zoomAnim.addListener(({
      value: newScale
    }) => {
      this.panAnim.setValue({
        x: (0, _helper.calcNewScaledOffsetForZoomCentering)(this.offsetX, this.state.originalWidth, prevScale, newScale, x),
        y: (0, _helper.calcNewScaledOffsetForZoomCentering)(this.offsetY, this.state.originalHeight, prevScale, newScale, y)
      });
      prevScale = newScale;
    });
    (0, _animations.getZoomToAnimation)(this.zoomAnim, newZoomLevel).start(() => {
      this.zoomAnim.removeListener(listenerId);
    }); // == Zoom Animation Ends ==

    (_this$props$onZoomAft2 = (_this$props18 = this.props).onZoomAfter) === null || _this$props$onZoomAft2 === void 0 ? void 0 : _this$props$onZoomAft2.call(_this$props18, null, null, this._getZoomableViewEventObject());
  }
  /**
   * Zooms to a specificied zoom level.
   * Returns a promise if everything was updated and a boolean, whether it could be updated or if it exceeded the min/max zoom limits.
   *
   * @param {number} newZoomLevel
   *
   * @return {bool}
   */


  zoomTo(newZoomLevel) {
    if ( // if we would go out of our min/max limits -> abort
    this.props.maxZoom && newZoomLevel > this.props.maxZoom || this.props.minZoom && newZoomLevel < this.props.minZoom) return false;

    this._zoomToLocation(0, 0, newZoomLevel);

    return true;
  }
  /**
   * Sets zoom relative to the zoomableview
   */


  zoomToRelCoords(x, y, newZoomLevel) {
    if ( // if we would go out of our min/max limits -> abort
    this.props.maxZoom && newZoomLevel > this.props.maxZoom || this.props.minZoom && newZoomLevel < this.props.minZoom) return false; // Just exposing _zoomToLocation

    this._zoomToLocation(x, y, newZoomLevel);

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
    zoomLevelChange || (zoomLevelChange = this.props.zoomStep || 0);
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
    return /*#__PURE__*/_react.default.createElement(_reactNative.View, _extends({
      style: styles.container
    }, this.gestureHandlers.panHandlers, {
      ref: this.zoomSubjectWrapperRef,
      onLayout: this.grabZoomSubjectOriginalMeasurements
    }), /*#__PURE__*/_react.default.createElement(_reactNative.Animated.View, {
      style: [styles.zoomSubject, this.props.style, {
        transform: [{
          scale: this.zoomAnim
        }, ...this.panAnim.getTranslateTransform()]
      }]
    }, children), visualTouchFeedbackEnabled && (touches === null || touches === void 0 ? void 0 : touches.map(touch => doubleTapDelay && /*#__PURE__*/_react.default.createElement(_components.AnimatedTouchFeedback, {
      x: touch.x,
      y: touch.y,
      key: touch.id,
      animationDuration: doubleTapDelay,
      onAnimationDone: () => {
        this._removeTouch(touch);
      }
    }))), debugPoints.map(({
      x,
      y
    }, index) => {
      return /*#__PURE__*/_react.default.createElement(_debugHelper.DebugTouchPoint, {
        key: index,
        x: x,
        y: y
      });
    }), staticPinPosition && /*#__PURE__*/_react.default.createElement(_StaticPin.StaticPin, {
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
    }));
  }

}

exports.ReactNativeZoomableView = ReactNativeZoomableView;

_defineProperty(ReactNativeZoomableView, "defaultProps", {
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
});

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

var _default = ReactNativeZoomableView;
exports.default = _default;
//# sourceMappingURL=ReactNativeZoomableView.js.map