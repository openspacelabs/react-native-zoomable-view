import { ForwardRefRenderFunction } from 'react';
import { ReactNativeZoomableViewProps, Vec2D } from './typings';
type ReactNativeZoomableView = {
    moveTo(newOffsetX: number, newOffsetY: number): void;
    moveBy(offsetChangeX: number, offsetChangeY: number): void;
    zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean;
    zoomBy(zoomLevelChange: number): boolean;
    moveStaticPinTo: (position: Vec2D, duration?: number) => void;
    readonly gestureStarted: boolean;
};
declare const ReactNativeZoomableView: ForwardRefRenderFunction<ReactNativeZoomableView, ReactNativeZoomableViewProps>;
export default ReactNativeZoomableView;
export { ReactNativeZoomableView };
//# sourceMappingURL=ReactNativeZoomableView.d.ts.map