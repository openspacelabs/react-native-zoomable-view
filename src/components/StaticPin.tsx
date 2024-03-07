import React from 'react';
import { Animated, View, Image, StyleSheet } from 'react-native';
import { Size2D } from 'src/typings';

export const StaticPin = ({
  staticPinPosition,
  pinAnim,
  staticPinIcon,
  pinSize,
  setPinSize,
}: {
  staticPinPosition: { x: number; y: number };
  pinAnim: Animated.ValueXY;
  staticPinIcon: React.ReactNode;
  pinSize: Size2D;
  setPinSize: (size: Size2D) => void;
}) => {
  const transform = [
    { translateY: -pinSize.height },
    { translateX: -pinSize.width / 2 },
    ...pinAnim.getTranslateTransform(),
  ];

  const opacity = pinSize.width && pinSize.height ? 1 : 0;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        staticPinPosition && {
          left: staticPinPosition.x,
          top: staticPinPosition.y,
        },
        styles.pinWrapper,
        { opacity, transform },
      ]}
    >
      <View onLayout={({ nativeEvent: { layout } }) => setPinSize(layout)}>
        {staticPinIcon || (
          <Image source={require('../assets/pin.png')} style={styles.pin} />
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  pinWrapper: {
    position: 'absolute',
  },
  pin: {
    width: 48,
    height: 64,
  },
});
