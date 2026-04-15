import React from 'react';
import {
  Animated,
  GestureResponderEvent,
  Image,
  PanResponder,
  PanResponderGestureState,
  StyleSheet,
  View,
  ViewProps,
} from 'react-native';
import { Size2D } from 'src/typings';

export const StaticPin = ({
  staticPinPosition,
  staticPinIcon,
  pinSize,
  onParentMove,
  onParentRelease,
  onParentTerminate,
  longPressDuration,
  onPress,
  onLongPress,
  setPinSize,
  pinProps = {},
}: {
  staticPinPosition: { x: number; y: number };
  staticPinIcon: React.ReactNode;
  pinSize: Size2D;
  /** Internal handler for passing move event to parent */
  onParentMove: (
    evt: GestureResponderEvent,
    gestureState: PanResponderGestureState
  ) => boolean | undefined;
  onParentRelease: (
    evt: GestureResponderEvent,
    gestureState: PanResponderGestureState
  ) => void;
  onParentTerminate: (
    evt: GestureResponderEvent,
    gestureState: PanResponderGestureState
  ) => void;
  longPressDuration?: number;
  onPress?: (evt: GestureResponderEvent) => void;
  onLongPress?: (evt: GestureResponderEvent) => void;
  setPinSize: (size: Size2D) => void;
  pinProps?: ViewProps;
}) => {
  const tapTime = React.useRef(0);
  const parentNotified = React.useRef(false);
  const { style: pinStyle, ...restPinProps } = pinProps;
  const pressDuration = longPressDuration ?? 500;
  const transform = [
    { translateY: -pinSize.height },
    { translateX: -pinSize.width / 2 },
  ];

  const opacity = pinSize.width && pinSize.height ? 1 : 0;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        tapTime.current = Date.now();
        parentNotified.current = false;

        // We want to handle tap on this so set true
        return true;
      },
      onPanResponderMove: (evt, gestureState) => {
        // However if the user moves finger we want to pass this evt to parent
        // to handle panning (tap not recognized)
        if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) {
          const accepted = onParentMove(evt, gestureState);
          if (accepted !== false) {
            parentNotified.current = true;
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (parentNotified.current) {
          parentNotified.current = false;
          onParentRelease(evt, gestureState);
          return;
        }
        const dt = Date.now() - tapTime.current;
        if (onPress && dt < pressDuration) {
          onPress(evt);
        }
        if (onLongPress && dt >= pressDuration) {
          onLongPress(evt);
        }
      },
      onPanResponderTerminate: (evt, gestureState) => {
        if (parentNotified.current) {
          parentNotified.current = false;
          onParentTerminate(evt, gestureState);
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        {
          left: staticPinPosition.x,
          top: staticPinPosition.y,
        },
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
        {...panResponder.panHandlers}
      >
        {staticPinIcon || (
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          <Image source={require('../assets/pin.png')} style={styles.pin} />
        )}
      </View>
    </Animated.View>
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
