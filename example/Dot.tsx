import React, { useContext } from 'react';
import Animated from 'react-native-reanimated';

import { ReactNativeZoomableViewContext } from '../src/ReactNativeZoomableView';
import { styles } from './style';

export const Dot = ({ left, top }: { left: number; top: number }) => {
  const context = useContext(ReactNativeZoomableViewContext);

  return (
    <Animated.View
      style={[
        styles.marker,
        context?.inverseZoomStyle,
        { left: `${left}%`, top: `${top}%` },
      ]}
    />
  );
};
