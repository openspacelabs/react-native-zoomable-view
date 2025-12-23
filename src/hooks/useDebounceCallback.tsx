import { debounce } from 'lodash';
import { useMemo, useRef } from 'react';

import { useLatestCallback } from './useLatestCallback';
import { useUnmount } from './useUnmount';

type DebounceOptions = {
  maxWait?: number;
  leading?: boolean;
  trailing?: boolean;
};

export const useDebounceCallback = <Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
  delay = 500,
  options?: DebounceOptions
) => {
  const latestCallback = useLatestCallback(callback);
  const debouncedRef = useRef<ReturnType<typeof debounce> | null>(null);

  // Memoize options so debounce identity is stable
  const { maxWait, leading, trailing } = options ?? {};
  const hasOptions = !!options;
  const memoizedOptions = useMemo<DebounceOptions | undefined>(
    () => (hasOptions ? { maxWait, leading, trailing } : undefined),
    [hasOptions, maxWait, leading, trailing]
  );

  // The code below was mostly copied from usehooks-ts
  // =============================

  useUnmount(() => {
    debouncedRef.current?.cancel();
  });

  return useMemo(() => {
    const debouncedInstance = debounce(
      (...args: Args) => latestCallback(...args),
      delay,
      memoizedOptions
    );

    debouncedRef.current = debouncedInstance;

    const wrapped = (...args: Args) => debouncedInstance(...args);

    wrapped.cancel = () => {
      debouncedInstance.cancel();
    };
    wrapped.flush = () => debouncedInstance.flush();

    return wrapped;
  }, [latestCallback, delay, memoizedOptions]);
};
