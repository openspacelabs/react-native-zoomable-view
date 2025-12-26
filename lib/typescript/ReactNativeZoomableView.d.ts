import React, { ForwardRefRenderFunction } from 'react';
import { SharedValue } from '../node_modules/react-native-reanimated/src/commonTypes';
import { ReactNativeZoomableViewProps, Vec2D } from './typings';
type ReactNativeZoomableView = {
    moveTo(newOffsetX: number, newOffsetY: number): void;
    moveBy(offsetChangeX: number, offsetChangeY: number): void;
    zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean;
    zoomBy(zoomLevelChange: number): boolean;
    moveStaticPinTo: (position: Vec2D, duration?: number) => void;
    readonly gestureStarted: boolean;
};
declare const ReactNativeZoomableViewContext: React.Context<{
    zoom: SharedValue<number>;
    inverseZoomStyle: {
        transform: {
            scale: number;
        }[];
    };
    offsetX: SharedValue<number>;
    offsetY: SharedValue<number>;
} | undefined>;
export declare const Unzoom: ({ left, top, children, }: {
    left: number;
    top: number;
    children: React.ReactNode;
}) => React.JSX.Element;
declare const ReactNativeZoomableView: ForwardRefRenderFunction<ReactNativeZoomableView, ReactNativeZoomableViewProps>;
export default ReactNativeZoomableView;
export { ReactNativeZoomableView, ReactNativeZoomableViewContext };
//# sourceMappingURL=ReactNativeZoomableView.d.ts.map