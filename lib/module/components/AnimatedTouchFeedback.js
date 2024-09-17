import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
export const AnimatedTouchFeedback = ({
  x,
  y,
  animationDelay,
  animationDuration,
  onAnimationDone
}) => {
  const appearDisappearAnimRef = useRef(new Animated.Value(0));
  const onAnimationDoneRef = useRef(onAnimationDone);
  onAnimationDoneRef.current = onAnimationDone;
  useEffect(() => {
    appearDisappearAnimRef.current.setValue(0);
    const inDuration = animationDuration * 0.8;
    const outDuration = animationDuration - inDuration;
    Animated.sequence([Animated.timing(appearDisappearAnimRef.current, {
      delay: animationDelay || 0,
      toValue: 1,
      duration: inDuration,
      easing: Easing.linear,
      useNativeDriver: true
    }), Animated.timing(appearDisappearAnimRef.current, {
      toValue: 0,
      duration: outDuration,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true
    })]).start(() => {
      var _onAnimationDoneRef$c;

      return (_onAnimationDoneRef$c = onAnimationDoneRef.current) === null || _onAnimationDoneRef$c === void 0 ? void 0 : _onAnimationDoneRef$c.call(onAnimationDoneRef);
    });
  }, [animationDelay, animationDuration]);
  return /*#__PURE__*/React.createElement(Animated.View, {
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
const styles = StyleSheet.create({
  animatedTouchFeedback: {
    backgroundColor: 'lightgray',
    borderRadius: 40,
    height: 40,
    position: 'absolute',
    width: 40
  }
});
//# sourceMappingURL=AnimatedTouchFeedback.js.map