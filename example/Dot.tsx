import React, { useContext } from 'react';
import Animated from 'react-native-reanimated';
import { useAnimatedStyle } from 'react-native-reanimated';

import { ReactNativeZoomableViewContext } from '../src/ReactNativeZoomableView';
import { styles } from './style';

export const Dot = ({ left, top }: { left: number; top: number }) => {
  const context = useContext(ReactNativeZoomableViewContext);

  const markerScaleStyle = useAnimatedStyle(() => {
    const zoom = context?.zoom.value ?? 1;
    return { transform: [{ scale: 1 / zoom }] };
  });

  return (
    <Animated.View
      style={[
        styles.marker,
        markerScaleStyle,
        { left: `${left}%`, top: `${top}%` },
      ]}
    />
  );
};
