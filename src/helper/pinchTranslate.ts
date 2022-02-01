import { SharedValue } from 'react-native-reanimated';

// This calculates the pinch gesture's zoom offset
export const pinchTranslate = (
  last: {
    scale: SharedValue<number>;
    x: SharedValue<number>;
    y: SharedValue<number>;
  },
  scale: number,
  pinchStart: {
    x: SharedValue<number>;
    y: SharedValue<number>;
  },
  layout: {
    height: number;
    width: number;
  }
) => {
  'worklet';

  const lastWidth = layout.width * last.scale.value;
  const lastHeight = layout.height * last.scale.value;

  const newWidth = layout.width * scale;
  const newHeight = layout.height * scale;

  const lastCenterPositionX = last.x.value + layout.width / 2;
  const lastCenterPositionY = last.y.value + layout.height / 2;

  const pinchAndCenterDistanceX = pinchStart.x.value - lastCenterPositionX;
  const pinchAndCenterDistanceY = pinchStart.y.value - lastCenterPositionY;

  const pinchDistanceRatioX = pinchAndCenterDistanceX / lastWidth;
  const pinchDistanceRatioY = pinchAndCenterDistanceY / lastHeight;

  // To make it easy to understand this math,
  // try visualizing with lastCenterOffset = 0 first

  const x =
    // We start with the previous center position
    last.x.value +
    // Translate the previous offset to our current pinch position
    lastWidth * pinchDistanceRatioX +
    // Now we apply the *new* scaled width to the same ratio
    // which translates to the new center offset
    newWidth * -pinchDistanceRatioX;

  const y =
    last.y.value +
    lastHeight * pinchDistanceRatioY +
    newHeight * -pinchDistanceRatioY;

  return { x: x || 0, y: y || 0 };
};
