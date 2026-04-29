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
  const hasDragged = React.useRef(false);
  const parentNotified = React.useRef(false);
  const { style: pinStyle, ...restPinProps } = pinProps;
  const pressDuration = longPressDuration ?? 500;
  const pressDurationRef = React.useRef(pressDuration);
  pressDurationRef.current = pressDuration;
  const onPressRef = React.useRef(onPress);
  onPressRef.current = onPress;
  const onLongPressRef = React.useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  const transform = [
    { translateY: -pinSize.height },
    { translateX: -pinSize.width / 2 },
  ];

  const opacity = pinSize.width && pinSize.height ? 1 : 0;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        tapTime.current = Date.now();
        hasDragged.current = false;
        parentNotified.current = false;

        // We want to handle tap on this so set true
        return true;
      },
      onPanResponderMove: (evt, gestureState) => {
        // However if the user moves finger we want to pass this evt to parent
        // to handle panning (tap not recognized)
        if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) {
          hasDragged.current = true;
          const accepted = onParentMove(evt, gestureState);
          if (accepted === undefined) {
            parentNotified.current = true;
          } else if (accepted) {
            // Parent handled it internally (e.g. 3-touch branch) —
            // clear parentNotified so release doesn't fire a spurious
            // onParentRelease → _resolveAndHandleTap.
            parentNotified.current = false;
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (parentNotified.current) {
          hasDragged.current = false;
          parentNotified.current = false;
          onParentRelease(evt, gestureState);
          return;
        }
        if (hasDragged.current) {
          hasDragged.current = false;
          return;
        }
        const dt = Date.now() - tapTime.current;
        if (onPressRef.current && dt < pressDurationRef.current) {
          onPressRef.current(evt);
        }
        if (onLongPressRef.current && dt >= pressDurationRef.current) {
          onLongPressRef.current(evt);
        }
      },
      onPanResponderTerminate: (evt, gestureState) => {
        if (parentNotified.current) {
          hasDragged.current = false;
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
        {...panResponder.panHandlers}
      >
        {staticPinIcon || (
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-use-before-define
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
