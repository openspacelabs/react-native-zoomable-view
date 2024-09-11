import React from 'react';
import {
  Animated,
  View,
  Image,
  StyleSheet,
  GestureResponderEvent,
  PanResponderGestureState,
  PanResponder,
  ViewProps,
} from 'react-native';
import { Size2D } from 'src/typings';

export const StaticPin = ({
  staticPinPosition,
  pinAnim,
  staticPinIcon,
  pinSize,
  onParentMove,
  onPress,
  onLongPress,
  setPinSize,
  pinProps = {},
}: {
  staticPinPosition: { x: number; y: number };
  pinAnim: Animated.ValueXY;
  staticPinIcon: React.ReactNode;
  pinSize: Size2D;
  /** Internal handler for passing move event to parent */
  onParentMove: (
    evt: GestureResponderEvent,
    gestureState: PanResponderGestureState
  ) => boolean;
  onPress?: (evt: GestureResponderEvent) => void;
  onLongPress?: (evt: GestureResponderEvent) => void;
  setPinSize: (size: Size2D) => void;
  pinProps?: ViewProps;
}) => {
  const tapTime = React.useRef(0);
  const transform = [
    { translateY: -pinSize.height },
    { translateX: -pinSize.width / 2 },
    ...pinAnim.getTranslateTransform(),
  ];

  const opacity = pinSize.width && pinSize.height ? 1 : 0;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        tapTime.current = Date.now();

        // We want to handle tap on this so set true
        return true;
      },
      onPanResponderMove: (evt, gestureState) => {
        // However if the user moves finger we want to pass this evt to parent
        // to handle panning (tap not recognized)
        if (Math.abs(gestureState.dx) > 5 && Math.abs(gestureState.dy) > 5)
          onParentMove(evt, gestureState);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5)
          return;
        const dt = Date.now() - tapTime.current;
        if (onPress && dt < 500) {
          onPress(evt);
        }
        if (onLongPress && dt > 500) {
          // RN long press is 500ms
          onLongPress(evt);
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        staticPinPosition && {
          left: staticPinPosition.x,
          top: staticPinPosition.y,
        },
        styles.pinWrapper,
        { opacity, transform },
      ]}
      {...pinProps}
    >
      <View
        onLayout={({ nativeEvent: { layout } }) => setPinSize(layout)}
        {...panResponder.panHandlers}
      >
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
