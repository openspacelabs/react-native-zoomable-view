"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useUnmount = void 0;

var _react = require("react");

var _useLatestCallback = require("./useLatestCallback");

const useUnmount = callback => {
  const latestCallback = (0, _useLatestCallback.useLatestCallback)(callback);
  (0, _react.useEffect)(() => {
    return () => {
      latestCallback();
    };
  }, [latestCallback]);
};

exports.useUnmount = useUnmount;
//# sourceMappingURL=useUnmount.js.map