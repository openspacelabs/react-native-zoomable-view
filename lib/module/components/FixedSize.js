"use strict";

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
import { jsx as _jsx } from "react/jsx-runtime";
export const FixedSize = ({
  left,
  top,
  children
}) => {
  const context = React.useContext(ReactNativeZoomableViewContext);
  return /*#__PURE__*/_jsx(Animated.View, {
    style: {
      transform: [{
        scale: context?.inverseZoom ?? 1
      }],
      width: 1,
      height: 1,
      position: 'absolute',
      left: `${left}%`,
      top: `${top}%`
    },
    children: children
  });
};
export default FixedSize;
//# sourceMappingURL=FixedSize.js.map