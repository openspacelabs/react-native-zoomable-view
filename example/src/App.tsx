import * as React from 'react';

import { StyleSheet, View, Image, Button } from 'react-native';
import ReactNativeZoomableView, {
  useSharedValue,
} from '@openspacelabs/react-native-zoomable-view';
import { Markers } from './Markers';

const uri = 'https://picsum.photos/id/1018/1536/2048';

export default function App() {
  const scale = useSharedValue(1);
  const [showMarkers, setShowMarkers] = React.useState(true);

  return (
    <View style={styles.container}>
      <View style={styles.box}>
        <ReactNativeZoomableView
          initialZoom={1}
          minZoom={0.1}
          maxZoom={15}
          scaleValue={scale}
        >
          <Image style={styles.img} source={{ uri }} />
          {showMarkers && <Markers scale={scale} />}
        </ReactNativeZoomableView>
      </View>

      <Button
        title="Toggle markers"
        onPress={() => setShowMarkers((value) => !value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    // padding: 20,
  },
  box: {
    borderWidth: 0.5,
    borderRadius: 5,
    overflow: 'hidden',
    height: '60%',
    width: '80%',
  },
  img: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
});
