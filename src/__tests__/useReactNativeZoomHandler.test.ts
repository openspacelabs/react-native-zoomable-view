import { useSharedValue } from 'react-native-reanimated';
import { renderHook, act } from '@testing-library/react-hooks';

import { useReactNativeZoomHandler } from '../useReactNativeZoomHandler';

// A little test helper for this weird shared value syntax
const getSharedValue = (value) =>
  renderHook(() => useSharedValue<number>(value)).result.current;

// By default we'll use a 100x100 layout
const layout = { width: 100, height: 100 };
// Simulate a layout event, normally passed `onLayout`
const layoutEvent = { nativeEvent: { layout } };

let animator;
beforeEach(() => {
  const scaleValue = getSharedValue(1);
  const { result } = renderHook(() =>
    useReactNativeZoomHandler({
      scaleValue,
      initialZoom: 1,
      maxZoom: 10,
      minZoom: 0.1,
    })
  );
  animator = result;
});

describe('dragging', () => {
  it('drags once', () => {
    act(() => {
      animator.current.onLayout(layoutEvent);
      animator.current.onDragUpdate({ translationX: 10, translationY: 10 });
    });

    expect(animator.current.animatedStyles.transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { scale: 1 },
      { translateX: 0 },
      { translateY: 0 },
      { translateX: 10 },
      { translateY: 10 },
    ]);
  });

  it('drags twice', () => {
    act(() => {
      animator.current.onLayout(layoutEvent);
      animator.current.onDragUpdate({ translationX: 10, translationY: 10 });
      animator.current.onDragEnd();
      animator.current.onDragUpdate({ translationX: -20, translationY: -20 });
    });

    expect(animator.current.animatedStyles.transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { scale: 1 },
      { translateX: 0 },
      { translateY: 0 },
      { translateX: -10 },
      { translateY: -10 },
    ]);
  });
});

describe('pinching', () => {
  it('scales from the centre', () => {
    act(() => {
      animator.current.onLayout(layoutEvent);
      animator.current.onPinchUpdate({
        scale: 2,
        focalX: 50,
        focalY: 50,
        numberOfPointers: 2,
      });
    });

    expect(animator.current.animatedStyles.transform).toEqual([
      { translateX: 50 },
      { translateY: 50 },
      { scale: 2 },
      { translateX: 25 },
      { translateY: 25 },
      { translateX: 0 },
      { translateY: 0 },
    ]);
  });

  it('scales from a point', () => {
    act(() => {
      animator.current.onLayout(layoutEvent);
      animator.current.onPinchBegin({
        focalX: 75,
        focalY: 75,
      });
      animator.current.onPinchUpdate({
        scale: 2,
        focalX: 75,
        focalY: 75,
        numberOfPointers: 2,
      });
    });

    expect(animator.current.animatedStyles.transform).toEqual([
      { translateX: -25 },
      { translateY: -25 },
      { scale: 2 },
      { translateX: 0 },
      { translateY: 0 },
      { translateX: 0 },
      { translateY: 0 },
    ]);
  });
});

describe('multiple gestures', () => {
  it('drags, then pinches', async () => {
    act(() => {
      animator.current.onLayout(layoutEvent);
      animator.current.onDragUpdate({ translationX: 10, translationY: 10 });
      animator.current.onDragEnd();
      animator.current.onPinchBegin({
        focalX: 75,
        focalY: 75,
      });
      animator.current.onPinchUpdate({
        scale: 2,
        focalX: 85,
        focalY: 75,
        numberOfPointers: 2,
      });
      animator.current.onPinchEnd();
    });

    expect(animator.current.animatedStyles.transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { scale: 2 },
      { translateX: 5 },
      { translateY: 0 },
      { translateX: 10 },
      { translateY: 10 },
    ]);
  });
});

describe('pinch-drag-pinch', () => {
  it('goes from two- to one-finger pinch, then back to two-finger', async () => {
    act(() => {
      animator.current.onLayout(layoutEvent);
      animator.current.onPinchBegin({
        focalX: 75,
        focalY: 50,
      });
      animator.current.onPinchUpdate({
        scale: 1,
        focalX: 65,
        focalY: 50,
        numberOfPointers: 2,
      });
      animator.current.onPinchUpdate({
        scale: 1,
        focalX: 55,
        focalY: 50,
        numberOfPointers: 1,
      });
      animator.current.onPinchUpdate({
        scale: 1,
        focalX: 45,
        focalY: 50,
        numberOfPointers: 1,
      });
      animator.current.onPinchUpdate({
        scale: 1,
        focalX: 35,
        focalY: 50,
        numberOfPointers: 2,
      });
      animator.current.onPinchEnd();
    });

    expect(animator.current.animatedStyles.transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { scale: 1 },
      { translateX: 20 },
      { translateY: 0 },
      { translateX: 0 },
      { translateY: 0 },
    ]);
  });
});
