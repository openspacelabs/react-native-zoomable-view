import { SharedValue } from 'react-native-reanimated';

// This calculates the drag offset from the pinch gesture
export const pinchDragTranslate = (
  lastPinchDrag: { x: SharedValue<number>; y: SharedValue<number> },
  pinchDrag: { x: SharedValue<number>; y: SharedValue<number> },
  lastScale: number,
  eventScale: SharedValue<number>
) => {
  'worklet';

  const scale = lastScale * eventScale.value;

  return {
    x: lastPinchDrag.x.value + pinchDrag.x.value / scale,
    y: lastPinchDrag.y.value + pinchDrag.y.value / scale,
  };
};
