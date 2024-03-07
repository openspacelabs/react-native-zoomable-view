"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnimatedTouchFeedback = void 0;

var _react = _interopRequireWildcard(require("react"));

var _reactNative = require("react-native");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const AnimatedTouchFeedback = ({
  x,
  y,
  animationDelay,
  animationDuration,
  onAnimationDone
}) => {
  const appearDisappearAnimRef = (0, _react.useRef)(new _reactNative.Animated.Value(0));
  const self = (0, _react.useRef)({});
  self.current.onAnimationDone = onAnimationDone;
  (0, _react.useEffect)(() => {
    appearDisappearAnimRef.current.setValue(0);
    const inDuration = animationDuration * 0.8;
    const outDuration = animationDuration - inDuration;

    _reactNative.Animated.sequence([_reactNative.Animated.timing(appearDisappearAnimRef.current, {
      delay: animationDelay || 0,
      toValue: 1,
      duration: inDuration,
      easing: _reactNative.Easing.linear,
      useNativeDriver: true
    }), _reactNative.Animated.timing(appearDisappearAnimRef.current, {
      toValue: 0,
      duration: outDuration,
      easing: _reactNative.Easing.out(_reactNative.Easing.ease),
      useNativeDriver: true
    })]).start(self.current.onAnimationDone);
  }, [animationDelay, animationDuration]);
  return /*#__PURE__*/_react.default.createElement(_reactNative.Animated.View, {
    pointerEvents: "none",
    style: [styles.animatedTouchFeedback, {
      opacity: appearDisappearAnimRef.current.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.3]
      }),
      left: x - 20,
      top: y - 20,
      transform: [{
        scale: appearDisappearAnimRef.current.interpolate({
          inputRange: [0, 1],
          outputRange: [0.5, 1]
        })
      }]
    }]
  });
};

exports.AnimatedTouchFeedback = AnimatedTouchFeedback;

const styles = _reactNative.StyleSheet.create({
  animatedTouchFeedback: {
    width: 40,
    height: 40,
    borderRadius: 40,
    backgroundColor: 'lightgray',
    position: 'absolute'
  }
});
//# sourceMappingURL=AnimatedTouchFeedback.js.map