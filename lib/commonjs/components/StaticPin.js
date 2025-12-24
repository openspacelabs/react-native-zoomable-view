"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StaticPin = void 0;

var _react = _interopRequireDefault(require("react"));

var _reactNative = require("react-native");

var _jsxRuntime = require("react/jsx-runtime");

function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }

const StaticPin = ({
  staticPinPosition,
  staticPinIcon,
  pinSize,
  onParentMove,
  onPress,
  onLongPress,
  setPinSize,
  pinProps = {}
}) => {
  const tapTime = _react.default.useRef(0);

  const transform = [{
    translateY: -pinSize.height
  }, {
    translateX: -pinSize.width / 2
  }];
  const opacity = pinSize.width && pinSize.height ? 1 : 0;

  const panResponder = _react.default.useRef(_reactNative.PanResponder.create({
    onStartShouldSetPanResponder: () => {
      tapTime.current = Date.now(); // We want to handle tap on this so set true

      return true;
    },
    onPanResponderMove: (evt, gestureState) => {
      // However if the user moves finger we want to pass this evt to parent
      // to handle panning (tap not recognized)
      if (Math.abs(gestureState.dx) > 5 && Math.abs(gestureState.dy) > 5) onParentMove(evt, gestureState);
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) return;
      const dt = Date.now() - tapTime.current;

      if (onPress && dt < 500) {
        onPress(evt);
      }

      if (onLongPress && dt > 500) {
        // RN long press is 500ms
        onLongPress(evt);
      }
    }
  })).current;

  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.Animated.View, {
    style: [{
      left: staticPinPosition.x,
      top: staticPinPosition.y
    }, styles.pinWrapper, {
      opacity,
      transform
    }],
    ...pinProps,
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.View, {
      onLayout: ({
        nativeEvent: {
          layout
        }
      }) => {
        setPinSize(layout);
      },
      ...panResponder.panHandlers,
      children: staticPinIcon ||
      /*#__PURE__*/
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      (0, _jsxRuntime.jsx)(_reactNative.Image, {
        source: require('../assets/pin.png'),
        style: styles.pin
      })
    })
  });
};

exports.StaticPin = StaticPin;

const styles = _reactNative.StyleSheet.create({
  pin: {
    height: 64,
    width: 48
  },
  pinWrapper: {
    position: 'absolute'
  }
});
//# sourceMappingURL=StaticPin.js.map