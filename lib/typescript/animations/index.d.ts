import { Animated } from 'react-native';
import { Vec2D } from '../typings';
export declare function getBoundaryCrossedAnim(animValue: Animated.Value, toValue: number): Animated.CompositeAnimation;
export declare function getPanMomentumDecayAnim(animValue: Animated.Value | Animated.ValueXY, velocity: number | Vec2D): Animated.CompositeAnimation;
export declare function getZoomToAnimation(animValue: Animated.Value, toValue: number): Animated.CompositeAnimation;
