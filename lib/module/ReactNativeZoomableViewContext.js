"use strict";

import { createContext, useContext } from 'react';
export const ReactNativeZoomableViewContext = /*#__PURE__*/createContext(null);
export const useZoomableViewContext = () => {
  const context = useContext(ReactNativeZoomableViewContext);
  if (!context) {
    throw new Error('useZoomableViewContext must be used within ReactNativeZoomableView');
  }
  return context;
};
//# sourceMappingURL=ReactNativeZoomableViewContext.js.map