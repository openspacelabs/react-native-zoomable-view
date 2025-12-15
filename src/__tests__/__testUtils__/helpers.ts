import ReactNativeZoomableView from '../../ReactNativeZoomableView';

// ============================================================================
// Test Constants
// ============================================================================

/**
 * Common test dimensions used across all tests
 */
export const TEST_DIMENSIONS = {
  width: 400,
  height: 600,
  pageX: 100,
  pageY: 100,
};

/**
 * Common test state for components that need dimensions
 */
export const DEFAULT_DIMENSIONAL_STATE = {
  originalWidth: TEST_DIMENSIONS.width,
  originalHeight: TEST_DIMENSIONS.height,
  originalPageX: TEST_DIMENSIONS.pageX,
  originalPageY: TEST_DIMENSIONS.pageY,
};

/**
 * Helper state for triggering componentDidUpdate listeners
 * Used to simulate state changes that trigger listener setup
 */
export const TRIGGER_UPDATE_PREV_STATE = {
  originalWidth: 0,
  originalHeight: 0,
  originalPageX: 0,
  originalPageY: 0,
  originalX: 0,
  originalY: 0,
  pinSize: { width: 0, height: 0 },
};

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates and configures a component instance for testing.
 * Bypasses React mounting to allow direct testing of class methods.
 *
 * @param props - Component props
 * @param initialState - Initial state to set (bypasses setState warning)
 * @returns Configured component instance
 */
export const mountComponent = (props = {}, initialState = {}) => {
  // Merge props with defaultProps since we're bypassing React
  const mergedProps = { ...ReactNativeZoomableView.defaultProps, ...props };
  const newInstance = new ReactNativeZoomableView(mergedProps);

  // Set initial state without calling setState (avoids unmounted warning)
  if (Object.keys(initialState).length > 0) {
    newInstance.state = { ...newInstance.state, ...initialState };
  }

  // Mock the view measurement callback
  if (newInstance.zoomSubjectWrapperRef.current) {
    (newInstance.zoomSubjectWrapperRef.current as any).measure = jest.fn(
      (callback: Function) => {
        // Simulate measured dimensions: x, y, width, height, pageX, pageY
        callback(0, 0, 400, 600, 100, 100);
      }
    );
  }

  return newInstance;
};

/**
 * Creates a mock gesture event with touch coordinates
 */
export const createMockEvent = (
  touches: Array<{ pageX: number; pageY: number }>
) => ({
  nativeEvent: {
    touches: touches.map((t) => ({ ...t, locationX: 0, locationY: 0 })),
    pageX: touches[0]?.pageX || 0,
    pageY: touches[0]?.pageY || 0,
  },
  persist: jest.fn(),
});

/**
 * Creates a mock PanResponder gesture state
 */
export const createMockGestureState = (
  numberActiveTouches: number,
  dx = 0,
  dy = 0,
  moveX = 0,
  moveY = 0,
  vx = 0,
  vy = 0
) => ({
  numberActiveTouches,
  dx,
  dy,
  moveX,
  moveY,
  vx,
  vy,
  stateID: Math.random(),
  x0: 0,
  y0: 0,
});
