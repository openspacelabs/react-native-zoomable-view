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

  // `pointerEvents="box-none"` on the outer wrapper is what makes empty
  // bounding-box space pass touches through to the ZoomableView's
  // `<GestureDetector>` (rendered as a sibling, not an ancestor, of this
  // pin). Interactive subregions provided via `staticPinIcon` (e.g. a
  // consumer's `<GestureDetector>`) keep their own default `auto`
  // pointer-events and catch touches in their own area.
  return (
    <View
      pointerEvents="box-none"
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
          // The default icon is a non-interactive marker — wrap in a
          // `pointerEvents="none"` View so it stays transparent to touches.
          // The canvas pan/pinch below still works on a pin that hasn't
          // been customised. A consumer who passes their own
          // `staticPinIcon` controls its pointer events themselves (and
          // typically wraps interactive parts in their own
          // `<GestureDetector>`).
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
