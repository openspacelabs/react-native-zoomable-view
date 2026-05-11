import { Dimensions, StyleSheet } from 'react-native';

// Box width must fit the device viewport. A fixed pt width (e.g. 480)
// exceeds smaller screens (iPhone 12 Pro = 390pt), pushing part of the
// rendered image off-screen. The overlay places dots as percentages of
// contentSize (the rendered-image frame); when contentSize is wider
// than the visible screen, dots at 20%/80% of content land at ~14%/86%
// of what the user sees. `width: '100%'` doesn't work here because the
// nested container chain uses `alignItems: 'center'`, which leaves the
// parent's cross-axis intrinsic-sized — '100%' resolves to 0.
// Subtracting 40 leaves a 20pt margin from each screen edge.
const BOX_WIDTH = Dimensions.get('window').width - 40;

export const styles = StyleSheet.create({
  box: {
    borderWidth: 5,
    flexShrink: 1,
    height: 600,
    width: BOX_WIDTH,
  },
  container: {
    alignItems: 'center',
    backgroundColor: 'white',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  contents: {
    // `alignSelf: 'stretch'` anchors the cross-axis (width) to the
    // parent's full width; the `aspectRatio` set inline at render time
    // from the loaded image's source dims then derives the main-axis
    // (height). Together they size the contents View to match the
    // image's aspect exactly — resizeMode:contain produces zero
    // letterbox, so the element frame == the rendered-pixel frame.
    // The parent's `justifyContent: 'center'` centers it vertically.
    // (Suitable when the child fits within the parent's main-axis at
    // parent-width × aspect — true for the picsum square in 340×590.
    // For arbitrary aspects, additionally clamp via
    // `maxHeight: '100%'` and pre-compute the binding axis externally.)
    alignSelf: 'stretch',
  },
  img: {
    height: '100%',
    resizeMode: 'contain',
    width: '100%',
  },
  marker: {
    backgroundColor: 'white',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
    position: 'absolute',
    top: '50%',
    width: 20,
  },
  // Example-only debug visualization for NonScalingOverlay's bounding
  // box. Filling 100% × 100% of the overlay shows where the
  // translate-only layer is actually painting — useful for verifying
  // alignment at every zoom level. Not exported by the library.
  overlayDebugBox: {
    backgroundColor: 'rgba(255,0,0,0.18)',
    borderColor: 'magenta',
    borderWidth: 2,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  // Floating HUD anchored to the overlay's top-left corner — shows the
  // wrapper / content / translate numbers used by NonScalingOverlay's
  // transform math, so visual misalignment can be cross-checked against
  // raw values without leaving the screen.
  overlayDebugHud: {
    backgroundColor: 'yellow',
    color: 'black',
    fontSize: 9,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 280,
  },
});
