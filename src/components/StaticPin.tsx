import React from 'react';
import { Image, StyleSheet, View, ViewProps } from 'react-native';

import { Size2D } from '../typings';

export const StaticPin = ({
  staticPinPosition,
  staticPinIcon,
  pinSize,
  setPinSize,
  pinProps = {},
}: {
  staticPinPosition: { x: number; y: number };
  staticPinIcon: React.ReactNode;
  pinSize: Size2D;
  setPinSize: (size: Size2D) => void;
  pinProps?: ViewProps;
}) => {
  const transform = [
    { translateY: -pinSize.height },
    { translateX: -pinSize.width / 2 },
  ];

  const opacity = pinSize.width && pinSize.height ? 1 : 0;

  return (
    <View
      style={[
        {
          left: staticPinPosition.x,
          top: staticPinPosition.y,
        },
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        styles.pinWrapper,
        { opacity, transform },
      ]}
      {...pinProps}
    >
      <View
        onLayout={({ nativeEvent: { layout } }) => {
          setPinSize(layout);
        }}
      >
        {staticPinIcon || (
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-use-before-define
          <Image source={require('../assets/pin.png')} style={styles.pin} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  pin: {
    height: 64,
    width: 48,
  },
  pinWrapper: {
    position: 'absolute',
  },
});
