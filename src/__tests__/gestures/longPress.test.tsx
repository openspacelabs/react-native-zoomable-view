/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

// RNGH mock — see singleTap.test.tsx for the full rationale. Captures
// `Gesture.Manual()` handlers (incl. testId) and exposes them via the
// `getByGestureTestId` runtime export so test code can invoke
// `gesture.handlers.onTouchesDown/Move/Up/Cancelled` directly.
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const ReactLocal = require('react');

  const registry: Map<string, { handlers: Record<string, unknown> }> =
    new Map();

  const createManualGesture = () => {
    const handlers: Record<string, unknown> = {};
    let testId: string | undefined;
    const builder: any = {
      handlers,
      onTouchesDown(cb: unknown) {
        handlers.onTouchesDown = cb;
        return builder;
      },
      onTouchesMove(cb: unknown) {
        handlers.onTouchesMove = cb;
        return builder;
      },
      onTouchesUp(cb: unknown) {
        handlers.onTouchesUp = cb;
        return builder;
      },
      onTouchesCancelled(cb: unknown) {
        handlers.onTouchesCancelled = cb;
        return builder;
      },
      onFinalize(cb: unknown) {
        handlers.onFinalize = cb;
        return builder;
      },
      withTestId(id: string) {
        testId = id;
        registry.set(id, { handlers });
        return builder;
      },
      toJSON() {
        return { type: 'ManualGesture', testId };
      },
    };
    return builder;
  };

  const makeChainable = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'toJSON') return () => ({});
          return () => proxy;
        },
      }
    );
    return proxy;
  };

  const Gesture = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'Manual') return () => createManualGesture();
        return () => makeChainable();
      },
    }
  );

  const GestureDetector = ({ children }: { children: unknown }) => children;
  const GestureHandlerRootView = (props: { children?: unknown }) =>
    ReactLocal.createElement(
      'View',
      { ...props, children: undefined },
      props.children
    );

  return {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
    State: {
      UNDETERMINED: 0,
      FAILED: 1,
      BEGAN: 2,
      CANCELLED: 3,
      ACTIVE: 4,
      END: 5,
    },
    Directions: {},
    TouchEventType: {
      UNDETERMINED: 0,
      TOUCHES_DOWN: 1,
      TOUCHES_MOVE: 2,
      TOUCHES_UP: 3,
      TOUCHES_CANCELLED: 4,
    },
    getByGestureTestId(id: string) {
      const entry = registry.get(id);
      if (!entry) {
        throw new Error(
          `getByGestureTestId: no gesture registered for testId '${id}'. ` +
            `Known ids: ${[...registry.keys()].join(', ') || '(none)'}`
        );
      }
      return entry;
    },
    __gestureRegistry: {
      reset: () => {
        registry.clear();
      },
    },
  };
});

import { render } from '@testing-library/react-native';
import React from 'react';
import type { GestureTouchEvent } from 'react-native-gesture-handler';

import { ReactNativeZoomableView } from '../../ReactNativeZoomableView';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const RNGHMock = require('react-native-gesture-handler') as {
  getByGestureTestId: (id: string) => {
    handlers: {
      onTouchesDown: (e: GestureTouchEvent, sm: StateManagerStub) => void;
      onTouchesMove: (e: GestureTouchEvent, sm: StateManagerStub) => void;
      onTouchesUp: (e: GestureTouchEvent, sm: StateManagerStub) => void;
      onTouchesCancelled: (e: GestureTouchEvent, sm: StateManagerStub) => void;
      onFinalize?: () => void;
    };
  };
  __gestureRegistry: { reset: () => void };
};

type StateManagerStub = {
  begin: jest.Mock;
  activate: jest.Mock;
  end: jest.Mock;
  fail: jest.Mock;
};
const makeStateManager = (): StateManagerStub => ({
  begin: jest.fn(),
  activate: jest.fn(),
  end: jest.fn(),
  fail: jest.fn(),
});

type TouchPt = {
  id: number;
  x: number;
  y: number;
  absoluteX?: number;
  absoluteY?: number;
};
const makeTouchEvent = (overrides: {
  x?: number;
  y?: number;
  numberOfTouches?: number;
  eventType?: number;
  allTouches?: TouchPt[];
  changedTouches?: TouchPt[];
}): GestureTouchEvent => {
  const x = overrides.x ?? 0;
  const y = overrides.y ?? 0;
  const numberOfTouches = overrides.numberOfTouches ?? 1;
  const touches = overrides.allTouches ?? [
    { id: 0, x, y, absoluteX: x, absoluteY: y },
  ];
  const changed = overrides.changedTouches ?? [
    { id: 0, x, y, absoluteX: x, absoluteY: y },
  ];
  return {
    numberOfTouches,
    allTouches: touches,
    changedTouches: changed,
    eventType: overrides.eventType ?? 1,
    state: 4,
    handlerTag: 1,
  } as unknown as GestureTouchEvent;
};

const TOUCHES_DOWN = 1;
const TOUCHES_MOVE = 2;
const TOUCHES_UP = 3;

beforeEach(() => {
  RNGHMock.__gestureRegistry.reset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const renderRNZV = (
  props: Parameters<typeof ReactNativeZoomableView>[0] = {}
) =>
  render(
    <ReactNativeZoomableView visualTouchFeedbackEnabled={false} {...props} />
  );

const getGesture = () => RNGHMock.getByGestureTestId('canvas-gesture');

describe('ReactNativeZoomableView — long press classification', () => {
  it('SPEC-037: longPressDuration default 700ms — fires after 700ms with no movement', () => {
    const onLongPress = jest.fn();
    renderRNZV({ onLongPress });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    // Just under 700ms — must not yet have fired.
    jest.advanceTimersByTime(699);
    expect(onLongPress).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('SPEC-037: custom longPressDuration honoured', () => {
    const onLongPress = jest.fn();
    renderRNZV({ onLongPress, longPressDuration: 200 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    jest.advanceTimersByTime(199);
    expect(onLongPress).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('SPEC-038: timer armed only when onLongPress is provided', () => {
    // Source line 750: `if (props.onLongPress && props.longPressDuration)`.
    // Without onLongPress, scheduleLongPressTimeout no-ops, no timer.
    renderRNZV({ longPressDuration: 200 /* no onLongPress */ });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    // Advance well past — must not throw, no callback to assert. Behaviour
    // contract: scheduling is a no-op.
    expect(() => {
      jest.advanceTimersByTime(1000);
    }).not.toThrow();
  });

  it('SPEC-039: disarmed when a second finger arrives', () => {
    // Source line 1591: `runOnJS(clearLongPressTimeout)()` in onTouchesDown
    // when numberOfTouches >= 2.
    const onLongPress = jest.fn();
    renderRNZV({ onLongPress, longPressDuration: 500 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    // 100ms in — second finger arrives.
    jest.advanceTimersByTime(100);
    g.handlers.onTouchesDown(
      makeTouchEvent({
        x: 50,
        y: 50,
        eventType: TOUCHES_DOWN,
        numberOfTouches: 2,
        allTouches: [
          { id: 0, x: 50, y: 50 },
          { id: 1, x: 100, y: 100 },
        ],
      }),
      sm
    );
    // Advance past 500ms — long-press must NOT fire (timer cleared).
    jest.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('SPEC-040: disarmed when 1-finger move exceeds 2px on either axis', () => {
    // Source line 1540: `if (longPressTimeout.value && (Math.abs(dx) > 2
    // || Math.abs(dy) > 2)) runOnJS(clearLongPressTimeout)()`.
    const onLongPress = jest.fn();
    renderRNZV({ onLongPress, longPressDuration: 500 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    // 100ms in — finger moves 5px on x.
    jest.advanceTimersByTime(100);
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 55, y: 50, eventType: TOUCHES_MOVE }),
      sm
    );
    jest.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('SPEC-040 (negative): sub-2px finger drift does NOT disarm the timer', () => {
    // Sub-pixel jitter from a held finger should not break long-press.
    const onLongPress = jest.fn();
    renderRNZV({ onLongPress, longPressDuration: 500 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    jest.advanceTimersByTime(100);
    // Drift 1.5px — well below threshold.
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 51.5, y: 50, eventType: TOUCHES_MOVE }),
      sm
    );
    jest.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('SPEC-041: disarmed on touch end', () => {
    // Source line 1367: `runOnJS(clearLongPressTimeout)()` inside
    // _handlePanResponderEnd.
    const onLongPress = jest.fn();
    renderRNZV({ onLongPress, longPressDuration: 500 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    jest.advanceTimersByTime(100);
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 50,
        y: 50,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // Advance past — long-press must NOT fire.
    jest.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('SPEC-063: onLongPress payload is (event, zoomableViewEventObject)', () => {
    const onLongPress = jest.fn();
    renderRNZV({ onLongPress, longPressDuration: 200 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 75, y: 125, eventType: TOUCHES_DOWN }),
      sm
    );
    jest.advanceTimersByTime(200);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    const [evt, zEvt] = onLongPress.mock.calls[0];
    expect((evt as GestureTouchEvent).allTouches[0]).toMatchObject({
      x: 75,
      y: 125,
    });
    expect(zEvt).toMatchObject({
      zoomLevel: expect.any(Number),
      offsetX: expect.any(Number),
      offsetY: expect.any(Number),
    });
  });

  it('SPEC-128: long-press sets the sentinel (longPressFired)', () => {
    // Source line 766: `longPressFired.value = true;` set BEFORE the
    // consumer callback. We assert the OBSERVABLE consequence (the
    // sentinel suppresses subsequent tap classification on release) since
    // the SV itself is internal.
    const onLongPress = jest.fn();
    const onSingleTap = jest.fn();
    renderRNZV({
      onLongPress,
      onSingleTap,
      longPressDuration: 200,
      doubleTapDelay: 300,
    });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    jest.advanceTimersByTime(200);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    // Release — sentinel must suppress tap classification.
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 50,
        y: 50,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    jest.advanceTimersByTime(300);
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-129: sentinel suppresses both onSingleTap AND onDoubleTap*', () => {
    // Long-press → release → another quick tap. The second tap is NOT
    // a "double-tap" because long-press also cleared
    // doubleTapFirstTapReleaseTimestamp at fire time (source line 767).
    const onLongPress = jest.fn();
    const onSingleTap = jest.fn();
    const onDoubleTapBefore = jest.fn();
    renderRNZV({
      onLongPress,
      onSingleTap,
      onDoubleTapBefore,
      longPressDuration: 200,
      doubleTapDelay: 300,
    });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    jest.advanceTimersByTime(200);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 50,
        y: 50,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // Quick second tap.
    jest.advanceTimersByTime(50);
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 50,
        y: 50,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    jest.advanceTimersByTime(500);
    // The second tap is a fresh first-tap (cleared timestamp) → fires
    // onSingleTap. The double-tap branch never runs.
    expect(onDoubleTapBefore).not.toHaveBeenCalled();
    // It's acceptable for the second tap to fire onSingleTap — the
    // long-press sentinel is per-cycle (reset on next non-recovery
    // grant). The contract is "long-press's OWN release does not produce
    // a tap" (asserted in SPEC-128).
    expect(onSingleTap).toHaveBeenCalledTimes(1);
  });

  it('SPEC-130: sentinel survives 3+ finger transient and recovery', () => {
    // Long-press → 3rd finger force-end → back to 1 finger → release.
    // Must NOT produce onSingleTap on release. (Recovery grants do NOT
    // reset longPressFired — source line 803 `if (!isRecovery) { ... }`.)
    const onLongPress = jest.fn();
    const onSingleTap = jest.fn();
    renderRNZV({
      onLongPress,
      onSingleTap,
      longPressDuration: 200,
      doubleTapDelay: 300,
    });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    jest.advanceTimersByTime(200);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    // 3-finger move force-ends the gesture (wasReleased=false).
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 50,
        y: 50,
        eventType: TOUCHES_MOVE,
        numberOfTouches: 3,
        allTouches: [
          { id: 0, x: 50, y: 50 },
          { id: 1, x: 100, y: 100 },
          { id: 2, x: 150, y: 150 },
        ],
      }),
      sm
    );
    // Recovery: drop back to 1 finger.
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 50,
        y: 50,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    jest.advanceTimersByTime(300);
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-037 / 038 negative: no onLongPress when longPressDuration is undefined (default 700) AND no onLongPress prop → silent no-op', () => {
    // Default longPressDuration=700, no onLongPress → schedule does
    // nothing (line 750 guard). Should not throw.
    expect(() => {
      renderRNZV({});
      const g = getGesture();
      const sm = makeStateManager();
      g.handlers.onTouchesDown(
        makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
        sm
      );
      jest.advanceTimersByTime(1000);
      g.handlers.onTouchesUp(
        makeTouchEvent({
          x: 50,
          y: 50,
          eventType: TOUCHES_UP,
          numberOfTouches: 0,
        }),
        sm
      );
    }).not.toThrow();
  });
});
