// @ts-nocheck
import ReactNativeZoomableView from '../ReactNativeZoomableView';
import {
  createMockEvent,
  createMockGestureState,
  DEFAULT_DIMENSIONAL_STATE,
  mountComponent,
  TRIGGER_UPDATE_PREV_STATE,
} from './__testUtils__/helpers';

// ============================================================================
// Mock Setup
// ============================================================================

// Track animated values and listeners for testing
let animatedValues: {
  [key: string]: { value: number } | { x: number; y: number };
} = {};
let animatedListeners: {
  [key: string]: ((
    value: { value: number } | { x: number; y: number }
  ) => void)[];
} = {};

const createMockAnimatedValue = (initialValue: number) => {
  const id = Math.random().toString();
  animatedValues[id] = { value: initialValue };
  animatedListeners[id] = [];

  return {
    _value: initialValue,
    _id: id,
    setValue: jest.fn((val: number) => {
      animatedValues[id] = { value: val };
      const listeners = animatedListeners[id];
      if (listeners) {
        listeners.forEach((listener) => {
          listener({ value: val });
        });
      }
    }),
    addListener: jest.fn(
      (callback: (val: { value: number }) => void): string => {
        const listenerId = `${id}-listener-${
          animatedListeners[id]?.length || 0
        }`;
        if (!animatedListeners[id]) {
          animatedListeners[id] = [];
        }
        animatedListeners[id].push(
          callback as (
            value: { value: number } | { x: number; y: number }
          ) => void
        );
        return listenerId;
      }
    ),
    removeListener: jest.fn(),
    stopAnimation: jest.fn(),
  };
};

const createMockAnimatedValueXY = (initialValue: { x: number; y: number }) => {
  const id = Math.random().toString();
  animatedValues[id] = initialValue;
  animatedListeners[id] = [];

  return {
    _value: initialValue,
    _id: id,
    x: createMockAnimatedValue(initialValue.x),
    y: createMockAnimatedValue(initialValue.y),
    setValue: jest.fn((val: { x: number; y: number }) => {
      animatedValues[id] = val;
      const listeners = animatedListeners[id];
      if (listeners) {
        listeners.forEach((listener) => {
          listener(val);
        });
      }
    }),
    addListener: jest.fn(
      (callback: (val: { x: number; y: number }) => void): string => {
        const listenerId = `${id}-listener-${
          animatedListeners[id]?.length || 0
        }`;
        if (!animatedListeners[id]) {
          animatedListeners[id] = [];
        }
        animatedListeners[id].push(
          callback as (
            value: { value: number } | { x: number; y: number }
          ) => void
        );
        return listenerId;
      }
    ),
    removeListener: jest.fn(),
    stopAnimation: jest.fn(),
    getTranslateTransform: jest.fn(() => [
      { translateX: (animatedValues[id] as { x: number; y: number }).x },
      { translateY: (animatedValues[id] as { x: number; y: number }).y },
    ]),
  };
};

// Mock animations module first to intercept animation calls
jest.mock('../animations', () => ({
  getZoomToAnimation: jest.fn((animValue, toValue) => ({
    start: jest.fn((callback) => {
      if (animValue && animValue.setValue) {
        animValue.setValue(toValue);
      }
      callback?.();
    }),
  })),
  getBoundaryCrossedAnim: jest.fn((animValue, toValue) => ({
    start: jest.fn((callback) => {
      if (animValue && animValue.setValue) {
        animValue.setValue(toValue);
      }
      callback?.();
    }),
  })),
  getPanMomentumDecayAnim: jest.fn(() => ({
    start: jest.fn((callback) => {
      callback?.();
    }),
  })),
}));

// Mock Animated API
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const MockedRN = Object.create(RN);

  MockedRN.Animated = {
    ...RN.Animated,
    Value: jest.fn((initialValue: number) =>
      createMockAnimatedValue(initialValue)
    ),
    ValueXY: jest.fn((initialValue: { x: number; y: number }) =>
      createMockAnimatedValueXY(initialValue)
    ),
    View: RN.View,
    timing: jest.fn((animatedValue: any, config: any) => ({
      start: jest.fn((callback?: () => void) => {
        if (animatedValue.setValue) {
          animatedValue.setValue(config.toValue);
        }
        callback?.();
      }),
    })),
    decay: jest.fn((_animatedValue: any, _config: any) => ({
      start: jest.fn((callback?: () => void) => {
        callback?.();
      }),
    })),
    spring: jest.fn((animatedValue: any, config: any) => ({
      start: jest.fn((callback?: () => void) => {
        if (animatedValue.setValue) {
          animatedValue.setValue(config.toValue);
        }
        callback?.();
      }),
    })),
    Easing: RN.Animated.Easing,
  };

  MockedRN.PanResponder = {
    create: jest.fn((config: any) => ({
      panHandlers: {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderGrant: (evt: any, gestureState: any) =>
          config.onPanResponderGrant?.(evt, gestureState),
        onResponderMove: (evt: any, gestureState: any) =>
          config.onPanResponderMove?.(evt, gestureState),
        onResponderRelease: (evt: any, gestureState: any) =>
          config.onPanResponderRelease?.(evt, gestureState),
        onResponderTerminate: (evt: any, gestureState: any) =>
          config.onPanResponderTerminate?.(evt, gestureState),
      },
    })),
  };

  return MockedRN;
});

// ============================================================================
// Test Suite
// ============================================================================

describe('ReactNativeZoomableView - Gesture Handling', () => {
  let instance: ReactNativeZoomableView;

  beforeEach(() => {
    jest.clearAllMocks();
    animatedValues = {};
    animatedListeners = {};
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ==========================================================================
  // Pan Gesture Tests
  // ==========================================================================

  describe('Pan Gestures (Shifting)', () => {
    test('pans the view with single finger drag', () => {
      instance = mountComponent(
        {
          panEnabled: true,
          initialZoom: 1,
          bindToBorders: false,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const startGesture = createMockGestureState(1);
      instance._handlePanResponderGrant(startEvent, startGesture);

      const firstMoveEvent = createMockEvent([{ pageX: 205, pageY: 305 }]);
      const firstMoveGesture = createMockGestureState(1, 5, 5, 205, 305);
      instance._handlePanResponderMove(firstMoveEvent, firstMoveGesture);

      const moveEvent = createMockEvent([{ pageX: 250, pageY: 350 }]);
      const moveGesture = createMockGestureState(1, 50, 50, 250, 350);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.offsetX).toBeCloseTo(45, 0);
      expect(instance.offsetY).toBeCloseTo(45, 0);
    });

    test('respects movementSensibility prop', () => {
      instance = mountComponent(
        {
          panEnabled: true,
          movementSensibility: 2,
          initialZoom: 1,
          bindToBorders: false,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const startGesture = createMockGestureState(1);
      instance._handlePanResponderGrant(startEvent, startGesture);

      const firstMoveEvent = createMockEvent([{ pageX: 205, pageY: 305 }]);
      const firstMoveGesture = createMockGestureState(1, 5, 5, 205, 305);
      instance._handlePanResponderMove(firstMoveEvent, firstMoveGesture);

      const moveEvent = createMockEvent([{ pageX: 305, pageY: 405 }]);
      const moveGesture = createMockGestureState(1, 105, 105, 305, 405);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.offsetX).toBeCloseTo(50, 0);
      expect(instance.offsetY).toBeCloseTo(50, 0);
    });

    test('does not pan when panEnabled is false', () => {
      instance = mountComponent(
        {
          panEnabled: false,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const startGesture = createMockGestureState(1);
      instance._handlePanResponderGrant(startEvent, startGesture);

      const initialOffsetX = instance.offsetX;
      const initialOffsetY = instance.offsetY;

      const moveEvent = createMockEvent([{ pageX: 250, pageY: 350 }]);
      const moveGesture = createMockGestureState(1, 50, 50, 250, 350);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.offsetX).toBe(initialOffsetX);
      expect(instance.offsetY).toBe(initialOffsetY);
    });

    test('does not pan at initial zoom when disablePanOnInitialZoom is true', () => {
      instance = mountComponent(
        {
          panEnabled: true,
          disablePanOnInitialZoom: true,
          initialZoom: 1,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const startGesture = createMockGestureState(1);
      instance._handlePanResponderGrant(startEvent, startGesture);

      const initialOffsetX = instance.offsetX;
      const initialOffsetY = instance.offsetY;

      const moveEvent = createMockEvent([{ pageX: 250, pageY: 350 }]);
      const moveGesture = createMockGestureState(1, 50, 50, 250, 350);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.offsetX).toBe(initialOffsetX);
      expect(instance.offsetY).toBe(initialOffsetY);
    });

    test('allows pan when zoomed even with disablePanOnInitialZoom', () => {
      instance = mountComponent(
        {
          panEnabled: true,
          disablePanOnInitialZoom: true,
          initialZoom: 1,
          bindToBorders: false,
          maxZoom: 3,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      // Setup listeners
      instance.componentDidUpdate({} as any, TRIGGER_UPDATE_PREV_STATE);

      // Zoom to 2 (away from initialZoom of 1)
      instance.zoomTo(2);

      const startEvent = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const startGesture = createMockGestureState(1);
      instance._handlePanResponderGrant(startEvent, startGesture);

      const firstMoveEvent = createMockEvent([{ pageX: 205, pageY: 305 }]);
      const firstMoveGesture = createMockGestureState(1, 5, 5, 205, 305);
      instance._handlePanResponderMove(firstMoveEvent, firstMoveGesture);

      const moveEvent = createMockEvent([{ pageX: 255, pageY: 355 }]);
      const moveGesture = createMockGestureState(1, 55, 55, 255, 355);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.offsetX).toBeCloseTo(25, 0);
      expect(instance.offsetY).toBeCloseTo(25, 0);
    });
  });

  // ==========================================================================
  // Pinch Zoom Tests
  // ==========================================================================

  describe('Pinch Gestures (Zooming)', () => {
    test('zooms in with pinch gesture', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          initialZoom: 1,
          maxZoom: 3,
          minZoom: 0.5,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([
        { pageX: 200, pageY: 300 },
        { pageX: 300, pageY: 300 },
      ]);
      const startGesture = createMockGestureState(2);
      instance._handlePanResponderGrant(startEvent, startGesture);
      instance._handlePanResponderMove(startEvent, startGesture);

      const initialZoom = instance.zoomLevel;

      const moveEvent = createMockEvent([
        { pageX: 150, pageY: 300 },
        { pageX: 350, pageY: 300 },
      ]);
      const moveGesture = createMockGestureState(2, 0, 0, 250, 300);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.zoomLevel).toBeGreaterThan(initialZoom);
    });

    test('zooms out with pinch gesture', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          initialZoom: 2,
          maxZoom: 3,
          minZoom: 0.5,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([
        { pageX: 150, pageY: 300 },
        { pageX: 350, pageY: 300 },
      ]);
      const startGesture = createMockGestureState(2);
      instance._handlePanResponderGrant(startEvent, startGesture);
      instance._handlePanResponderMove(startEvent, startGesture);

      const initialZoom = instance.zoomLevel;

      const moveEvent = createMockEvent([
        { pageX: 200, pageY: 300 },
        { pageX: 300, pageY: 300 },
      ]);
      const moveGesture = createMockGestureState(2, 0, 0, 250, 300);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.zoomLevel).toBeLessThan(initialZoom);
    });

    test('respects maxZoom limit', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          initialZoom: 2.9,
          maxZoom: 3,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([
        { pageX: 200, pageY: 300 },
        { pageX: 300, pageY: 300 },
      ]);
      const startGesture = createMockGestureState(2);
      instance._handlePanResponderGrant(startEvent, startGesture);
      instance._handlePanResponderMove(startEvent, startGesture);

      const moveEvent = createMockEvent([
        { pageX: 100, pageY: 300 },
        { pageX: 400, pageY: 300 },
      ]);
      const moveGesture = createMockGestureState(2, 0, 0, 250, 300);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.zoomLevel).toBeLessThanOrEqual(3);
    });

    test('respects minZoom limit', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          initialZoom: 0.6,
          minZoom: 0.5,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([
        { pageX: 150, pageY: 300 },
        { pageX: 350, pageY: 300 },
      ]);
      const startGesture = createMockGestureState(2);
      instance._handlePanResponderGrant(startEvent, startGesture);
      instance._handlePanResponderMove(startEvent, startGesture);

      const moveEvent = createMockEvent([
        { pageX: 240, pageY: 300 },
        { pageX: 260, pageY: 300 },
      ]);
      const moveGesture = createMockGestureState(2, 0, 0, 250, 300);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.zoomLevel).toBeGreaterThanOrEqual(0.5);
    });

    test('does not zoom when zoomEnabled is false', () => {
      instance = mountComponent(
        {
          zoomEnabled: false,
          initialZoom: 1,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([
        { pageX: 200, pageY: 300 },
        { pageX: 300, pageY: 300 },
      ]);
      const startGesture = createMockGestureState(2);
      instance._handlePanResponderGrant(startEvent, startGesture);
      instance._handlePanResponderMove(startEvent, startGesture);

      const initialZoom = instance.zoomLevel;

      const moveEvent = createMockEvent([
        { pageX: 150, pageY: 300 },
        { pageX: 350, pageY: 300 },
      ]);
      const moveGesture = createMockGestureState(2, 0, 0, 250, 300);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.zoomLevel).toBe(initialZoom);
    });

    test('uses staticPinPosition as zoom center when provided', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          initialZoom: 1,
          maxZoom: 3,
          staticPinPosition: { x: 200, y: 300 },
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([
        { pageX: 200, pageY: 300 },
        { pageX: 300, pageY: 300 },
      ]);
      const startGesture = createMockGestureState(2);
      instance._handlePanResponderGrant(startEvent, startGesture);
      instance._handlePanResponderMove(startEvent, startGesture);

      const initialZoom = instance.zoomLevel;

      const moveEvent = createMockEvent([
        { pageX: 150, pageY: 300 },
        { pageX: 350, pageY: 300 },
      ]);
      const moveGesture = createMockGestureState(2, 0, 0, 250, 300);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.zoomLevel).toBeGreaterThan(initialZoom);
    });
  });

  // ==========================================================================
  // Tap Gesture Tests
  // ==========================================================================

  describe('Tap Gestures', () => {
    test('detects single tap', () => {
      const onSingleTap = jest.fn();
      instance = mountComponent(
        {
          onSingleTap,
          doubleTapDelay: 300,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const event = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const gestureState = createMockGestureState(1);

      instance._handlePanResponderGrant(event, gestureState);
      instance._handlePanResponderEnd(event, gestureState);

      jest.advanceTimersByTime(350);

      expect(onSingleTap).toHaveBeenCalled();
    });

    test('detects double tap', () => {
      const onDoubleTapBefore = jest.fn();
      const onDoubleTapAfter = jest.fn();
      instance = mountComponent(
        {
          onDoubleTapBefore,
          onDoubleTapAfter,
          doubleTapDelay: 300,
          maxZoom: 3,
          initialZoom: 1,
          zoomStep: 0.5,
          zoomEnabled: true,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      instance.componentDidUpdate({} as any, {
        originalWidth: 0,
        originalHeight: 0,
        originalPageX: 0,
        originalPageY: 0,
        originalX: 0,
        originalY: 0,
        pinSize: { width: 0, height: 0 },
      });

      const event = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const gestureState = createMockGestureState(1);

      instance._handlePanResponderGrant(event, gestureState);
      instance._handlePanResponderEnd(event, gestureState);

      jest.advanceTimersByTime(100);
      instance._handlePanResponderGrant(event, gestureState);
      instance._handlePanResponderEnd(event, gestureState);

      expect(onDoubleTapBefore).toHaveBeenCalled();
      expect(onDoubleTapAfter).toHaveBeenCalled();
      expect(instance.zoomLevel).toBeGreaterThan(1);
    });

    test('double tap zooms to center when doubleTapZoomToCenter is true', () => {
      instance = mountComponent(
        {
          doubleTapZoomToCenter: true,
          doubleTapDelay: 300,
          maxZoom: 3,
          initialZoom: 1,
          zoomStep: 0.5,
          zoomEnabled: true,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      instance.componentDidUpdate({} as any, {
        originalWidth: 0,
        originalHeight: 0,
        originalPageX: 0,
        originalPageY: 0,
        originalX: 0,
        originalY: 0,
        pinSize: { width: 0, height: 0 },
      });

      const event = createMockEvent([{ pageX: 300, pageY: 400 }]);
      const gestureState = createMockGestureState(1);

      instance._handlePanResponderGrant(event, gestureState);
      instance._handlePanResponderEnd(event, gestureState);

      jest.advanceTimersByTime(100);
      instance._handlePanResponderGrant(event, gestureState);
      instance._handlePanResponderEnd(event, gestureState);

      expect(instance.zoomLevel).toBeGreaterThan(1);
    });
  });

  // ==========================================================================
  // Long Press Tests
  // ==========================================================================

  describe('Long Press', () => {
    test('detects long press', () => {
      const onLongPress = jest.fn();
      instance = mountComponent(
        {
          onLongPress,
          longPressDuration: 700,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const event = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const gestureState = createMockGestureState(1);

      instance._handlePanResponderGrant(event, gestureState);

      jest.advanceTimersByTime(750);

      expect(onLongPress).toHaveBeenCalled();
    });

    test('cancels long press on movement', () => {
      const onLongPress = jest.fn();
      instance = mountComponent(
        {
          onLongPress,
          longPressDuration: 700,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const startGesture = createMockGestureState(1);
      instance._handlePanResponderGrant(startEvent, startGesture);

      jest.advanceTimersByTime(300);
      const moveEvent = createMockEvent([{ pageX: 210, pageY: 310 }]);
      const moveGesture = createMockGestureState(1, 10, 10, 210, 310);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      jest.advanceTimersByTime(500);

      expect(onLongPress).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Edge Case Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    test('handles switching from pinch to pan', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          panEnabled: true,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const pinchEvent = createMockEvent([
        { pageX: 200, pageY: 300 },
        { pageX: 300, pageY: 300 },
      ]);
      const pinchGesture = createMockGestureState(2);
      instance._handlePanResponderGrant(pinchEvent, pinchGesture);
      instance._handlePanResponderMove(pinchEvent, pinchGesture);

      const panEvent = createMockEvent([{ pageX: 250, pageY: 300 }]);
      const panGesture = createMockGestureState(1, 50, 0, 250, 300);
      instance._handlePanResponderMove(panEvent, panGesture);

      expect(instance.zoomLevel).toBeDefined();
      expect(instance.offsetX).toBeDefined();
    });

    test('handles invalid touch count gracefully', () => {
      instance = mountComponent({}, DEFAULT_DIMENSIONAL_STATE);

      const event = createMockEvent([
        { pageX: 200, pageY: 300 },
        { pageX: 250, pageY: 350 },
      ]);
      const gestureState = createMockGestureState(3);

      instance._handlePanResponderGrant(event, gestureState);
      const result = instance._handlePanResponderMove(event, gestureState);

      expect(result).toBe(true);
    });
  });
});
