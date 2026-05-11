import {
  ReactNativeZoomableView,
  ReactNativeZoomableViewRef,
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
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';

import { styles } from './style';

const kittenSize = 800;
// `placekitten.com` has been offline for an extended period. Lorem Picsum
// is the reliable drop-in (CDN-backed via Cloudflare, accepts the same
// `/<W>/<H>` URL shape). Loses the cat theme — placecats.com is the
// cat-themed alternative — but Picsum's reliability matters more for an
// example app that needs to actually render the image on every fresh
// install.
const uri = `https://picsum.photos/${kittenSize}/${kittenSize}`;

const stringifyPoint = (point?: { x: number; y: number }) =>
  point ? `${Math.round(point.x)}, ${Math.round(point.y)}` : 'Off map';

const onPinLongPressJS = () => {
  Alert.alert('Pin long-press fired');
};

/**
 * Red main button claims `LongPress`, blue knob claims `Pan`. Empty pin
 * space passes through to the canvas — no gesture composition needed.
 */
const DemoPin = () => {
  const knobOffset = useSharedValue<{ x: number; y: number }>({ x: 0, y: 0 });

  const pinLongPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(400)
        .onStart(() => {
          'worklet';
          runOnJS(onPinLongPressJS)();
        }),
    []
  );

  const knobPan = useMemo(
    () =>
      Gesture.Pan()
        // Generous hit slop so the small knob is easier to grab — RNGH does
        // not inflate the touch target by default.
        .hitSlop({ top: 16, bottom: 16, left: 16, right: 16 })
        .onUpdate((e) => {
          'worklet';
          knobOffset.value = { x: e.translationX, y: e.translationY };
        })
        .onEnd(() => {
          'worklet';
          knobOffset.value = { x: 0, y: 0 };
        }),
    [knobOffset]
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: knobOffset.value.x },
      { translateY: knobOffset.value.y },
    ],
  }));

  // 280x100 box, anchored bottom-center on staticPinPosition.
  // knob 100x100 @ (0,0)  ·  red 48x48 @ (116,52)  ·  rail @ (100,75) 16x2
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

  // Capture the source dims via `onLoad` so the contents View can be
  // sized to match the image's aspect ratio. With matching aspect, RN's
  // resizeMode 'contain' produces zero letterbox — the rendered-pixel
  // frame equals the element frame — and the contents View's onLayout
  // gives `NonScalingOverlay` the exact `contentWidth`/`contentHeight`
  // it needs (no separate `applyContainResizeMode` step).
  const [imageSourceSize, setImageSourceSize] = useState<{
    width: number;
    height: number;
  }>({ width: kittenSize, height: kittenSize });
  const sourceAspect = imageSourceSize.width / imageSourceSize.height;
  const [contentSize, setContentSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  const Wrapper = modal ? PageSheetModal : View;

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
            staticPinIcon={<DemoPin />}
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
            contentWidth={contentSize.width}
            contentHeight={contentSize.height}
            renderOverlay={
              showMarkers
                ? () => {
                    // Wrapper ≈ box minus its 5pt border each side. The
                    // lib doesn't expose its `wrapperSize` directly, but
                    // `box.width/height - 10` reproduces it on this
                    // example. Used only for the debug HUD.
                    const wrapperApproxW = Math.max(0, size.width - 10);
                    const wrapperApproxH = Math.max(0, size.height - 10);
                    return (
                      <>
                        {/* DEBUG: visualize the overlay's bounding box.
                            Sized 100% × 100% of the overlay so it tracks
                            contentSize × zoom and reveals where the
                            translate-only overlay is actually painting on
                            screen. Example-only — remove for production. */}
                        <View style={styles.overlayDebugBox} />
                        {/* DEBUG HUD pinned to overlay's top-left so it
                            tracks the overlay's transform and provides
                            the live numbers used by the translate math
                            (translateX/Y at z=1, ox=oy=0). */}
                        <Text style={styles.overlayDebugHud}>
                          NSOL wW≈{Math.round(wrapperApproxW)} wH≈
                          {Math.round(wrapperApproxH)} cW=
                          {Math.round(contentSize.width)} cH=
                          {Math.round(contentSize.height)} tXjs=
                          {Math.round(
                            wrapperApproxW / 2 - contentSize.width / 2
                          )}{' '}
                          tYjs=
                          {Math.round(
                            wrapperApproxH / 2 - contentSize.height / 2
                          )}
                        </Text>
                        {[20, 40, 60, 80].map((left) =>
                          [20, 40, 60, 80].map((top) => (
                            <View
                              key={`${left}x${top}`}
                              style={[
                                styles.marker,
                                {
                                  left: `${left}%`,
                                  top: `${top}%`,
                                },
                              ]}
                            />
                          ))
                        )}
                      </>
                    );
                  }
                : undefined
            }
          >
            <View
              // `aspectRatio` constrains the contents View to the
              // source's aspect, so resizeMode:contain produces zero
              // letterbox — the element frame == the rendered-pixel
              // frame. Combined with `maxWidth/maxHeight: '100%'` and
              // `alignSelf: 'center'`, the element fits within the
              // wrapper on whichever axis is binding (width on a tall
              // wrapper, height on a wide wrapper) without overflow.
              // `onLayout` then gives `NonScalingOverlay` the exact
              // contentSize directly — no extra contain math required.
              style={[styles.contents, { aspectRatio: sourceAspect }]}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setContentSize((prev) =>
                  prev.width === width && prev.height === height
                    ? prev
                    : { width, height }
                );
              }}
            >
              <Image
                style={styles.img}
                source={{ uri }}
                onLoad={(e) => {
                  const src = e.nativeEvent.source;
                  setImageSourceSize((prev) =>
                    prev.width === src.width && prev.height === src.height
                      ? prev
                      : { width: src.width, height: src.height }
                  );
                }}
              />
            </View>
          </ReactNativeZoomableView>
        </View>
        <Text>
          DBG contentSize: {Math.round(contentSize.width)}×
          {Math.round(contentSize.height)} box: {Math.round(size.width)}×
          {Math.round(size.height)}
        </Text>
        <Text>onStaticPinPositionChange: {stringifyPoint(pin)}</Text>
        <ReText text={movePinText} style={{ color: 'black' }} />
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
