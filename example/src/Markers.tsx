import * as React from 'react';
import { StyleSheet } from 'react-native';

import Animated, {
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';

// Scale-independent markers!
// These markers will move and zoom with the image, but will retain their size
// becuase of the scale transformation.
export const Markers = ({ scale }: { scale: SharedValue<number> }) => (
  <>
    {[20, 40, 60, 80].map((left) =>
      [20, 40, 60, 80].map((top) => (
        <Marker key={`${left}x${top}`} left={left} top={top} scale={scale} />
      ))
    )}
  </>
);

const Marker = ({ left, top, scale }) => {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 / scale.value }],
  }));
  const position = { left: `${left}%`, top: `${top}%` };
  return <Animated.View style={[styles.marker, position, animatedStyle]} />;
};

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    marginTop: -10,
    borderRadius: 10,
    backgroundColor: 'white',
    borderWidth: 2,
  },
});
