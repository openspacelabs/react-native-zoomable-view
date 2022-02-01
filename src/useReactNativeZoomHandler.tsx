// TODO:
// There is a jump in the following situation:
// Two finger pinch / drag -> 1 finger drag -> 2 finger drag
// The focal offset is not being reapplied perfectly.

import { useState } from 'react';
import { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { clamp } from './helper/clamp';
import { pinchDragTranslate } from './helper/pinchDragTranslate';
import { pinchTranslate } from './helper/pinchTranslate';

export const useReactNativeZoomHandler = ({
  scaleValue,
  initialZoom,
  maxZoom,
  minZoom,
}) => {
  const [layout, setLayout] = useState({ height: 0, width: 0 });
  const pinchStart = { x: useSharedValue(0), y: useSharedValue(0) };
  const eventScale = useSharedValue(1);
  const last = {
    x: useSharedValue(0),
    y: useSharedValue(0),
    scale: useSharedValue(initialZoom),
  };
  const pinchDrag = { x: useSharedValue(0), y: useSharedValue(0) };
  const lastPinchDrag = { x: useSharedValue(0), y: useSharedValue(0) };
  const oneFingerPinching = useSharedValue(false);
  const oneFingerPinchingOffset = {
    x: useSharedValue(0),
    y: useSharedValue(0),
  };
  const lastEvent = { focalX: useSharedValue(0), focalY: useSharedValue(0) };

  const updateProps = ({ scale }) => {
    'worklet';
    if (scaleValue) scaleValue.value = scale;
  };

  const onLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  const onPinchBegin = (event) => {
    'worklet';
    pinchStart.x.value = event.focalX;
    pinchStart.y.value = event.focalY;

    oneFingerPinchingOffset.x.value = 0;
    oneFingerPinchingOffset.y.value = 0;
    oneFingerPinching.value = event.numberActiveTouches === 1;
  };

  const onPinchUpdate = (event) => {
    'worklet';

    // TODO: Handle lifting one finger from the pinch and continuing to drag
    // by using an offset value from `focalX` when `event.numberOfPointers` becomes 1.
    if (event.numberOfPointers === 2) {
      if (oneFingerPinching.value === true) {
        // We just transitioned from one-finger pinching to two-finger pinching
        oneFingerPinching.value = false;

        // Calculate how much the pinch has moved since the last time we were in two-finger pinching mode
        const x = event.focalX - lastEvent.focalX.value;
        const y = event.focalY - lastEvent.focalY.value;
        oneFingerPinchingOffset.x.value += x;
        oneFingerPinchingOffset.y.value += y;

        pinchStart.y.value = event.focalY;
        pinchStart.x.value = event.focalX;
      }
      pinchDrag.x.value =
        event.focalX - oneFingerPinchingOffset.x.value - pinchStart.x.value;
      pinchDrag.y.value =
        event.focalY - oneFingerPinchingOffset.y.value - pinchStart.y.value;
      eventScale.value = clamp(event.scale, minZoom, maxZoom);
    } else {
      if (!oneFingerPinching.value) {
        // Just started one-finger pinching
        const x = event.focalX - lastEvent.focalX.value;
        const y = event.focalY - lastEvent.focalY.value;
        oneFingerPinchingOffset.x.value += x;
        oneFingerPinchingOffset.y.value += y;
        oneFingerPinching.value = true;
      }

      pinchDrag.x.value =
        event.focalX - oneFingerPinchingOffset.x.value - pinchStart.x.value;
      pinchDrag.y.value =
        event.focalY - oneFingerPinchingOffset.y.value - pinchStart.y.value;
    }

    lastEvent.focalX.value = event.focalX;
    lastEvent.focalY.value = event.focalY;

    let scale = clamp(last.scale.value * eventScale.value, minZoom, maxZoom);
    updateProps({ scale });
  };

  const onPinchEnd = () => {
    'worklet';
    const lastScale = last.scale.value;
    let scale = clamp(lastScale * eventScale.value, minZoom, maxZoom);
    const { x, y } = pinchTranslate(last, scale, pinchStart, layout);
    last.x.value = x;
    last.y.value = y;
    last.scale.value = scale;
    updateProps({ scale });
    eventScale.value = 1;
    lastPinchDrag.x.value += pinchDrag.x.value / scale;
    lastPinchDrag.y.value += pinchDrag.y.value / scale;
    pinchDrag.x.value = 0;
    pinchDrag.y.value = 0;
  };

  const dragOffset = { x: useSharedValue(0), y: useSharedValue(0) };
  const dragStart = { x: useSharedValue(0), y: useSharedValue(0) };

  const onDragUpdate = (e) => {
    'worklet';
    dragOffset.x.value = dragStart.x.value + e.translationX / scaleValue.value;
    dragOffset.y.value = dragStart.y.value + e.translationY / scaleValue.value;
  };

  const onDragEnd = () => {
    'worklet';
    dragStart.x.value = dragOffset.x.value;
    dragStart.y.value = dragOffset.y.value;
  };

  const animatedStyles = useAnimatedStyle(() => {
    if (!layout.width || !layout.height) return {};

    let lastScale = clamp(last.scale.value, minZoom, maxZoom);
    let scale = clamp(last.scale.value * eventScale.value, minZoom, maxZoom);

    // Scale offset
    const { x: pinchOffsetTranslateX, y: pinchOffsetTranslateY } =
      pinchTranslate(last, scale, pinchStart, layout);

    // Pinch drag offset comes after the scale offset
    const { x: pinchPanX, y: pinchPanY } = pinchDragTranslate(
      lastPinchDrag,
      pinchDrag,
      lastScale,
      eventScale
    );

    return {
      transform: [
        { translateX: pinchOffsetTranslateX },
        { translateY: pinchOffsetTranslateY },
        { scale },
        { translateX: pinchPanX },
        { translateY: pinchPanY },
        { translateX: dragOffset.x.value },
        { translateY: dragOffset.y.value },
      ],
    };
  });

  return {
    onLayout,
    onPinchBegin,
    onPinchUpdate,
    onPinchEnd,
    onDragUpdate,
    onDragEnd,
    animatedStyles,
  };
};
