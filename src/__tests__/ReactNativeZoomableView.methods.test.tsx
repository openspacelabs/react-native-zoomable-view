// @ts-nocheck
import ReactNativeZoomableView from '../ReactNativeZoomableView';
import {
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

describe('ReactNativeZoomableView - Programmatic Methods', () => {
  let instance: ReactNativeZoomableView;

  beforeEach(() => {
    jest.clearAllMocks();
    animatedValues = {};
    animatedListeners = {};
    jest.useFakeTimers();

    instance = mountComponent(
      {
        maxZoom: 3,
        minZoom: 0.5,
        zoomEnabled: true,
        bindToBorders: false,
      },
      DEFAULT_DIMENSIONAL_STATE
    );

    instance.componentDidUpdate({} as any, TRIGGER_UPDATE_PREV_STATE);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Zoom Methods', () => {
    test('zoomTo changes zoom level', () => {
      const result = instance.zoomTo(2);

      expect(result).toBe(true);
      expect(instance.zoomLevel).toBe(2);
    });

    test('zoomTo with zoom center maintains position', () => {
      instance.zoomTo(2, { x: 100, y: 150 });

      expect(instance.zoomLevel).toBe(2);
      expect(instance.offsetX).not.toBe(0);
      expect(instance.offsetY).not.toBe(0);
    });

    test('zoomTo respects maxZoom', () => {
      const result = instance.zoomTo(5);

      expect(result).toBe(false);
      expect(instance.zoomLevel).not.toBe(5);
    });

    test('zoomTo respects minZoom', () => {
      const result = instance.zoomTo(0.1);

      expect(result).toBe(false);
      expect(instance.zoomLevel).not.toBe(0.1);
    });

    test('zoomBy increases zoom level', () => {
      instance.zoomTo(1);
      expect(instance.zoomLevel).toBe(1);

      instance.zoomBy(0.5);
      expect(instance.zoomLevel).toBe(1.5);
    });

    test('zoomBy decreases zoom level', () => {
      instance.zoomTo(2);
      expect(instance.zoomLevel).toBe(2);

      instance.zoomBy(-0.5);
      expect(instance.zoomLevel).toBe(1.5);
    });
  });

  describe('Pan Methods', () => {
    test('moveTo changes position', () => {
      instance.moveTo(100, 150);

      // moveTo converts viewport coordinates to offset with negation
      // Implementation: offsetX = -(newOffsetX - originalWidth/2) / zoom
      // For x: -((100 - 400/2) / 1) = -((100 - 200) / 1) = -(-100) = 100
      expect(instance.offsetX).toBeCloseTo(100, 0);
      // For y: -((150 - 600/2) / 1) = -((150 - 300) / 1) = -(-150) = 150
      expect(instance.offsetY).toBeCloseTo(150, 0);
    });

    test('moveBy changes position relatively', () => {
      instance.offsetX = 50;
      instance.offsetY = 100;
      instance.zoomLevel = 1;

      instance.moveBy(20, 30);

      expect(instance.offsetX).toBeCloseTo(30, 0);
      expect(instance.offsetY).toBeCloseTo(70, 0);
    });
  });
});
