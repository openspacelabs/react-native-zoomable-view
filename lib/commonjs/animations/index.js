"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getBoundaryCrossedAnim = getBoundaryCrossedAnim;
exports.getPanMomentumDecayAnim = getPanMomentumDecayAnim;
exports.getZoomToAnimation = getZoomToAnimation;

var _reactNative = require("react-native");

function getBoundaryCrossedAnim(animValue, toValue) {
  return _reactNative.Animated.spring(animValue, {
    overshootClamping: true,
    toValue,
    useNativeDriver: true
  });
}

function getPanMomentumDecayAnim(animValue, velocity) {
  return _reactNative.Animated.decay(animValue, {
    velocity,
    deceleration: 0.994,
    useNativeDriver: true
  });
}

function getZoomToAnimation(animValue, toValue) {
  return _reactNative.Animated.timing(animValue, {
    easing: _reactNative.Easing.out(_reactNative.Easing.ease),
    toValue,
    useNativeDriver: true
  });
}
//# sourceMappingURL=index.js.map