import React from 'react';
import { Animated, View, Image, StyleSheet } from 'react-native';
export const StaticPin = ({
  staticPinPosition,
  pinAnim,
  staticPinIcon,
  pinSize,
  setPinSize
}) => {
  const transform = [{
    translateY: -pinSize.height
  }, {
    translateX: -pinSize.width / 2
  }, ...pinAnim.getTranslateTransform()];
  const opacity = pinSize.width && pinSize.height ? 1 : 0;
  return /*#__PURE__*/React.createElement(Animated.View, {
    pointerEvents: "none",
    style: [staticPinPosition && {
      left: staticPinPosition.x,
      top: staticPinPosition.y
    }, styles.pinWrapper, {
      opacity,
      transform
    }]
  }, /*#__PURE__*/React.createElement(View, {
    onLayout: ({
      nativeEvent: {
        layout
      }
    }) => setPinSize(layout)
  }, staticPinIcon || /*#__PURE__*/React.createElement(Image, {
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