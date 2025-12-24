"use strict";

import { useRef } from 'react';

/**
 * A hook that returns a stable callback reference that always calls the latest version of the function.
 * This avoids the need to include the callback in dependency arrays while ensuring the latest version is called.
 */
export const useLatestCallback = callback => {
  const ref = useRef(callback);
  ref.current = callback;
  return useRef((...args) => ref.current(...args)).current;
};
//# sourceMappingURL=useLatestCallback.js.map