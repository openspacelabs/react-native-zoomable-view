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
  setPinSize,
  pinProps = {}
}) => {
  const transform = [{
    translateY: -pinSize.height
  }, {
    translateX: -pinSize.width / 2
  }];
  const opacity = pinSize.width && pinSize.height ? 1 : 0;
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.View, {
    style: [{
      left: staticPinPosition.x,
      top: staticPinPosition.y
    },
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    styles.pinWrapper, {
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
      children: staticPinIcon ||
      /*#__PURE__*/
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-use-before-define
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