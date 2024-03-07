# @openspacelabs/react-native-zoomable-view

A view component for react-native with pinch to zoom, tap to move and double tap to zoom capability.
You can zoom everything, from normal images, text and more complex nested views.

This library is a fork of [@dudigital/react-native-zoomable-view](https://www.npmjs.com/package/@dudigital/react-native-zoomable-view).
We've rewritten most of the logic in the original library to address the following items:

- [x] Fixed jittering during zooming and panning
- [x] Fixed incorrect zoom center (happens during pinching and double tapping)
- [x] Fixed incorrect pan boundaries
- [x] Added the ability to zoom and pan at the same time (before you can only perform 1 of these 2 at a time)
- [x] Added “pan momentum”, “zoom to”, and “boundaries-crossed” animations
- [x] Added onSingleTap (besides the existing onDoubleTap)
- [x] Added animated touch feedback when the zoom subject is tapped on
- [x] Added "react-native-builder-bob" as a framework for library management/maintenance
- [x] Better internal code organization and documentation
- [x] Allowed passing in a custom pan and zoom animation values via optional props

## What sets this library apart from the other zoom-pan libraries?

This library offers a much better user experience than the others:

- The ability to zoom and pan at the same time.
- No jittering during zooming.
- Zoom center correctly placed at the pinch center - currently this is the ONLY react-native library that offers this.
- And many other goodies. Check out the documentation below for more details.

## M1 Mac iOS Simulator

Note that if try to run this library on an M1 Mac iOS Simulator, the animations will be quite jittery/jumpy.
Test it on a real physical device or non-M1 Mac to see the actual performance.

## Demo

Want to run the library on your physical device right here right now?
Check out this [Expo Snack](https://snack.expo.dev/@thomasttvo/eaf257)

![](https://thumbs.gfycat.com/NaughtyBlackandwhiteBudgie-size_restricted.gif)

## Getting started

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Props](#props)
- [Methods](#methods)
- [Pan Responder Hooks](#pan-responder-hooks)
- [Example](#example)

### Installation

We are working with the original maintainers of this library to transfer the NPM alias for `react-native-zoomable-view`. In the meantime, you will want to use `@openspacelabs/react-native-zoomable-view` as the package identifier.

To add this package, run

`npm add @openspacelabs/react-native-zoomable-view`

or

`yarn add @openspacelabs/react-native-zoomable-view`

### Basic Usage

This component is based on react-natives View, enhanced by panresponders and other events to make it zoomable.
Therefore no platform specific configuration needs to be done.

Just use it as a drop in component instead of a normal view.

Import ReactNativeZoomableView:

```JSX
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
```

Use the component:

```JSX
<ReactNativeZoomableView
   maxZoom={1.5}
   minZoom={0.5}
   zoomStep={0.5}
   initialZoom={1}
   bindToBorders={true}
   onZoomAfter={this.logOutZoomState}
   style={{
      padding: 10,
      backgroundColor: 'red',
   }}
>
   <Text>This is the content</Text>
</ReactNativeZoomableView>
```

### Example

Here is a full drop in example you can use in Expo, after installing the package.

```JSX
import * as React from 'react';

import { StyleSheet, View, Text, Image } from 'react-native';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>ReactNativeZoomableView</Text>
      <View style={{ borderWidth: 5, flexShrink: 1, height: 500, width: 310 }}>
        <ReactNativeZoomableView
          maxZoom={30}
          // Give these to the zoomable view so it can apply the boundaries around the actual content.
          // Need to make sure the content is actually centered and the width and height are
          // dimensions when it's rendered naturally. Not the intrinsic size.
          // For example, an image with an intrinsic size of 400x200 will be rendered as 300x150 in this case.
          // Therefore, we'll feed the zoomable view the 300x150 size.
          contentWidth={300}
          contentHeight={150}
        >
          <Image
            style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
            source={{ uri: 'https://via.placeholder.com/400x200.png' }}
          />
        </ReactNativeZoomableView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
});
```

### Props

#### Options

These options can be used to limit and change the zoom behavior.

| name                       | type    | description                                                                                                                                                                                                                                                                                                                          | default   |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| zoomEnabled                | boolean | Can be used to enable or disable the zooming dynamically                                                                                                                                                                                                                                                                             | true      |
| panEnabled                 | boolean | Can be used to enable or disable the panning dynamically                                                                                                                                                                                                                                                                             | true      |
| initialZoom                | number  | Initial zoom level on startup                                                                                                                                                                                                                                                                                                        | 1.0       |
| maxZoom                    | number  | Maximum possible zoom level (zoom in). Can be set to `null` to allow unlimited zooming                                                                                                                                                                                                                                               | 1.5       |
| minZoom                    | number  | Minimum possible zoom level (zoom out)                                                                                                                                                                                                                                                                                               | 0.5       |
| disablePanOnInitialZoom    | boolean | If true, panning is disabled when zoom level is equal to the initial zoom level                                                                                                                                                                                                                                                      | false     |
| doubleTapDelay             | number  | How much delay will still be recognized as double press (ms)                                                                                                                                                                                                                                                                         | 300       |
| doubleTapZoomToCenter      | boolean | If true, double tapping will always zoom to center of View instead of the direction it was double tapped in                                                                                                                                                                                                                          |
| bindToBorders              | boolean | If true, it makes sure the object stays within box borders                                                                                                                                                                                                                                                                           | true      |
| zoomStep                   | number  | How much zoom should be applied on double tap                                                                                                                                                                                                                                                                                        | 0.5       |
| pinchToZoomInSensitivity   | number  | the level of resistance (sensitivity) to zoom in (0 - 10) - higher is less sensitive                                                                                                                                                                                                                                                 | 3         |
| pinchToZoomOutSensitivity  | number  | the level of resistance (sensitivity) to zoom out (0 - 10) - higher is less sensitive                                                                                                                                                                                                                                                | 1         |
| movementSensibility        | number  | how resistant should shifting the view around be? (0.5 - 5) - higher is less sensitive                                                                                                                                                                                                                                               | 1.9       |
| initialOffsetX             | number  | The horizontal offset the image should start at                                                                                                                                                                                                                                                                                      | 0         |
| initialOffsetY             | number  | The vertical offset the image should start at                                                                                                                                                                                                                                                                                        | 0         |
| contentHeight              | number  | Specify if you want to treat the height of the **centered** content inside the zoom subject as the zoom subject's height                                                                                                                                                                                                             | undefined |
| contentWidth               | number  | Specify if you want to treat the width of the **centered** content inside the zoom subject as the zoom subject's width                                                                                                                                                                                                               | undefined |
| panBoundaryPadding         | number  | At certain scales, the edge of the content is bounded too close to the edge of the container, making it difficult to pan to and interact with the edge of the content. To fix this, we'd wanna allow the content to pan just a little further away from the container's edge. Hence, the "pan boundary padding", measured in pixels. | 0         |
| longPressDuration          | number  | Duration in ms until a press is considered a long press                                                                                                                                                                                                                                                                              | 700       |
| visualTouchFeedbackEnabled | boolean | Whether to show a touch feedback circle on touch                                                                                                                                                                                                                                                                                     | true      |

#### Static Pin Position

These optional props can be used to keep a "static" pin in the centre of the screen and move the map underneath it. This is very useful for maps.

| name                      | type                      | description                                               |
| ------------------------- | ------------------------- | --------------------------------------------------------- |
| staticPinPosition         | Vec2D                     | Where in the viewport to put the pin                      |
| staticPinIcon             | Element                   | The pin icon itself                                       |
| onStaticPinPositionChange | (position: Vec2D) => void | Callback every time the pin is at rest                    |
| onStaticPinPositionMove   | (position: Vec2D) => void | Callback live while the pin is moving                     |
| animatePin                | boolean                   | Whether to make the pin bounce up and down while dragging |

#### Callbacks

These events can be used to work with data after specific events.

| name              | description                                                                                                                                                | params                                       | expected return                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| onTransform       | Will be called when the transformation configuration (zoom level and offset) changes                                                                       | zoomableViewEventObject                      | void                                                                                       |
| onDoubleTapBefore | Will be called, at the start of a double tap                                                                                                               | event, gestureState, zoomableViewEventObject | void                                                                                       |
| onDoubleTapAfter  | Will be called at the end of a double tap                                                                                                                  | event, gestureState, zoomableViewEventObject | void                                                                                       |
| onShiftingBefore  | Will be called, when user taps and moves the view, but before our view movement work kicks in (so this is the place to interrupt movement, if you need to) | event, gestureState, zoomableViewEventObject | {boolean} if this returns true, ZoomableView will not process the shift, otherwise it will |
| onShiftingAfter   | Will be called, when user taps and moves the view, but after the values have changed already                                                               | event, gestureState, zoomableViewEventObject | void                                                                                       |
| onShiftingEnd     | Will be called, when user stops a tap and move gesture                                                                                                     | event, gestureState, zoomableViewEventObject | void                                                                                       |
| onZoomBefore      | Will be called, while the user pinches the screen, but before our zoom work kicks in (so this is the place to interrupt zooming, if you need to)           | event, gestureState, zoomableViewEventObject | {boolean} if this returns true, ZoomableView will not process the pinch, otherwise it will |
| onZoomAfter       | Will be called, while the user pinches the screen, but after the values have changed already                                                               | event, gestureState, zoomableViewEventObject | {boolean} if this returns true, ZoomableView will not process the pinch, otherwise it will |
| onZoomEnd         | Will be called after pinchzooming has ended                                                                                                                | event, gestureState, zoomableViewEventObject | {boolean} if this returns true, ZoomableView will not process the pinch, otherwise it will |
| onLongPress       | Will be called after the user pressed on the image for a while                                                                                             | event, gestureState                          | void                                                                                       |

#### Methods

The following methods allow you to control the ZoomableView zoom level & position from your component.
(think of control buttons, ...)

| name   | description                                                                                                          | params                                                       | expected return |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| zoomTo | Changes the zoom level to a specific number                                                                          | newZoomLevel: number, bindToBorders = true                   | Promise<bool>   |
| zoomBy | Changes the zoom level relative to the current level (use positive numbers to zoom in, negative numbers to zoom out) | zoomLevelChange: number, bindToBorders = true                | Promise<bool>   |
| moveTo | Shifts the zoomed part to a specific point (in px relative to x: 0, y: 0)                                            | newOffsetX: number, newOffsetY: number, bindToBorders = true | Promise<void>   |
| moveBy | Shifts the zoomed part by a specific pixel number                                                                    | newOffsetX: number, newOffsetY: number, bindToBorders = true | Promise<void>   |

**Example:**

```TSX

export default function App() {
  // you will need a reference to the ReactNativeZoomableView component
  const zoomableViewRef = createRef<ReactNativeZoomableView>();

  return (
    <View style={styles.container}>
      <View style={styles.zoomWrapper}>
        <ReactNativeZoomableView
          ref={zoomableViewRef}
          bindToBorders={true}
        >
          <Text style={styles.caption}>HelloWorld</Text>
        </ReactNativeZoomableView>
      </View>

      <View style={styles.controlWrapperLeft}>
        {/* Here you see some examples of moveBy */}
        <Button onPress={() => zoomableViewRef.current!.moveBy(-30, 0)} title="⬅️" />
        <Button onPress={() => zoomableViewRef.current!.moveBy(30, 0)} title="➡️" />
        <Button onPress={() => zoomableViewRef.current!.moveBy(0, -30)} title="⬆️" />
        <Button onPress={() => zoomableViewRef.current!.moveBy(0, 30)} title="⬇️" />

        {/* Here you see an example of moveTo */}
        <Button onPress={() => zoomableViewRef.current!.moveTo(300, 200)} title="Move to" />
      </View>

      <View style={styles.controlWrapperRight}>
        {/* Here you see examples of zoomBy */}
        <Button onPress={() => zoomableViewRef.current!.zoomBy(-0.1)} title="-" />
        <Button onPress={() => zoomableViewRef.current!.zoomBy(0.1)} title="+" />

        {/* Here you see an example of zoomTo */}
        <Button onPress={() => zoomableViewRef.current!.zoomTo(1)} title="reset" />
      </View>
    </View>
  );
}

```

#### Pan Responder Hooks

Sometimes you need to change deeper level behavior, so we prepared these panresponder hooks for you.

| name                             | description                                                                                                                                                                                                         | params                                                            | expected return                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| onStartShouldSetPanResponder     | description                                                                                                                                                                                                         | event, gestureState, zoomableViewEventObject, baseComponentResult | {boolean} whether panresponder should be set or not |
| onPanResponderGrant              | description                                                                                                                                                                                                         | event, gestureState, zoomableViewEventObject                      | void                                                |
| onPanResponderEnd                | Will be called when gesture ends (more accurately, on pan responder "release")                                                                                                                                      | event, gestureState, zoomableViewEventObject                      | void                                                |
| onPanResponderTerminate          | Will be called when the gesture is force-interrupted by another handler                                                                                                                                             | event, gestureState, zoomableViewEventObject                      | void                                                |
| onPanResponderTerminationRequest | Callback asking whether the gesture should be interrupted by another handler (**iOS only** due to https://github.com/facebook/react-native/issues/27778, https://github.com/facebook/react-native/issues/5696, ...) | event, gestureState, zoomableViewEventObject                      | void                                                |
| onPanResponderMove               | Will be called when user moves while touching                                                                                                                                                                       | event, gestureState, zoomableViewEventObject                      | void                                                |
| onShouldBlockNativeResponder     | Returns whether this component should block native components from becoming the JS responder                                                                                                                        | event, gestureState, zoomableViewEventObject                      | boolean                                             |

### zoomableViewEventObject

The zoomableViewEventObject object is attached to every event and represents the current state of our zoomable view.

```
   {
      zoomLevel: number,         // current level of zooming denoting the scale applied to the zoom subject (usually a value between minZoom and maxZoom)
      offsetX: number,           // current offset left
      offsetY: number,           // current offset top
      originalHeight: number,    // original height of the zoom subject
      originalWidth: number,     // original width of the zoom subject
      originalPageX: number,     // original absolute X of the zoom subject
      originalPageY: number,     // original absolite Y of the zoom subject
   }
```

## Special configurations

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## OpenSpace Labs

![OpenSpace_Logo](https://user-images.githubusercontent.com/2142140/168903797-3c13ba4e-f72b-411f-b6e4-3ee8e1abfce3.png)

This library was authored by [@SimonErich](https://github.com/SimonErich) and is now maintained by [OpenSpace Labs](https://openspace.ai).
Based in San Francisco, Openspace is "like Google StreetView plus Git for construction sites".
We're doing a lot of cool things with AI, Machine Vision, 3D/2D Imagery, React/React Native, and more.

Join us and help revolutionize the construction industry. We're [hiring on all fronts](https://www.openspace.ai/careers/)!

Check out our [Glassdoor](https://www.glassdoor.com/Overview/Working-at-OpenSpace-CA-EI_IE3061140.11,23.htm)
and [blog posts](https://www.openspace.ai/blog/).

## License

MIT
