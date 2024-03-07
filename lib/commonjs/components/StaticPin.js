"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StaticPin = void 0;

var _react = _interopRequireDefault(require("react"));

var _reactNative = require("react-native");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const StaticPin = ({
  staticPinPosition,
  pinAnim,
  staticPinIcon,
  pinSize,
  setPinSize
}) => {
  const transform = [{
    translateY: -pinSize.height
  }, {
    translateX: -pinSize.width / 2
  }, ...pinAnim.getTranslateTransform()];
  const opacity = pinSize.width && pinSize.height ? 1 : 0;
  return /*#__PURE__*/_react.default.createElement(_reactNative.Animated.View, {
    pointerEvents: "none",
    style: [staticPinPosition && {
      left: staticPinPosition.x,
      top: staticPinPosition.y
    }, styles.pinWrapper, {
      opacity,
      transform
    }]
  }, /*#__PURE__*/_react.default.createElement(_reactNative.View, {
    onLayout: ({
      nativeEvent: {
        layout
      }
    }) => setPinSize(layout)
  }, staticPinIcon || /*#__PURE__*/_react.default.createElement(_reactNative.Image, {
    source: require('../assets/pin.png'),
    style: styles.pin
  })));
};

exports.StaticPin = StaticPin;

const styles = _reactNative.StyleSheet.create({
  pinWrapper: {
    position: 'absolute'
  },
  pin: {
    width: 48,
    height: 64
  }
});
//# sourceMappingURL=StaticPin.js.map