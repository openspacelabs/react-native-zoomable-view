import React from 'react';
import { Animated } from 'react-native';
import { Size2D } from 'src/typings';
export declare const StaticPin: ({ staticPinPosition, pinAnim, staticPinIcon, pinSize, setPinSize, }: {
    staticPinPosition: {
        x: number;
        y: number;
    };
    pinAnim: Animated.ValueXY;
    staticPinIcon: React.ReactNode;
    pinSize: Size2D;
    setPinSize: (size: Size2D) => void;
}) => JSX.Element;
