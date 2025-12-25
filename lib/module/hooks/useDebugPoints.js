"use strict";

import { useState } from 'react';
import { useLatestCallback } from './useLatestCallback';
export const useDebugPoints = () => {
  const [debugPoints, setDebugPoints] = useState([]);

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const setPinchDebugPoints = useLatestCallback((e, zoomCenter, ...points) => {
    setDebugPoints([{
      x: e.allTouches[0].x,
      y: e.allTouches[0].y
    }, {
      x: e.allTouches[1].x,
      y: e.allTouches[1].y
    }, zoomCenter, ...points]);
  });
  return {
    debugPoints,
    setDebugPoints,
    setPinchDebugPoints
  };
};
//# sourceMappingURL=useDebugPoints.js.map