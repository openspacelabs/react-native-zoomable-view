# @openspacelabs/react-native-zoomable-view

A view component for react-native with pinch to zoom, tap to move and double tap to zoom capability.
You can zoom everything, from normal images, text and more complex nested views.

This library is a fork of https://www.npmjs.com/package/@dudigital/react-native-zoomable-view.

This is the v3 rewrite of this package, with `react-native-reanimated` and `react-native-gesture-handler`. It is still a work in progress at the time of writing.

## Still to do

- Lifting one finger from a pinch gesture should pan

## Preview

https://user-images.githubusercontent.com/42827/151675363-3c901a36-88c7-4372-bcd5-e2499dd5fb40.mov

## Getting started

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Props](#props)
- [Methods](#methods)
- [Pan Responder Hooks](#pan-responder-hooks)
- [Example](#example)

### Installation

1. `yarn add @openspacelabs/react-native-zoomable-view`

2. Important: set up `react-native-reanimated` v2 which includes native modules. Installation instructions are available here:

https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/installation

### Example

An example `expo` project is also included in the `example` directory.

The example project includes resolution-independent markers as an example of how to use the `scaleValue` prop. This value works similarly to a callback, updating when the component's contents are scaled.

```JSX
import * as React from 'react';

import { StyleSheet, View, Text, Image } from 'react-native';
import ReactNativeZoomableView from '@openspacelabs/react-native-zoomable-view';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>ReactNativeZoomableView</Text>
      <View style={{ borderWidth: 5, flexShrink: 1, height: 500, width: 310 }}>
        <ReactNativeZoomableView maxZoom={30}>
          <Image
            style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
            source={{ uri: 'https://picsum.photos/200/300' }}
          />
        </ReactNativeZoomableView>
      </View>
    </View>
  );
}
```

### Props

These options can be used to limit and change the zoom behavior.

| name        | type                | description                                                                            | default   |
| ----------- | ------------------- | -------------------------------------------------------------------------------------- | --------- |
| zoomEnabled | boolean             | Can be used to enable or disable the zooming dynamically                               | true      |
| initialZoom | number              | Initial zoom level on startup                                                          | 1.0       |
| maxZoom     | number              | Maximum possible zoom level (zoom in). Can be set to `null` to allow unlimited zooming | 1.5       |
| minZoom     | number              | Minimum possible zoom level (zoom out)                                                 | 0.5       |
| scaleValue  | SharedValue<number> | A shared value that can be used to scale child components                              | undefined |

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
