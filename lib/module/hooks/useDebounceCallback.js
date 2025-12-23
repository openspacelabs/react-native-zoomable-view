"use strict";

import { debounce } from 'lodash';
import { useMemo, useRef } from 'react';
import { useLatestCallback } from './useLatestCallback';
import { useUnmount } from './useUnmount';
export const useDebounceCallback = (callback, delay = 500, options) => {
  const latestCallback = useLatestCallback(callback);
  const debouncedRef = useRef(null); // Memoize options so debounce identity is stable

  const {
    maxWait,
    leading,
    trailing
  } = options ?? {};
  const hasOptions = !!options;
  const memoizedOptions = useMemo(() => hasOptions ? {
    maxWait,
    leading,
    trailing
  } : undefined, [hasOptions, maxWait, leading, trailing]); // The code below was mostly copied from usehooks-ts
  // =============================

  useUnmount(() => {
    debouncedRef.current?.cancel();
  });
  return useMemo(() => {
    const debouncedInstance = debounce((...args) => latestCallback(...args), delay, memoizedOptions);
    debouncedRef.current = debouncedInstance;

    const wrapped = (...args) => debouncedInstance(...args);

    wrapped.cancel = () => {
      debouncedInstance.cancel();
    };

    wrapped.flush = () => debouncedInstance.flush();

    return wrapped;
  }, [latestCallback, delay, memoizedOptions]);
};
//# sourceMappingURL=useDebounceCallback.js.map