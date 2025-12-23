"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useDebounceCallback = void 0;

var _lodash = require("lodash");

var _react = require("react");

var _useLatestCallback = require("./useLatestCallback");

var _useUnmount = require("./useUnmount");

const useDebounceCallback = (callback, delay = 500, options) => {
  const latestCallback = (0, _useLatestCallback.useLatestCallback)(callback);
  const debouncedRef = (0, _react.useRef)(null); // Memoize options so debounce identity is stable

  const {
    maxWait,
    leading,
    trailing
  } = options ?? {};
  const hasOptions = !!options;
  const memoizedOptions = (0, _react.useMemo)(() => hasOptions ? {
    maxWait,
    leading,
    trailing
  } : undefined, [hasOptions, maxWait, leading, trailing]); // The code below was mostly copied from usehooks-ts
  // =============================

  (0, _useUnmount.useUnmount)(() => {
    debouncedRef.current?.cancel();
  });
  return (0, _react.useMemo)(() => {
    const debouncedInstance = (0, _lodash.debounce)((...args) => latestCallback(...args), delay, memoizedOptions);
    debouncedRef.current = debouncedInstance;

    const wrapped = (...args) => debouncedInstance(...args);

    wrapped.cancel = () => {
      debouncedInstance.cancel();
    };

    wrapped.flush = () => debouncedInstance.flush();

    return wrapped;
  }, [latestCallback, delay, memoizedOptions]);
};

exports.useDebounceCallback = useDebounceCallback;
//# sourceMappingURL=useDebounceCallback.js.map