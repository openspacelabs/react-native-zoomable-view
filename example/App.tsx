import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Image, Animated, Button } from 'react-native';
// @ts-ignore
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { styles } from './style';
import { debounce } from 'lodash';
import { applyContainResizeMode } from '../src/helper/coordinateConversion';

const kittenSize = 800;
const uri = `https://placekitten.com/${kittenSize}/${kittenSize}`;
const imageSize = { width: kittenSize, height: kittenSize };

const stringifyPoint = (point?: { x: number; y: number }) =>
  point ? `${Math.round(point.x)}, ${Math.round(point.y)}` : 'Off map';

export default function App() {
  const zoomAnimatedValue = useRef(new Animated.Value(1)).current;
  const scale = Animated.divide(1, zoomAnimatedValue);
  const [showMarkers, setShowMarkers] = useState(true);
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

  const staticPinPosition = size
    ? { x: size.width / 2, y: size.height / 2 }
    : undefined;

  const { size: contentSize } = applyContainResizeMode(imageSize, size);

  return (
    <View style={styles.container}>
      <Text>ReactNativeZoomableView</Text>
      <View style={styles.box} onLayout={(e) => setSize(e.nativeEvent.layout)}>
        <ReactNativeZoomableView
          disableMomentum
          // Where to put the pin in the content view
          staticPinPosition={staticPinPosition}
          // Callback that returns the position of the pin
          // on the actual source image
          onStaticPinPositionChange={debouncedUpdatePin}
          onStaticPinPositionMove={debouncedUpdateMovePin}
          maxZoom={30}
          // Give these to the zoomable view so it can apply the boundaries around the actual content.
          // Need to make sure the content is actually centered and the width and height are
          // measured when it's rendered naturally. Not the intrinsic sizes.
          contentWidth={contentSize?.width ?? 0}
          contentHeight={contentSize?.height ?? 0}
          panBoundaryPadding={500}
          zoomAnimatedValue={zoomAnimatedValue}
        >
          <View style={styles.contents}>
            <Image style={styles.img} source={{ uri }} />

            {showMarkers &&
              ['20%', '40%', '60%', '80%'].map((left) =>
                ['20%', '40%', '60%', '80%'].map((top) => (
                  <Animated.View
                    key={`${left}x${top}`}
                    // These markers will move and zoom with the image, but will retain their size
                    // because of the scale transformation.
                    style={[
                      styles.marker,
                      { left, top, transform: [{ scale }] },
                    ]}
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
        onPress={() => setShowMarkers((value) => !value)}
      />
    </View>
  );
}
