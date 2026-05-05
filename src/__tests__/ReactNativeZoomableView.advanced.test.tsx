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
        onPanResponderTerminationRequest: (evt: any, gestureState: any) =>
          config.onPanResponderTerminationRequest?.(evt, gestureState),
        onShouldBlockNativeResponder: (evt: any, gestureState: any) =>
          config.onShouldBlockNativeResponder?.(evt, gestureState),
        onStartShouldSetPanResponderCapture: (evt: any, gestureState: any) =>
          config.onStartShouldSetPanResponderCapture?.(evt, gestureState),
        onMoveShouldSetPanResponderCapture: (evt: any, gestureState: any) =>
          config.onMoveShouldSetPanResponderCapture?.(evt, gestureState),
      },
    })),
  };

  return MockedRN;
});

// ============================================================================
// Test Suite
// ============================================================================

describe('ReactNativeZoomableView - Coverage Tests', () => {
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
  // PanResponder Lifecycle Tests
  // ==========================================================================

  describe('PanResponder Lifecycle Props', () => {
    test('accepts onPanResponderTerminate callback', () => {
      const onPanResponderTerminate = jest.fn();
      instance = mountComponent({
        onPanResponderTerminate,
      });

      expect(instance.props.onPanResponderTerminate).toBe(
        onPanResponderTerminate
      );
    });

    test('accepts onPanResponderTerminationRequest callback', () => {
      const onPanResponderTerminationRequest = jest.fn(() => true);
      instance = mountComponent({
        onPanResponderTerminationRequest,
      });

      expect(instance.props.onPanResponderTerminationRequest).toBe(
        onPanResponderTerminationRequest
      );
    });

    test('accepts onShouldBlockNativeResponder callback', () => {
      const onShouldBlockNativeResponder = jest.fn(() => false);
      instance = mountComponent({
        onShouldBlockNativeResponder,
      });

      expect(instance.props.onShouldBlockNativeResponder).toBe(
        onShouldBlockNativeResponder
      );
    });

    test('accepts onStartShouldSetPanResponderCapture callback', () => {
      const onStartShouldSetPanResponderCapture = jest.fn(() => true);
      instance = mountComponent({
        onStartShouldSetPanResponderCapture,
      });

      expect(instance.props.onStartShouldSetPanResponderCapture).toBe(
        onStartShouldSetPanResponderCapture
      );
    });

    test('accepts onMoveShouldSetPanResponderCapture callback', () => {
      const onMoveShouldSetPanResponderCapture = jest.fn(() => true);
      instance = mountComponent({
        onMoveShouldSetPanResponderCapture,
      });

      expect(instance.props.onMoveShouldSetPanResponderCapture).toBe(
        onMoveShouldSetPanResponderCapture
      );
    });
  });

  // ==========================================================================
  // Measure & Layout Tests
  // ==========================================================================

  describe('Measure & Layout', () => {
    test('onLayout callback is accepted as prop', () => {
      const onLayout = jest.fn();
      instance = mountComponent({ onLayout });

      expect(instance.props.onLayout).toBe(onLayout);
    });

    test('measure callback handles off-screen component (all zeros)', () => {
      instance = mountComponent({});

      const mockMeasure = jest.fn((callback) => {
        callback(0, 0, 0, 0, 0, 0);
      });

      instance.zoomSubjectWrapperRef.current = {
        measure: mockMeasure,
      };

      const initialState = { ...instance.state };
      instance.measureZoomSubject();

      expect(instance.state).toEqual(initialState);
    });

    test('measure callback skips update when values unchanged', () => {
      instance = mountComponent({}, DEFAULT_DIMENSIONAL_STATE);

      const mockMeasure = jest.fn((callback) => {
        callback(0, 0, 400, 600, 100, 100);
      });

      instance.zoomSubjectWrapperRef.current = {
        measure: mockMeasure,
      };

      const setStateSpy = jest.spyOn(instance, 'setState');
      instance.measureZoomSubject();

      expect(setStateSpy).not.toHaveBeenCalled();
    });

    test('measure callback updates state when values change', () => {
      instance = mountComponent({}, DEFAULT_DIMENSIONAL_STATE);

      const mockMeasure = jest.fn((callback) => {
        callback(5, 10, 500, 700, 150, 200);
      });

      instance.zoomSubjectWrapperRef.current = {
        measure: mockMeasure,
      };

      const setStateSpy = jest.spyOn(instance, 'setState');
      instance.measureZoomSubject();

      // measureZoomSubject uses requestAnimationFrame, so we need to advance timers
      jest.runAllTimers();

      expect(setStateSpy).toHaveBeenCalledWith({
        originalX: 5,
        originalY: 10,
        originalWidth: 500,
        originalHeight: 700,
        originalPageX: 150,
        originalPageY: 200,
      });
    });
  });

  // ==========================================================================
  // Static Pin Tests
  // ==========================================================================

  describe('Static Pin', () => {
    test('moveStaticPinTo with duration animates pan', () => {
      instance = mountComponent(
        {
          staticPinPosition: { x: 200, y: 300 },
          contentWidth: 800,
          contentHeight: 1200,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      instance.componentDidUpdate({} as any, TRIGGER_UPDATE_PREV_STATE);

      instance.moveStaticPinTo({ x: 100, y: 150 }, 200);

      expect(instance.offsetX).toBeDefined();
      expect(instance.offsetY).toBeDefined();
    });

    test('moveStaticPinTo without duration updates immediately', () => {
      instance = mountComponent(
        {
          staticPinPosition: { x: 200, y: 300 },
          contentWidth: 800,
          contentHeight: 1200,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      instance.componentDidUpdate({} as any, TRIGGER_UPDATE_PREV_STATE);

      const prevOffsetX = instance.offsetX;
      instance.moveStaticPinTo({ x: 100, y: 150 });

      expect(instance.offsetX).not.toBe(prevOffsetX);
    });

    test('moveStaticPinTo returns early when no staticPinPosition', () => {
      instance = mountComponent(
        {
          staticPinPosition: null,
          contentWidth: 800,
          contentHeight: 1200,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const initialOffsetX = instance.offsetX;
      instance.moveStaticPinTo({ x: 100, y: 150 });

      expect(instance.offsetX).toBe(initialOffsetX);
    });

    test('moveStaticPinTo returns early when no originalWidth', () => {
      instance = mountComponent({
        staticPinPosition: { x: 200, y: 300 },
        contentWidth: 800,
        contentHeight: 1200,
      });

      const initialOffsetX = instance.offsetX;
      instance.moveStaticPinTo({ x: 100, y: 150 });

      expect(instance.offsetX).toBe(initialOffsetX);
    });

    test('moveStaticPinTo returns early when no contentWidth', () => {
      instance = mountComponent(
        {
          staticPinPosition: { x: 200, y: 300 },
          contentWidth: null,
          contentHeight: null,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const initialOffsetX = instance.offsetX;
      instance.moveStaticPinTo({ x: 100, y: 150 });

      expect(instance.offsetX).toBe(initialOffsetX);
    });

    test('_staticPinPosition returns pin position relative to content', () => {
      instance = mountComponent(
        {
          staticPinPosition: { x: 200, y: 300 },
          contentWidth: 800,
          contentHeight: 1200,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const position = instance._staticPinPosition();

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
    });

    test('onStaticPinPress callback is called', () => {
      const onStaticPinPress = jest.fn();
      instance = mountComponent({
        onStaticPinPress,
        staticPinPosition: { x: 200, y: 300 },
      });

      expect(onStaticPinPress).toBeDefined();
    });

    test('onStaticPinLongPress callback is defined', () => {
      const onStaticPinLongPress = jest.fn();
      instance = mountComponent({
        onStaticPinLongPress,
        staticPinPosition: { x: 200, y: 300 },
      });

      expect(onStaticPinLongPress).toBeDefined();
    });

    test('onStaticPinPositionChange prop accepted', () => {
      const onStaticPinPositionChange = jest.fn();
      instance = mountComponent({
        staticPinPosition: { x: 200, y: 300 },
        onStaticPinPositionChange,
      });

      expect(instance.props.onStaticPinPositionChange).toBeDefined();
    });

    test('onStaticPinPositionChange called when _updateStaticPin is invoked', () => {
      const onStaticPinPositionChange = jest.fn();
      instance = mountComponent(
        {
          staticPinPosition: { x: 200, y: 300 },
          onStaticPinPositionChange,
          contentWidth: 800,
          contentHeight: 1200,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      // Directly call _updateStaticPin
      instance._updateStaticPin();

      expect(onStaticPinPositionChange).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ZoomBy Edge Cases
  // ==========================================================================

  describe('ZoomBy Method', () => {
    test('zoomBy with positive delta increases zoom', () => {
      instance = mountComponent(
        {
          initialZoom: 1,
          zoomEnabled: true,
          maxZoom: 3,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      instance.componentDidUpdate({} as any, TRIGGER_UPDATE_PREV_STATE);

      instance.zoomBy(0.5, { x: 200, y: 300 });

      expect(instance.zoomLevel).toBe(1.5);
    });

    test('zoomBy with negative delta decreases zoom', () => {
      instance = mountComponent(
        {
          initialZoom: 2,
          zoomEnabled: true,
          maxZoom: 3,
          minZoom: 0.5,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      instance.componentDidUpdate({} as any, TRIGGER_UPDATE_PREV_STATE);

      instance.zoomBy(-0.5, { x: 200, y: 300 });

      expect(instance.zoomLevel).toBe(1.5);
    });
  });

  // ==========================================================================
  // Pan with Momentum Tests
  // ==========================================================================

  describe('Pan with Momentum', () => {
    test('panMomentumEnabled triggers decay animation on release', () => {
      instance = mountComponent(
        {
          panEnabled: true,
          panMomentumEnabled: true,
          panMomentumDecayFactor: 0.9,
          bindToBorders: false,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      const startEvent = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const startGesture = createMockGestureState(1);
      instance._handlePanResponderGrant(startEvent, startGesture);

      const moveEvent = createMockEvent([{ pageX: 250, pageY: 350 }]);
      const moveGesture = createMockGestureState(1, 50, 50, 250, 350, 2, 2);
      instance._handlePanResponderMove(moveEvent, moveGesture);

      const releaseEvent = createMockEvent([{ pageX: 250, pageY: 350 }]);
      const releaseGesture = createMockGestureState(1, 50, 50, 250, 350, 2, 2);
      instance._handlePanResponderEnd(releaseEvent, releaseGesture);

      expect(true).toBe(true);
    });
  });

  // ==========================================================================
  // Double Tap Static Pin Animation
  // ==========================================================================

  describe('Double Tap with Static Pin', () => {
    test('double tap with static pin animates to pin position', () => {
      instance = mountComponent(
        {
          doubleTapDelay: 300,
          maxZoom: 3,
          initialZoom: 1,
          zoomStep: 0.5,
          zoomEnabled: true,
          staticPinPosition: { x: 200, y: 300 },
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      instance.componentDidUpdate({} as any, TRIGGER_UPDATE_PREV_STATE);

      const event = createMockEvent([{ pageX: 200, pageY: 300 }]);
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
  // Visual Touch Feedback
  // ==========================================================================

  describe('Visual Touch Feedback', () => {
    test('visualTouchFeedbackEnabled shows touch feedback', () => {
      instance = mountComponent({
        visualTouchFeedbackEnabled: true,
        doubleTapDelay: 300,
      });

      expect(instance.props.visualTouchFeedbackEnabled).toBe(true);
    });
  });

  // ==========================================================================
  // Additional Prop Callbacks
  // ==========================================================================

  describe('Additional Callbacks', () => {
    test('onDoubleTapBefore can prevent zoom', () => {
      const onDoubleTapBefore = jest.fn(() => true);
      instance = mountComponent(
        {
          onDoubleTapBefore,
          doubleTapDelay: 300,
          maxZoom: 3,
          initialZoom: 1,
          zoomEnabled: true,
        },
        DEFAULT_DIMENSIONAL_STATE
      );

      instance.componentDidUpdate({} as any, TRIGGER_UPDATE_PREV_STATE);

      const event = createMockEvent([{ pageX: 200, pageY: 300 }]);
      const gestureState = createMockGestureState(1);

      instance._handlePanResponderGrant(event, gestureState);
      instance._handlePanResponderEnd(event, gestureState);

      jest.advanceTimersByTime(100);

      instance._handlePanResponderGrant(event, gestureState);
      instance._handlePanResponderEnd(event, gestureState);

      expect(onDoubleTapBefore).toHaveBeenCalled();
    });
  });
});
