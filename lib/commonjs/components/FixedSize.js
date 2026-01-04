"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.FixedSize = void 0;
var _react = _interopRequireDefault(require("react"));
var _reactNativeReanimated = _interopRequireDefault(require("react-native-reanimated"));
var _ReactNativeZoomableView = require("../ReactNativeZoomableView");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * A wrapper component that keeps elements at a fixed visual size regardless of zoom level.
 *
 * @param {{
 *   left: number;
 *   top: number;
 *   children: React.ReactNode;
 * }} param0
 * @param {number} param0.left The left position in percentage (0-100)
 * @param {number} param0.top The top position in percentage (0-100)
 * @param {React.ReactNode} param0.children The children to render inside the fixed size container
 * @returns {*}
 */
const FixedSize = ({
  left,
  top,
  children
}) => {
  const context = _react.default.useContext(_ReactNativeZoomableView.ReactNativeZoomableViewContext);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNativeReanimated.default.View, {
    style: [context?.fixedSizeStyle, {
      width: 1,
      height: 1,
      position: 'absolute',
      left: `${left}%`,
      top: `${top}%`
    }],
    children: children
  });
};
exports.FixedSize = FixedSize;
var _default = exports.default = FixedSize;
//# sourceMappingURL=FixedSize.js.map