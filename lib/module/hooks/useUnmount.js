"use strict";

import { useEffect } from 'react';
import { useLatestCallback } from './useLatestCallback';
export const useUnmount = callback => {
  const latestCallback = useLatestCallback(callback);
  useEffect(() => {
    return () => {
      latestCallback();
    };
  }, [latestCallback]);
};
//# sourceMappingURL=useUnmount.js.map