/// <reference types="react" />
import { GestureResponderEvent } from 'react-native';
import { Vec2D } from '../typings';
export declare const useDebugPoints: ({ originalPageX, originalPageY, }: {
    originalPageX: number;
    originalPageY: number;
}) => {
    debugPoints: Vec2D[];
    setDebugPoints: import("react").Dispatch<import("react").SetStateAction<Vec2D[]>>;
    setPinchDebugPoints: (gestureResponderEvent: GestureResponderEvent, zoomCenter: Vec2D, ...points: Vec2D[]) => void;
};
//# sourceMappingURL=useDebugPoints.d.ts.map