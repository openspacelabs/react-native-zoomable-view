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
    const z = zoom.value;
    const ox = offsetX.value;
    const oy = offsetY.value;

    return {
      position: 'absolute',
      // Box grows with zoom so a child at `left:50%, top:50%` (content-
      // percentage space) lands at the right screen pixel without any
      // per-child inverse-scale; the translates below align the grown box
      // with the wrapper's transformed content layer.
      width: contentWidth * z,
      height: contentHeight * z,
      transform: rotation
        ? [
            // The 5-element form is REQUIRED when rotation can be non-zero
            // and cannot be collapsed to the 2-translate form. RN applies
            // transforms right-to-left as matrix multiplications:
            //   1) The two leading translates re-center the (z-scaled)
            //      overlay box on the wrapper midpoint, so the subsequent
            //      `rotate` pivots around the overlay's geometric center
            //      (matching the inner zoom layer's rotation pivot).
            //   2) `rotate` then rotates the now-centered frame.
            //   3) The trailing `z*ox` / `z*oy` translates run AFTER the
            //      rotate in source order but BEFORE it under right-to-left
            //      composition — applying pan in the rotated frame, which
            //      is what keeps the overlay aligned with the rotated
            //      content underneath. Folding `z*ox` into the first
            //      translate would apply pan in the pre-rotation frame and
            //      desync from the inner layer.
            { translateX: wrapperWidth / 2 - (z * contentWidth) / 2 },
            { translateY: wrapperHeight / 2 - (z * contentHeight) / 2 },
            { rotate: `${rotation.value}rad` },
            { translateX: z * ox },
            { translateY: z * oy },
          ]
        : [
            // Same math as above with rotation=0 collapsed into a single
            // translate per axis: re-center the z-scaled box, then add the
            // pan offset (scaled by z, because pan is content-space units).
            { translateX: wrapperWidth / 2 - (z * contentWidth) / 2 + z * ox },
            {
              translateY: wrapperHeight / 2 - (z * contentHeight) / 2 + z * oy,
            },
          ],
    };
  }, [contentWidth, contentHeight, wrapperWidth, wrapperHeight]);

  // Fake context with zoom=1 / offsets=0 / inverseZoom=1 so any consumer of
  // `useZoomableViewContext` rendered INSIDE the overlay (e.g. `FixedSize`)
  // becomes a no-op. Without this, `FixedSize` would apply its
  // `inverseZoomStyle` (`scale: 1/zoom`) on top of the translate-only model
  // here, double-counteracting zoom and shrinking children toward 0 at high
  // zoom levels.
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
