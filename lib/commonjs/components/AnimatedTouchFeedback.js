"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnimatedTouchFeedback = void 0;
var _react = _interopRequireWildcard(require("react"));
var _reactNative = require("react-native");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const AnimatedTouchFeedback = ({
  x,
  y,
  animationDelay,
  animationDuration,
  onAnimationDone
}) => {
  const appearDisappearAnimRef = (0, _react.useRef)(new _reactNative.Animated.Value(0));
  const onAnimationDoneRef = (0, _react.useRef)(onAnimationDone);
  onAnimationDoneRef.current = onAnimationDone;
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
    })]).start(() => onAnimationDoneRef.current?.());
  }, [animationDelay, animationDuration]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.Animated.View, {
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
    backgroundColor: 'lightgray',
    borderRadius: 40,
    height: 40,
    position: 'absolute',
    width: 40
  }
});
//# sourceMappingURL=AnimatedTouchFeedback.js.map