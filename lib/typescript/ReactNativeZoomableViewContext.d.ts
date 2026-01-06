/// <reference types="react" />
import { DerivedValue, SharedValue } from 'react-native-reanimated';
export declare const ReactNativeZoomableViewContext: import("react").Context<{
    zoom: SharedValue<number>;
    inverseZoom: DerivedValue<number>;
    inverseZoomStyle: {
        transform: {
            scale: number;
        }[];
    };
    offsetX: SharedValue<number>;
    offsetY: SharedValue<number>;
} | null>;
export declare const useZoomableViewContext: () => {
    zoom: SharedValue<number>;
    inverseZoom: DerivedValue<number>;
    inverseZoomStyle: {
        transform: {
            scale: number;
        }[];
    };
    offsetX: SharedValue<number>;
    offsetY: SharedValue<number>;
};
//# sourceMappingURL=ReactNativeZoomableViewContext.d.ts.map