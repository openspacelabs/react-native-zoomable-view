"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DebugTouchPoint = exports.DebugRect = void 0;

var _reactNative = require("react-native");

var _react = _interopRequireDefault(require("react"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const DebugTouchPoint = ({
  diameter = 20,
  x = 0,
  y = 0,
  color = 'yellow'
}) => {
  const radius = diameter / 2;
  return /*#__PURE__*/_react.default.createElement(_reactNative.View, {
    style: [styles.debugPoint, {
      width: diameter,
      height: diameter,
      borderRadius: diameter,
      backgroundColor: color,
      left: x - radius,
      top: y - radius
    }],
    pointerEvents: "none"
  });
};

exports.DebugTouchPoint = DebugTouchPoint;

const DebugRect = ({
  height,
  x = 0,
  y = 0,
  color = 'yellow'
}) => {
  const width = 5;
  return /*#__PURE__*/_react.default.createElement(_reactNative.View, {
    style: [styles.debugRect, {
      width,
      height,
      backgroundColor: color,
      left: x - width / 2,
      top: y
    }],
    pointerEvents: "none"
  });
};

exports.DebugRect = DebugRect;

const styles = _reactNative.StyleSheet.create({
  debugPoint: {
    position: 'absolute',
    opacity: 0.7
  },
  debugRect: {
    position: 'absolute',
    opacity: 0.5
  }
});
//# sourceMappingURL=index.js.map