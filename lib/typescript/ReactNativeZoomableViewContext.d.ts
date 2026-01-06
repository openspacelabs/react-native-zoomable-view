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
} | undefined>;
//# sourceMappingURL=ReactNativeZoomableViewContext.d.ts.map