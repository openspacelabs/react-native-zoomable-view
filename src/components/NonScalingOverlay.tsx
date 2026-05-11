import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

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
  /** Optional rotation in radians (Reanimated SharedValue). When omitted,
   *  rotation defaults to 0; the same 5-element transform list is used
   *  either way. */
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
  // A constant-zero `SharedValue` used when no rotation prop is provided,
  // so the worklet always reads from a `SharedValue<number>` and the
  // transform list shape is identical in both cases. Hook order is fixed
  // by always calling `useSharedValue` here.
  const zeroRotation = useSharedValue(0);
  const rotationValue = rotation ?? zeroRotation;

  const overlayStyle = useAnimatedStyle(() => {
    const z = zoom.value;
    const ox = offsetX.value;
    const oy = offsetY.value;
    const r = rotationValue.value;

    return {
      position: 'absolute',
      // Box grows with zoom so a child at `left:50%, top:50%` (content-
      // percentage space) lands at the right screen pixel without any
      // per-child inverse-scale; the translates below align the grown box
      // with the wrapper's transformed content layer.
      width: contentWidth * z,
      height: contentHeight * z,
      // RN composes transforms RIGHT-to-LEFT as matrix multiplications.
      //   1) The two leading translates re-center the (z-scaled) overlay
      //      box on the wrapper midpoint, so the subsequent `rotate`
      //      pivots around the overlay's geometric center (matching the
      //      inner zoom layer's rotation pivot).
      //   2) `rotate` then rotates the centered frame.
      //   3) The trailing `z*ox` / `z*oy` translates appear AFTER the
      //      rotate in source order but apply BEFORE it under
      //      right-to-left composition — so pan is applied in the
      //      rotated frame, which keeps the overlay aligned with the
      //      rotated content underneath. Folding `z*ox` into the first
      //      translate would apply pan in the pre-rotation frame and
      //      desync from the inner layer.
      // The same 5-element list is used whether rotation is supplied or
      // not (rotation defaults to 0); the no-rotation case is just the
      // matrix product with `rotate(0) = I`, which collapses to the
      // 2-translate form mathematically without forking the code path.
      transform: [
        { translateX: wrapperWidth / 2 - (z * contentWidth) / 2 },
        { translateY: wrapperHeight / 2 - (z * contentHeight) / 2 },
        { rotate: `${r}rad` },
        { translateX: z * ox },
        { translateY: z * oy },
      ],
    };
  }, [contentWidth, contentHeight, wrapperWidth, wrapperHeight]);

  // The translate math (`wrapperW/2 - z*contentW/2 + z*ox`) requires real
  // dimensions; with 0s it resolves to 0 and paints the overlay at the
  // wrong location for one frame before measurements arrive.
  if (!contentWidth || !contentHeight) return null;

  return (
    <Animated.View
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      style={[overlayStyle, styles.overlay]}
      pointerEvents="none"
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    // Anchor the overlay at the wrapper's top-left. Without explicit
    // top/left, Yoga in RN positions `position: 'absolute'` children
    // using the parent's `alignItems` / `justifyContent` whenever the
    // child has a measurable size — and the lib's wrapper uses
    // `'center'` for both axes. Yoga would center the (animated)
    // contentW × contentH overlay inside the wrapper BEFORE the
    // `useAnimatedStyle` `transform` translated it, producing a doubled
    // offset (≈ +125pt vertical on iPhone 12 Pro). Forcing top: 0 /
    // left: 0 overrides the parent's alignment so the transform's
    // translates are the SOLE source of position.
    left: 0,
    // Markers anchored to content edges typically apply negative
    // margins (`marginLeft: -size/2, marginTop: -size/2`) to self-
    // center on the anchor point — they extend past the overlay's
    // bounding box. iOS defaults to clipping subviews to their parent's
    // bounds, so without `visible` here those edge markers disappear at
    // high zoom levels.
    overflow: 'visible',
    top: 0,
  },
});
