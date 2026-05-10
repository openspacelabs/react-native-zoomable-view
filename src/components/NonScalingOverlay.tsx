import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { ReactNativeZoomableViewProvider } from '../ReactNativeZoomableViewContext';

export type NonScalingOverlayProps = {
  children: React.ReactNode;
  /** Intrinsic content width in points (the same value passed to
   *  `ReactNativeZoomableView`'s `contentWidth` prop). */
  contentWidth: number;
  /** Intrinsic content height in points. */
  contentHeight: number;
  /** Wrapper (outer container) width in points, from `onLayout`. */
  wrapperWidth: number;
  /** Wrapper (outer container) height in points, from `onLayout`. */
  wrapperHeight: number;
  /** Current zoom level (Reanimated SharedValue, driven by the gesture). */
  zoom: SharedValue<number>;
  /** Current pan offset X (Reanimated SharedValue, driven by the gesture). */
  offsetX: SharedValue<number>;
  /** Current pan offset Y (Reanimated SharedValue). */
  offsetY: SharedValue<number>;
  /** Optional rotation in radians (Reanimated SharedValue). When provided, the
   *  overlay's transform list pivots around the overlay center and pan is
   *  applied in the rotated frame. */
  rotation?: SharedValue<number>;
};

/**
 * Translate-only overlay that tracks the zoomable view's pan/zoom (and
 * optional rotation) but does NOT scale its children. Children render at
 * 1:1 screen size at every zoom level — no inverse-scale transform applied
 * to them, which avoids the CALayer.contentsScale pixelation and the
 * transform-origin clumping that the inverse-scale model exhibits.
 *
 * Children pattern:
 *  - Position with `left: '<X>%' / top: '<Y>%'` in content-percentage space.
 *  - Use a fixed pt size (e.g. `width: 16, height: 16`).
 *  - Self-center on the anchor via `marginLeft: -size/2, marginTop: -size/2`.
 *  - If rotation may be active, attach a per-child counter-rotation style
 *    `useAnimatedStyle({ transform: [{ rotate: `${-rotation.value}rad` }] })`.
 */
export const NonScalingOverlay = ({
  children,
  contentWidth,
  contentHeight,
  wrapperWidth,
  wrapperHeight,
  zoom,
  offsetX,
  offsetY,
  rotation,
}: NonScalingOverlayProps) => {
  const overlayStyle = useAnimatedStyle(() => {
    const currentZoom = zoom.value;
    const currentOffsetX = offsetX.value;
    const currentOffsetY = offsetY.value;
    const currentRotation = rotation ? rotation.value : 0;

    // Transform composes right-to-left: re-center the z-scaled box on
    // the wrapper midpoint, rotate around that center, then translate
    // by the pan IN THE ROTATED FRAME (post-rotate). Folding pan into
    // the centering translate would apply it pre-rotation and desync
    // from the rotated content underneath. When rotation is absent,
    // currentRotation=0 collapses the rotate to identity and the
    // 5-element list reduces to a single combined translate per axis.
    return {
      position: 'absolute',
      width: contentWidth * currentZoom,
      height: contentHeight * currentZoom,
      transform: [
        { translateX: wrapperWidth / 2 - (currentZoom * contentWidth) / 2 },
        { translateY: wrapperHeight / 2 - (currentZoom * contentHeight) / 2 },
        { rotate: `${currentRotation}rad` },
        { translateX: currentZoom * currentOffsetX },
        { translateY: currentZoom * currentOffsetY },
      ],
    };
  }, [contentWidth, contentHeight, wrapperWidth, wrapperHeight]);

  // Fake context with zoom=1 / offsets=0 / inverseZoom=1 so any consumer of
  // `useZoomableViewContext` rendered INSIDE the overlay becomes a no-op.
  // Without this, a nested consumer that applies the outer context's
  // `inverseZoomStyle` (`scale: 1/zoom`) would multiply on top of the
  // translate-only model here, double-counteracting zoom and shrinking
  // children toward 0 at high zoom levels.
  const unitZoom = useSharedValue(1);
  const unitInverseZoom = useDerivedValue(() => 1);
  const unitScale = useSharedValue(1);
  const zeroOffset = useSharedValue(0);
  const fakeContext = useMemo(
    () => ({
      zoom: unitZoom,
      inverseZoom: unitInverseZoom,
      inverseZoomStyle: { transform: [{ scale: unitScale }] },
      offsetX: zeroOffset,
      offsetY: zeroOffset,
    }),
    [unitZoom, unitInverseZoom, unitScale, zeroOffset]
  );

  // The translate math (`wrapperW/2 - z*contentW/2 + z*ox`) requires real
  // dimensions; with 0s it resolves to 0 (no-rotation case) or NaN-adjacent
  // intermediate values, painting the overlay at the wrong location for one
  // frame before measurements arrive.
  if (!contentWidth || !contentHeight) return null;

  return (
    <ReactNativeZoomableViewProvider value={fakeContext}>
      <Animated.View
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        style={[overlayStyle, styles.overlay]}
        pointerEvents="none"
      >
        {children}
      </Animated.View>
    </ReactNativeZoomableViewProvider>
  );
};

const styles = StyleSheet.create({
  overlay: {
    // Markers anchored to content edges typically apply negative margins
    // (`marginLeft: -size/2, marginTop: -size/2`) to self-center on the
    // anchor point — they extend past the overlay's bounding box. iOS
    // defaults to clipping subviews to their parent's bounds, so without
    // `visible` here those edge markers disappear at high zoom levels.
    overflow: 'visible',
  },
});
