import { useState } from 'react';
import { GestureTouchEvent } from 'react-native-gesture-handler';
import { SharedValue } from 'react-native-reanimated';

import { Vec2D } from '../typings';
import { useLatestCallback } from './useLatestCallback';

export const useDebugPoints = ({
  originalPageX,
  originalPageY,
}: {
  originalPageX: SharedValue<number>;
  originalPageY: SharedValue<number>;
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
          x: e.allTouches[0].absoluteX - originalPageX.value,
          y: e.allTouches[0].absoluteY - originalPageY.value,
        },
        {
          x: e.allTouches[1].absoluteX - originalPageX.value,
          y: e.allTouches[1].absoluteY - originalPageY.value,
        },
        zoomCenter,
        ...points,
      ]);
    }
  );

  return { debugPoints, setDebugPoints, setPinchDebugPoints };
};
