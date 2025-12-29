"use strict";

import { Animated, Easing } from 'react-native';
export function getZoomToAnimation(animValue, toValue) {
  return Animated.timing(animValue, {
    easing: Easing.out(Easing.ease),
    toValue,
    useNativeDriver: true
  });
}
//# sourceMappingURL=index.js.map