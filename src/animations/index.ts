import { Animated, Easing } from 'react-native';

export function getZoomToAnimation(animValue: Animated.Value, toValue: number) {
  return Animated.timing(animValue, {
    easing: Easing.out(Easing.ease),
    toValue,
    useNativeDriver: true,
  });
}
