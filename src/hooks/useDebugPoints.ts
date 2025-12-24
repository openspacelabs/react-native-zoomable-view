import { useState } from 'react';
import { GestureResponderEvent } from 'react-native';

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
    (
      gestureResponderEvent: GestureResponderEvent,
      zoomCenter: Vec2D,
      ...points: Vec2D[]
    ) => {
      const { touches } = gestureResponderEvent.nativeEvent;

      setDebugPoints([
        {
          x: touches[0].pageX - originalPageX,
          y: touches[0].pageY - originalPageY,
        },
        {
          x: touches[1].pageX - originalPageX,
          y: touches[1].pageY - originalPageY,
        },
        zoomCenter,
        ...points,
      ]);
    }
  );

  return { debugPoints, setDebugPoints, setPinchDebugPoints };
};
