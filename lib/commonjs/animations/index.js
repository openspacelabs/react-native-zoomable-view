"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getZoomToAnimation = getZoomToAnimation;

var _reactNative = require("react-native");

function getZoomToAnimation(animValue, toValue) {
  return _reactNative.Animated.timing(animValue, {
    easing: _reactNative.Easing.out(_reactNative.Easing.ease),
    toValue,
    useNativeDriver: true
  });
}
//# sourceMappingURL=index.js.map