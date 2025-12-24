import { Gesture, GestureTouchEvent } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

export const useGesture = ({
  touchesDownWorklet,
  touchesMoveWorklet,
  finalizeWorklet,
}: {
  touchesDownWorklet: (e: GestureTouchEvent) => void;
  touchesMoveWorklet: (e: GestureTouchEvent) => void;
  finalizeWorklet: (e: GestureTouchEvent) => void;
}) => {
  const lastTouchEvent = useSharedValue<GestureTouchEvent | undefined>(
    undefined
  );

  const gesture = Gesture.Manual()
    .onTouchesDown((e) => {
      console.log('start', e);
      touchesDownWorklet(e);
    })
    .onTouchesMove((e) => {
      console.log('move', e);
      touchesMoveWorklet(e);
      lastTouchEvent.value = e;
    })
    .onFinalize((e) => {
      console.log('end', e);
      if (!lastTouchEvent.value) return;
      finalizeWorklet(lastTouchEvent.value);
      lastTouchEvent.value = undefined;
    });

  return gesture;
};
