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

  // Pull `style` out of `pinProps` so a caller-provided style merges into the
  // pin's positioning array instead of replacing it. JSX prop-spreading is
  // last-write-wins, so spreading `pinProps` after `style={[...]}` would let
  // a caller's `pinProps.style` strip the absolute `left`/`top`, opacity, and
  // anchor transforms.
  const { style: pinStyle, ...restPinProps } = pinProps;

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
        pinStyle,
      ]}
      {...restPinProps}
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
