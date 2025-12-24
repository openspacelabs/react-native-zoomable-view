"use strict";

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { jsx as _jsx } from "react/jsx-runtime";
export const DebugTouchPoint = ({
  diameter = 20,
  x = 0,
  y = 0,
  color = 'yellow'
}) => {
  const radius = diameter / 2;
  return /*#__PURE__*/_jsx(View, {
    style: [
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    styles.debugPoint, {
      width: diameter,
      height: diameter,
      borderRadius: diameter,
      backgroundColor: color,
      left: x - radius,
      top: y - radius
    }],
    pointerEvents: "none"
  });
};
export const DebugRect = ({
  height,
  x = 0,
  y = 0,
  color = 'yellow'
}) => {
  const width = 5;
  return /*#__PURE__*/_jsx(View, {
    style: [
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    styles.debugRect, {
      width,
      height,
      backgroundColor: color,
      left: x - width / 2,
      top: y
    }],
    pointerEvents: "none"
  });
};
const styles = StyleSheet.create({
  debugPoint: {
    opacity: 0.7,
    position: 'absolute'
  },
  debugRect: {
    opacity: 0.5,
    position: 'absolute'
  }
});
//# sourceMappingURL=index.js.map