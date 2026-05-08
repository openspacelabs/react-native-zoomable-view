import {
  FixedSize,
  ReactNativeZoomableView,
  ReactNativeZoomableViewRef,
  useZoomableViewContext,
  useZoomableViewParentGestureRef,
  useZoomableViewPauseCanvas,
} from '@openspacelabs/react-native-zoomable-view';
import { debounce } from 'lodash';
import React, { ReactNode, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Image,
  Modal,
  Text,
  View,
  ViewProps,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';
import { runOnJS } from 'react-native-worklets';

import { applyContainResizeMode } from '../src/helper/coordinateConversion';
import { styles } from './style';

const kittenSize = 800;
const uri = `https://placekitten.com/${kittenSize}/${kittenSize}`;
const imageSize = { width: kittenSize, height: kittenSize };

const stringifyPoint = (point?: { x: number; y: number }) =>
  point ? `${Math.round(point.x)}, ${Math.round(point.y)}` : 'Off map';

const onPinLongPressJS = () => {
  Alert.alert('Pin long-press fired');
};

/**
 * Demo pin: red main button (LongPress claims this region) and a blue knob
 * hanging on a rail (Pan claims this region). Empty bounding-box space falls
 * through to the parent ReactNativeZoomableView's pan/pinch.
 *
 * Both gestures use `.blocksExternalGesture(parentGestureRef)` so the parent
 * FAILs while the child is active — without that, RNGH's two
 * `GestureDetector`s run independently and both write their state, which is
 * what causes "the canvas pans a little when I begin to drag the knob."
 *
 * Must be rendered INSIDE `<ReactNativeZoomableView>` so
 * `useZoomableViewParentGestureRef()` reaches the provider.
 */
const DemoPin = ({
  knobPanCount,
  knobBeginCount,
  knobTouchDownCount,
  parentShiftLabel,
}: {
  knobPanCount: SharedValue<number>;
  knobBeginCount: SharedValue<number>;
  knobTouchDownCount: SharedValue<number>;
  parentShiftLabel: SharedValue<string>;
}) => {
  const parentGestureRef = useZoomableViewParentGestureRef();
  const pauseCanvas = useZoomableViewPauseCanvas();
  const ctx = useZoomableViewContext();
  // Mirror parentShiftCount from the lib context up to the App's text below
  // the canvas (the parent's `_handleShifting` increments it).
  useDerivedValue(() => {
    parentShiftLabel.value = `parent attempts:${ctx.parentShiftAttemptCount.value} writes:${ctx.parentShiftCount.value}`;
  });

  const knobOffset = useSharedValue<{ x: number; y: number }>({ x: 0, y: 0 });

  const pinLongPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(400)
        // The lib's parentGestureRef is typed against the lib's RNGH copy;
        // the example consumes it via its own RNGH copy. `metro.config.js`
        // points both at the same install at runtime, so the cast is safe.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        .blocksExternalGesture(parentGestureRef as any)
        .onStart(() => {
          'worklet';
          runOnJS(onPinLongPressJS)();
        }),
    [parentGestureRef]
  );

  const knobPan = useMemo(
    () =>
      Gesture.Pan()
        // Generous hit slop so the small knob is easier to grab — RNGH does
        // not inflate the touch target by default.
        .hitSlop({ top: 16, bottom: 16, left: 16, right: 16 })
        // Make the parent FAIL when this Pan activates, so the canvas does
        // not pan while the knob is being dragged.
        // The lib's parentGestureRef is typed against the lib's RNGH copy;
        // the example consumes it via its own RNGH copy. `metro.config.js`
        // points both at the same install at runtime, so the cast is safe.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        .blocksExternalGesture(parentGestureRef as any)
        // Pause the parent's canvas pan from the very first touch — runs
        // on the UI thread before the parent's next `_handleShifting`
        // worklet, so the canvas never drifts while the child is still in
        // BEGAN waiting to cross its native activation threshold.
        .onTouchesDown(() => {
          'worklet';
          knobTouchDownCount.value = knobTouchDownCount.value + 1;
          pauseCanvas.value = true;
        })
        .onBegin(() => {
          'worklet';
          knobBeginCount.value = knobBeginCount.value + 1;
          pauseCanvas.value = true;
        })
        .onStart(() => {
          'worklet';
          knobPanCount.value = knobPanCount.value + 1;
        })
        .onUpdate((e) => {
          'worklet';
          knobOffset.value = { x: e.translationX, y: e.translationY };
        })
        .onEnd(() => {
          'worklet';
          knobOffset.value = { x: 0, y: 0 };
        })
        .onFinalize(() => {
          'worklet';
          pauseCanvas.value = false;
        }),
    [
      knobOffset,
      knobPanCount,
      knobBeginCount,
      knobTouchDownCount,
      parentGestureRef,
      pauseCanvas,
    ]
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: knobOffset.value.x },
      { translateY: knobOffset.value.y },
    ],
  }));

  // Pin bounding box is 280x100. StaticPin anchors the bottom-center on
  // `staticPinPosition`, so the red pin's tip ends on the requested map
  // point. The knob hangs left, both bottom-aligned.
  //
  // Layout (in box coords):
  //   • knob      left=0    top=0    100x100 → centre (50, 50)
  //   • red pin   left=116  top=52    48x48  → centre (140, 76), tip y=100
  //   • rail      left=100  top=75   16x2    → at red-pin centre y, joins
  //                                            knob right edge to pin left
  return (
    <View
      pointerEvents="box-none"
      style={{
        height: 100,
        width: 280,
      }}
    >
      {/* Rail (decorative) */}
      <View
        pointerEvents="none"
        style={{
          backgroundColor: 'rgba(0,0,0,0.4)',
          height: 2,
          left: 100,
          position: 'absolute',
          top: 75,
          width: 16,
        }}
      />

      {/* Main pin — LongPress claims this region */}
      <GestureDetector gesture={pinLongPress}>
        <View
          style={{
            height: 48,
            left: 116,
            position: 'absolute',
            top: 52,
            width: 48,
          }}
        >
          <View
            style={{
              backgroundColor: 'red',
              borderColor: 'white',
              borderRadius: 24,
              borderWidth: 2,
              height: 48,
              width: 48,
            }}
          />
        </View>
      </GestureDetector>

      {/* Knob — Pan claims this region */}
      <GestureDetector gesture={knobPan}>
        <Animated.View
          style={[
            {
              height: 100,
              left: 0,
              position: 'absolute',
              top: 0,
              width: 100,
            },
            knobStyle,
          ]}
        >
          <View
            style={{
              backgroundColor: 'blue',
              borderColor: 'white',
              borderRadius: 50,
              borderWidth: 2,
              height: 100,
              width: 100,
            }}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const PageSheetModal = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewProps['style'];
}) => {
  return (
    <Modal animationType="slide" presentationStyle="pageSheet">
      <View style={style}>{children}</View>
    </Modal>
  );
};

export default function App() {
  const ref = useRef<ReactNativeZoomableViewRef>(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [modal, setModal] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Use layout event to get centre point, to set the pin
  const [pin, setPin] = useState({ x: 0, y: 0 });

  // Debounce the change event to avoid layout event firing too often while
  // dragging. `useMemo` caches the debounce instance across renders so its
  // internal timer state actually batches calls — the previous
  // `useCallback(() => debounce(...), [])()` invoked the memoized factory
  // on every render, producing a fresh debounce each time and defeating
  // the debouncing entirely. `setPin` is a stable `useState` setter, so the
  // deps array effectively never re-creates the instance.
  const debouncedUpdatePin = useMemo(() => debounce(setPin, 10), [setPin]);

  // The move event fires every frame the pin position can change. Mirror it
  // into a SharedValue and let ReText (via `useAnimatedProps` on a wrapped
  // TextInput) write to the native view directly on the UI thread, without
  // ever touching JS state or the React tree.
  const movePinShared = useSharedValue<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const movePinText = useDerivedValue(() => {
    const p = movePinShared.value;
    return `onStaticPinPositionMove: ${Math.round(p.x)}, ${Math.round(p.y)}`;
  });

  const staticPinPosition = { x: size.width / 2, y: size.height / 2 };
  const { size: contentSize } = applyContainResizeMode(imageSize, size);

  const Wrapper = modal ? PageSheetModal : View;

  // SharedValues that need to drive UI text outside the zoom subject must be
  // hoisted above the provider — `<DemoPin>` lives INSIDE
  // `ReactNativeZoomableView` so it sees the parent-gesture context, but the
  // counter text below the canvas does not.
  const knobPanCount = useSharedValue(0);
  const knobBeginCount = useSharedValue(0);
  const knobTouchDownCount = useSharedValue(0);
  const knobLabel = useDerivedValue(
    () =>
      `knob touchDown:${knobTouchDownCount.value} begin:${knobBeginCount.value} start:${knobPanCount.value}`
  );
  const parentShiftLabel = useSharedValue('parent shifts: 0');

  // `GestureHandlerRootView` lives INSIDE `Wrapper` so it covers both the
  // non-modal and `Modal` (`presentationStyle="pageSheet"`) paths. `Modal`
  // renders in a separate native window, so an outer root view above
  // `Wrapper` would not reach the modal's content tree — RNGH gestures
  // inside the modal would silently no-op. This is also the canonical
  // root-wrapper pattern documented in the README; the library no longer
  // self-wraps (see #49).
  return (
    <Wrapper style={styles.container}>
      <GestureHandlerRootView style={styles.container}>
        <Text>ReactNativeZoomableView</Text>
        <View
          style={styles.box}
          onLayout={(e) => {
            setSize(e.nativeEvent.layout);
          }}
        >
          <ReactNativeZoomableView
            ref={ref}
            debug
            onLongPress={() => {
              Alert.alert('Long press detected');
            }}
            // Where to put the pin in the content view
            staticPinPosition={staticPinPosition}
            staticPinIcon={
              <DemoPin
                knobPanCount={knobPanCount}
                knobBeginCount={knobBeginCount}
                knobTouchDownCount={knobTouchDownCount}
                parentShiftLabel={parentShiftLabel}
              />
            }
            // Callback that returns the position of the pin
            // on the actual source image
            onStaticPinPositionChange={debouncedUpdatePin}
            onStaticPinPositionMoveWorklet={(position) => {
              'worklet';
              movePinShared.value = position;
            }}
            maxZoom={30}
            // Give these to the zoomable view so it can apply the boundaries around the actual content.
            // Need to make sure the content is actually centered and the width and height are
            // measured when it's rendered naturally. Not the intrinsic sizes.
            contentWidth={contentSize?.width ?? 0}
            contentHeight={contentSize?.height ?? 0}
          >
            <View style={styles.contents}>
              <Image style={styles.img} source={{ uri }} />

              {showMarkers &&
                [20, 40, 60, 80].map((left) =>
                  [20, 40, 60, 80].map((top) => (
                    <FixedSize left={left} top={top} key={`${left}x${top}`}>
                      <View style={styles.marker} />
                    </FixedSize>
                  ))
                )}
            </View>
          </ReactNativeZoomableView>
        </View>
        <Text>onStaticPinPositionChange: {stringifyPoint(pin)}</Text>
        <ReText text={movePinText} style={{ color: 'black' }} />
        <ReText text={knobLabel} style={{ color: 'black' }} />
        <ReText text={parentShiftLabel} style={{ color: 'black' }} />
        <Button
          title={`${showMarkers ? 'Hide' : 'Show'} markers`}
          onPress={() => {
            setShowMarkers((value) => !value);
          }}
        />

        <Button
          // Toggle modal to test if zoomable view works correctly in modal,
          // where pull-down-to-close gesture can interfere with pan gestures.
          title={`Toggle Modal Mode`}
          onPress={() => {
            setModal((value) => !value);
          }}
        />
      </GestureHandlerRootView>
    </Wrapper>
  );
}
