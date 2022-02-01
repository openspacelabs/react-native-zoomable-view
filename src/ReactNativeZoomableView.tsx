import React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { ReactNativeZoomableViewProps } from './typings';
import { useReactNativeZoomHandler } from './useReactNativeZoomHandler';

// A new implementaiton of ReactNativeZoomableView
// using react-native-gesture-handler and react-native-reanimated
// for better performance and much shorter code.

export const ReactNativeZoomableView = ({
  children,
  scaleValue,
  initialZoom = 1,
  maxZoom = 1.5,
  minZoom = 0.5,
  zoomEnabled = true,
}: ReactNativeZoomableViewProps) => {
  const {
    onLayout,
    onPinchBegin,
    onPinchUpdate,
    onPinchEnd,
    onDragUpdate,
    onDragEnd,
    animatedStyles,
  } = useReactNativeZoomHandler({
    scaleValue,
    initialZoom,
    maxZoom,
    minZoom,
  });

  const pinchGesture = Gesture.Pinch()
    .enabled(zoomEnabled)
    .onBegin(onPinchBegin)
    .onUpdate(onPinchUpdate)
    .onEnd(onPinchEnd);

  const dragGesture = Gesture.Pan()
    .enabled(zoomEnabled)
    .averageTouches(true)
    .maxPointers(1)
    .onUpdate(onDragUpdate)
    .onEnd(onDragEnd);

  const gesture = Gesture.Simultaneous(pinchGesture, dragGesture);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View onLayout={onLayout}>
        <Animated.View style={animatedStyles}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};
