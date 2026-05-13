import {
  applyContainResizeMode,
  getImageOriginOnTransformSubject,
  viewportPositionToImagePosition,
} from './helper/coordinateConversion';
// Import the imperative ref handle type from its source module so the named
// re-export below carries both the value (forwardRef'd component) AND the type
// (e.g. `createRef<ReactNativeZoomableView>()`). The default import above only
// carries the value-side of the binding; without this typed re-import the
// named export would be value-only and break typed consumers.
import type { ReactNativeZoomableView as ReactNativeZoomableViewType } from './ReactNativeZoomableView';
import ReactNativeZoomableViewComponent from './ReactNativeZoomableView';
import type {
  ReactNativeZoomableViewProps,
  ZoomableViewEvent,
} from './typings';

const ReactNativeZoomableView = ReactNativeZoomableViewComponent;
type ReactNativeZoomableView = ReactNativeZoomableViewType;

export {
  // Helper functions for coordinate conversion
  applyContainResizeMode,
  getImageOriginOnTransformSubject,
  ReactNativeZoomableView,
  ReactNativeZoomableViewProps,
  viewportPositionToImagePosition,
  ZoomableViewEvent,
};
