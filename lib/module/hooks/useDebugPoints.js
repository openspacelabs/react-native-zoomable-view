"use strict";

import { useState } from 'react';
import { useLatestCallback } from './useLatestCallback';
export const useDebugPoints = ({
  originalPageX,
  originalPageY
}) => {
  const [debugPoints, setDebugPoints] = useState([]);

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const setPinchDebugPoints = useLatestCallback((gestureResponderEvent, zoomCenter, ...points) => {
    const {
      touches
    } = gestureResponderEvent.nativeEvent;
    setDebugPoints([{
      x: touches[0].pageX - originalPageX,
      y: touches[0].pageY - originalPageY
    }, {
      x: touches[1].pageX - originalPageX,
      y: touches[1].pageY - originalPageY
    }, zoomCenter, ...points]);
  });
  return {
    debugPoints,
    setDebugPoints,
    setPinchDebugPoints
  };
};
//# sourceMappingURL=useDebugPoints.js.map