import { useState } from 'react';
import { GestureTouchEvent } from 'react-native-gesture-handler';

import { Vec2D } from '../typings';
import { useLatestCallback } from './useLatestCallback';

export const useDebugPoints = ({
  originalPageX,
  originalPageY,
}: {
  originalPageX: number;
  originalPageY: number;
}) => {
  const [debugPoints, setDebugPoints] = useState<Vec2D[]>([]);

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const setPinchDebugPoints = useLatestCallback(
    (e: GestureTouchEvent, zoomCenter: Vec2D, ...points: Vec2D[]) => {
      setDebugPoints([
        {
          x: e.allTouches[0].absoluteX - originalPageX,
          y: e.allTouches[0].absoluteY - originalPageY,
        },
        {
          x: e.allTouches[1].absoluteX - originalPageX,
          y: e.allTouches[1].absoluteY - originalPageY,
        },
        zoomCenter,
        ...points,
      ]);
    }
  );

  return { debugPoints, setDebugPoints, setPinchDebugPoints };
};
