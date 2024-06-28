function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

import React from 'react';
import { Animated, View, Image, StyleSheet, PanResponder } from 'react-native';
export const StaticPin = ({
  staticPinPosition,
  pinAnim,
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
  }, ...pinAnim.getTranslateTransform()];
  const opacity = pinSize.width && pinSize.height ? 1 : 0;
  const panResponder = React.useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => {
      tapTime.current = Date.now(); // We want to handle tap on this so set true

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
  return /*#__PURE__*/React.createElement(Animated.View, _extends({
    style: [staticPinPosition && {
      left: staticPinPosition.x,
      top: staticPinPosition.y
    }, styles.pinWrapper, {
      opacity,
      transform
    }]
  }, pinProps), /*#__PURE__*/React.createElement(View, _extends({
    onLayout: ({
      nativeEvent: {
        layout
      }
    }) => setPinSize(layout)
  }, panResponder.panHandlers), staticPinIcon || /*#__PURE__*/React.createElement(Image, {
    source: require('../assets/pin.png'),
    style: styles.pin
  })));
};
const styles = StyleSheet.create({
  pinWrapper: {
    position: 'absolute'
  },
  pin: {
    width: 48,
    height: 64
  }
});
//# sourceMappingURL=StaticPin.js.map