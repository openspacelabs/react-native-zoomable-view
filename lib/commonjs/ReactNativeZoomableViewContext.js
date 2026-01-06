"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useZoomableViewContext = exports.ReactNativeZoomableViewContext = void 0;
var _react = require("react");
const ReactNativeZoomableViewContext = exports.ReactNativeZoomableViewContext = /*#__PURE__*/(0, _react.createContext)(null);
const useZoomableViewContext = () => {
  const context = (0, _react.useContext)(ReactNativeZoomableViewContext);
  if (!context) {
    throw new Error('useZoomableViewContext must be used within ReactNativeZoomableView');
  }
  return context;
};
exports.useZoomableViewContext = useZoomableViewContext;
//# sourceMappingURL=ReactNativeZoomableViewContext.js.map