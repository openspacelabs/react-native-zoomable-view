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

  // Pull `style` and `pointerEvents` out of `pinProps` so the JSX spread
  // can't last-write-wins over our defaults — both are load-bearing
  // (positioning array, sibling-tree pass-through). Caller still gets to
  // override deliberately.
  const {
    style: pinStyle,
    pointerEvents = 'box-none',
    ...restPinProps
  } = pinProps;

  return (
    <View
      pointerEvents={pointerEvents}
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
        pointerEvents="box-none"
        onLayout={({ nativeEvent: { layout } }) => {
          setPinSize(layout);
        }}
      >
        {staticPinIcon || (
          // Default marker is non-interactive — pass-through so canvas
          // pan/pinch still work on an unconfigured pin.
          <View pointerEvents="none">
            <Image
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-use-before-define
              source={require('../assets/pin.png')}
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              style={styles.pin}
            />
          </View>
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
