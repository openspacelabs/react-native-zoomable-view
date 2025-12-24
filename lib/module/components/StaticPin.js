"use strict";

import React from 'react';
import { Animated, Image, PanResponder, StyleSheet, View } from 'react-native';
import { jsx as _jsx } from "react/jsx-runtime";
export const StaticPin = ({
  staticPinPosition,
  staticPinIcon,
  pinSize,
  onParentMove,
  onPress,
  onLongPress,
  setPinSize,
  pinProps = {}
}) => {
  const tapTime = React.useRef(0);
  const transform = [{
    translateY: -pinSize.height
  }, {
    translateX: -pinSize.width / 2
  }];
  const opacity = pinSize.width && pinSize.height ? 1 : 0;
  const panResponder = React.useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => {
      tapTime.current = Date.now();

      // We want to handle tap on this so set true
      return true;
    },
    onPanResponderMove: (evt, gestureState) => {
      // However if the user moves finger we want to pass this evt to parent
      // to handle panning (tap not recognized)
      if (Math.abs(gestureState.dx) > 5 && Math.abs(gestureState.dy) > 5) onParentMove(evt, gestureState);
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) return;
      const dt = Date.now() - tapTime.current;
      if (onPress && dt < 500) {
        onPress(evt);
      }
      if (onLongPress && dt > 500) {
        // RN long press is 500ms
        onLongPress(evt);
      }
    }
  })).current;
  return /*#__PURE__*/_jsx(Animated.View, {
    style: [{
      left: staticPinPosition.x,
      top: staticPinPosition.y
    },
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    styles.pinWrapper, {
      opacity,
      transform
    }],
    ...pinProps,
    children: /*#__PURE__*/_jsx(View, {
      onLayout: ({
        nativeEvent: {
          layout
        }
      }) => {
        setPinSize(layout);
      },
      ...panResponder.panHandlers,
      children: staticPinIcon ||
      /*#__PURE__*/
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-use-before-define
      _jsx(Image, {
        source: require('../assets/pin.png'),
        style: styles.pin
      })
    })
  });
};
const styles = StyleSheet.create({
  pin: {
    height: 64,
    width: 48
  },
  pinWrapper: {
    position: 'absolute'
  }
});
//# sourceMappingURL=StaticPin.js.map