import React from 'react';
import Animated from 'react-native-reanimated';

import { ReactNativeZoomableViewContext } from '../ReactNativeZoomableView';
/**
 * A wrapper component that keeps elements at a fixed visual size regardless of zoom level.
 *
 * @param {{
 *   left: number;
 *   top: number;
 *   children: React.ReactNode;
 * }} param0
 * @param {number} param0.left The left position in percentage (0-100)
 * @param {number} param0.top The top position in percentage (0-100)
 * @param {React.ReactNode} param0.children The children to render inside the fixed size container
 * @returns {*}
 */
export const FixedSize = ({
  left,
  top,
  children,
}: {
  left: number;
  top: number;
  children: React.ReactNode;
}) => {
  const context = React.useContext(ReactNativeZoomableViewContext);

  return (
    <Animated.View
      style={[
        context?.inverseZoomStyle,
        {
          width: 1,
          height: 1,
          position: 'absolute',
          left: `${left}%`,
          top: `${top}%`,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

export default FixedSize;
