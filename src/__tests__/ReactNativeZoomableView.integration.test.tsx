import ReactNativeZoomableView from '../ReactNativeZoomableView';
import {
  createMockEvent,
  createMockGestureState,
  DEFAULT_DIMENSIONAL_STATE,
  mountComponent,
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

describe('ReactNativeZoomableView - Integration & Boundaries', () => {
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
  // Boundary Constraint Tests
  // ==========================================================================

  describe('Boundary Constraints', () => {
    test('applies boundaries when bindToBorders is true', () => {
      instance = mountComponent(
        {
          bindToBorders: true,
          contentWidth: 400,
          contentHeight: 600,
          panBoundaryPadding: 0,
          initialZoom: 1,
        },
        {
          originalWidth: 400,
          originalHeight: 600,
          originalPageX: 100,
          originalPageY: 100,
        }
      );

      instance.moveTo(-1000, -1000);

      expect(instance.offsetX).toBeGreaterThanOrEqual(-50);
      expect(instance.offsetY).toBeGreaterThanOrEqual(-50);
    });

    test('allows movement within boundaries', () => {
      instance = mountComponent(
        {
          bindToBorders: true,
          contentWidth: 800,
          contentHeight: 1200,
          panBoundaryPadding: 0,
          initialZoom: 2,
        },
        {
          originalWidth: 400,
          originalHeight: 600,
          originalPageX: 100,
          originalPageY: 100,
        }
      );

      instance.moveTo(100, 150);

      expect(instance.offsetX).toBeDefined();
      expect(instance.offsetY).toBeDefined();
    });

    test('respects panBoundaryPadding', () => {
      instance = mountComponent(
        {
          bindToBorders: true,
          contentWidth: 400,
          contentHeight: 600,
          panBoundaryPadding: 50,
          initialZoom: 1,
        },
        {
          originalWidth: 400,
          originalHeight: 600,
          originalPageX: 100,
          originalPageY: 100,
        }
      );

      instance.moveTo(200, 300);

      expect(instance.offsetX).toBeDefined();
      expect(instance.offsetY).toBeDefined();
    });
  });

  // ==========================================================================
  // Complex Scenario Tests
  // ==========================================================================

  describe('Complex Scenarios', () => {
    test('zoom and pan combination maintains correct position', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          panEnabled: true,
          initialZoom: 1,
          maxZoom: 3,
          bindToBorders: false,
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

      instance.zoomTo(2, { x: 200, y: 300 });
      const zoomOffsetX = instance.offsetX;
      const zoomOffsetY = instance.offsetY;

      const startEvent = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const startGesture = createMockGestureState(1);
      instance._handlePanResponderGrant(startEvent, startGesture);

      const firstMoveEvent = createMockEvent([{ pageX: 205, pageY: 305 }]);
      const firstMoveGesture = createMockGestureState(1, 5, 5, 205, 305);
      instance._handlePanResponderMove(firstMoveEvent, firstMoveGesture);

      const moveEvent = createMockEvent([{ pageX: 305, pageY: 405 }]);
      const moveGesture = createMockGestureState(1, 105, 105, 305, 405);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      expect(instance.offsetX).toBeCloseTo(zoomOffsetX + 50, 0);
      expect(instance.offsetY).toBeCloseTo(zoomOffsetY + 50, 0);
    });

    test('rapid zoom changes are handled correctly', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          maxZoom: 3,
          minZoom: 0.5,
        },
        {
          originalWidth: 400,
          originalHeight: 600,
          originalPageX: 100,
          originalPageY: 100,
        }
      );

      instance.zoomTo(2);
      instance.zoomTo(1.5);
      instance.zoomTo(2.5);
      instance.zoomTo(1);

      expect(instance.zoomLevel).toBe(1);
    });

    test('pan during zoom maintains gesture type', () => {
      instance = mountComponent(
        {
          zoomEnabled: true,
          panEnabled: true,
        },
        {
          originalWidth: 400,
          originalHeight: 600,
          originalPageX: 100,
          originalPageY: 100,
        }
      );

      const pinchStart = createMockEvent([
        { pageX: 200, pageY: 300 },
        { pageX: 300, pageY: 300 },
      ]);
      const pinchStartGesture = createMockGestureState(2);
      instance._handlePanResponderGrant(pinchStart, pinchStartGesture);
      instance._handlePanResponderMove(pinchStart, pinchStartGesture);

      expect(instance.gestureType).toBe('pinch');

      const pinchMove = createMockEvent([
        { pageX: 150, pageY: 350 },
        { pageX: 350, pageY: 350 },
      ]);
      const pinchMoveGesture = createMockGestureState(2, 0, 0, 250, 350);
      instance._handlePanResponderMove(pinchMove, pinchMoveGesture);

      expect(instance.gestureType).toBe('pinch');
    });
  });
});
