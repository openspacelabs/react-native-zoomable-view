import React from 'react';
import { Animated, GestureResponderEvent, PanResponderGestureState, ViewProps } from 'react-native';
import { Size2D } from 'src/typings';
export declare const StaticPin: ({ staticPinPosition, pinAnim, staticPinIcon, pinSize, onParentMove, onPress, onLongPress, setPinSize, pinProps, }: {
    staticPinPosition: {
        x: number;
        y: number;
    };
    pinAnim: Animated.ValueXY;
    staticPinIcon: React.ReactNode;
    pinSize: Size2D;
    /** Internal handler for passing move event to parent */
    onParentMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => boolean;
    onPress?: (evt: GestureResponderEvent) => void;
    onLongPress?: (evt: GestureResponderEvent) => void;
    setPinSize: (size: Size2D) => void;
    pinProps?: ViewProps;
}) => JSX.Element;
