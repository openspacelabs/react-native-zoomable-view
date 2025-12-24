"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useLatestCallback = void 0;
var _react = require("react");
/**
 * A hook that returns a stable callback reference that always calls the latest version of the function.
 * This avoids the need to include the callback in dependency arrays while ensuring the latest version is called.
 */
const useLatestCallback = callback => {
  const ref = (0, _react.useRef)(callback);
  ref.current = callback;
  return (0, _react.useRef)((...args) => ref.current(...args)).current;
};
exports.useLatestCallback = useLatestCallback;
//# sourceMappingURL=useLatestCallback.js.map