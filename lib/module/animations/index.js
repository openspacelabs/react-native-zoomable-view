import { Animated, Easing } from 'react-native';
export function getBoundaryCrossedAnim(animValue, toValue) {
  return Animated.spring(animValue, {
    overshootClamping: true,
    toValue,
    useNativeDriver: true
  });
}
export function getPanMomentumDecayAnim(animValue, velocity) {
  return Animated.decay(animValue, {
    velocity,
    deceleration: 0.994,
    useNativeDriver: true
  });
}
export function getZoomToAnimation(animValue, toValue) {
  return Animated.timing(animValue, {
    easing: Easing.out(Easing.ease),
    toValue,
    useNativeDriver: true
  });
}
//# sourceMappingURL=index.js.map