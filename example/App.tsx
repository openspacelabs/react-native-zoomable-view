import {
  ReactNativeZoomableView,
  ReactNativeZoomableViewRef,
} from '@openspacelabs/react-native-zoomable-view';
import { debounce } from 'lodash';
import React, { ReactNode, useCallback, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Image,
  Modal,
  Text,
  View,
  ViewProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { applyContainResizeMode } from '../src/helper/coordinateConversion';
import { styles } from './style';

const kittenSize = 800;
const uri = `https://placekitten.com/${kittenSize}/${kittenSize}`;
const imageSize = { width: kittenSize, height: kittenSize };

const stringifyPoint = (point?: { x: number; y: number }) =>
  point ? `${Math.round(point.x)}, ${Math.round(point.y)}` : 'Off map';

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
  const scale = useSharedValue(1);
  const [showMarkers, setShowMarkers] = useState(true);
  const [modal, setModal] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Use layout event to get centre point, to set the pin
  const [pin, setPin] = useState({ x: 0, y: 0 });
  const [movePin, setMovePin] = useState({ x: 0, y: 0 });

  // Debounce the change event to avoid layout event firing too often while dragging
  const debouncedUpdatePin = useCallback(() => debounce(setPin, 10), [])();
  const debouncedUpdateMovePin = useCallback(
    () => debounce(setMovePin, 10),
    []
  )();

  const staticPinPosition = { x: size.width / 2, y: size.height / 2 };
  const { size: contentSize } = applyContainResizeMode(imageSize, size);

  const markerScaleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const Wrapper = modal ? PageSheetModal : View;

  return (
    <Wrapper style={styles.container}>
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
          // Callback that returns the position of the pin
          // on the actual source image
          onStaticPinPositionChange={debouncedUpdatePin}
          onStaticPinPositionMoveWorklet={(position) => {
            'worklet';
            scheduleOnRN(debouncedUpdateMovePin, position);
          }}
          onTransformWorklet={({ zoomLevel }) => {
            'worklet';
            scale.value = 1 / zoomLevel;
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
              (['20%', '40%', '60%', '80%'] as const).map((left) =>
                (['20%', '40%', '60%', '80%'] as const).map((top) => (
                  <Animated.View
                    key={`${left}x${top}`}
                    // These markers will move and zoom with the image, but will retain their size
                    // because of the scale transformation.
                    style={[styles.marker, { left, top }, markerScaleStyle]}
                  />
                ))
              )}
          </View>
        </ReactNativeZoomableView>
      </View>
      <Text>onStaticPinPositionChange: {stringifyPoint(pin)}</Text>
      <Text>onStaticPinPositionMove: {stringifyPoint(movePin)}</Text>
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
    </Wrapper>
  );
}
