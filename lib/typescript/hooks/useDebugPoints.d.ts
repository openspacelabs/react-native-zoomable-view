/// <reference types="react" />
import { GestureTouchEvent } from 'react-native-gesture-handler';
import { Vec2D } from '../typings';
export declare const useDebugPoints: () => {
    debugPoints: Vec2D[];
    setDebugPoints: import("react").Dispatch<import("react").SetStateAction<Vec2D[]>>;
    setPinchDebugPoints: (e: GestureTouchEvent, zoomCenter: Vec2D, ...points: Vec2D[]) => void;
};
//# sourceMappingURL=useDebugPoints.d.ts.map