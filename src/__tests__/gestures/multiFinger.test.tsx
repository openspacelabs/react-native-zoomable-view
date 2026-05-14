/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

// RNGH mock for Phase C gesture tests — captures `Gesture.Manual()` handlers
// and exposes them via `getByGestureTestId(testId)`. Inlined per Phase B/C1
// convention (no shared __support__ module).
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
const TOUCHES_CANCELLED = 4;

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

// Three-finger touch event helper.
const make3FingerEvent = (eventType: number): GestureTouchEvent =>
  makeTouchEvent({
    eventType,
    numberOfTouches: 3,
    allTouches: [
      { id: 0, x: 100, y: 100 },
      { id: 1, x: 200, y: 100 },
      { id: 2, x: 300, y: 100 },
    ],
  });

describe('ReactNativeZoomableView — multi-finger / force-end / recovery', () => {
  it('SPEC-090: 3+ finger move forces non-release end (onPanResponderEnd fires, no onSingleTap)', () => {
    // Source line 1489-1502: numberOfTouches > 2 inside _handlePanResponderMove
    // calls _handlePanResponderEnd(e) with default wasReleased=false. The
    // tap-classification gate (line 1339) requires wasReleased=true, so no
    // onSingleTap. onPanResponderEnd does fire because the consumer
    // dispatch at line 1369 is unconditional on gesture path.
    const onPanResponderEnd = jest.fn();
    const onSingleTap = jest.fn();
    renderRNZV({ onPanResponderEnd, onSingleTap, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();

    // 1 finger lands.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    // 3 fingers (force-end).
    g.handlers.onTouchesDown(make3FingerEvent(TOUCHES_DOWN), sm);
    g.handlers.onTouchesMove(make3FingerEvent(TOUCHES_MOVE), sm);
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
    // No tap classification on force-end.
    jest.advanceTimersByTime(300);
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-090: subsequent 3+ finger moves do not re-fire onPanResponderEnd (guarded by gestureStarted)', () => {
    // Source line 1490: `if (gestureStarted.value)` gate. After force-end
    // sets gestureStarted.value=false, subsequent 3+ finger frames no-op.
    const onPanResponderEnd = jest.fn();
    renderRNZV({ onPanResponderEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesDown(make3FingerEvent(TOUCHES_DOWN), sm);
    g.handlers.onTouchesMove(make3FingerEvent(TOUCHES_MOVE), sm);
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
    // Two more 3-finger move frames — must not re-fire end.
    g.handlers.onTouchesMove(make3FingerEvent(TOUCHES_MOVE), sm);
    g.handlers.onTouchesMove(make3FingerEvent(TOUCHES_MOVE), sm);
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-091: drop back to ≤2 fingers triggers recovery grant — onPanResponderGrant NOT re-fired', () => {
    // Source line 1483-1488: when !gestureStarted.value (post force-end) and
    // numberOfTouches <= 2, _handlePanResponderGrant(e, true) is called as
    // recovery. The recovery path (isRecovery=true at line 832) does NOT
    // dispatch _safeOnPanResponderGrant. The consumer onPanResponderGrant
    // call count must stay at 1.
    const onPanResponderGrant = jest.fn();
    const onPanResponderEnd = jest.fn();
    renderRNZV({ onPanResponderGrant, onPanResponderEnd });
    const g = getGesture();
    const sm = makeStateManager();

    // 1 finger lands → grant fires.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
    // 3 fingers (force-end).
    g.handlers.onTouchesDown(make3FingerEvent(TOUCHES_DOWN), sm);
    g.handlers.onTouchesMove(make3FingerEvent(TOUCHES_MOVE), sm);
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
    // Drop back to 1 finger → recovery grant. Consumer callback NOT re-fired.
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
  });

  it('SPEC-091: drop back to 2 fingers also triggers recovery (no re-grant)', () => {
    const onPanResponderGrant = jest.fn();
    renderRNZV({ onPanResponderGrant });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
    g.handlers.onTouchesDown(make3FingerEvent(TOUCHES_DOWN), sm);
    g.handlers.onTouchesMove(make3FingerEvent(TOUCHES_MOVE), sm);
    // Drop back to 2 fingers.
    g.handlers.onTouchesMove(
      makeTouchEvent({
        eventType: TOUCHES_MOVE,
        numberOfTouches: 2,
        allTouches: [
          { id: 0, x: 100, y: 100 },
          { id: 1, x: 200, y: 100 },
        ],
      }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
  });

  it('SPEC-093: 3+ force-end → 1-finger release fires NO onSingleTap (multiFingerTouchOccurred sentinel)', () => {
    // Source line 1495: multiFingerTouchOccurred set unconditionally in
    // onTouchesDown when numberOfTouches >= 2. _handlePanResponderEnd's
    // tap-classification gate (line 1349) checks this sentinel and skips
    // _resolveAndHandleTap.
    const onSingleTap = jest.fn();
    renderRNZV({ onSingleTap, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    // 3 fingers → force-end.
    g.handlers.onTouchesDown(make3FingerEvent(TOUCHES_DOWN), sm);
    g.handlers.onTouchesMove(make3FingerEvent(TOUCHES_MOVE), sm);
    // Drop to 1 finger → recovery grant.
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    // Release the last finger.
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    jest.advanceTimersByTime(300);
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-058: onTouchesCancelled fires onPanResponderTerminate and skips tap classification', () => {
    // Source line 1634-1642: onTouchesCancelled invokes _handlePanResponderEnd
    // with isCancellation=true. Line 1382-1387: queues
    // _safeOnPanResponderTerminate via runOnJS. The wasReleased=false
    // arg skips tap classification.
    const onPanResponderTerminate = jest.fn();
    const onSingleTap = jest.fn();
    renderRNZV({ onPanResponderTerminate, onSingleTap, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesCancelled(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_CANCELLED,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onPanResponderTerminate).toHaveBeenCalledTimes(1);
    expect(sm.end).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(300);
    // Cancellation path does NOT produce a spurious onSingleTap.
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-058: onPanResponderTerminate payload is (event, zoomableViewEventObject)', () => {
    const onPanResponderTerminate = jest.fn();
    renderRNZV({ onPanResponderTerminate });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 80, y: 60, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesCancelled(
      makeTouchEvent({
        x: 80,
        y: 60,
        eventType: TOUCHES_CANCELLED,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onPanResponderTerminate).toHaveBeenCalledTimes(1);
    const [evt, zEvt] = onPanResponderTerminate.mock.calls[0];
    expect(evt).toBeDefined();
    expect((evt as GestureTouchEvent).allTouches[0]).toMatchObject({
      x: 80,
      y: 60,
    });
    expect(zEvt).toMatchObject({
      zoomLevel: expect.any(Number),
      offsetX: expect.any(Number),
      offsetY: expect.any(Number),
    });
  });

  it('SPEC-150 (real-release-only): onTouchesUp with numberOfTouches > 0 does NOT classify tap', () => {
    // Source line 1627: `if (e.numberOfTouches === 0)` guard. A lift of one
    // of multiple fingers (numberOfTouches > 0) is not a genuine release —
    // _handlePanResponderEnd is not even called.
    const onSingleTap = jest.fn();
    const onPanResponderEnd = jest.fn();
    renderRNZV({ onSingleTap, onPanResponderEnd, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesDown(
      makeTouchEvent({
        eventType: TOUCHES_DOWN,
        numberOfTouches: 2,
        allTouches: [
          { id: 0, x: 100, y: 100 },
          { id: 1, x: 200, y: 100 },
        ],
      }),
      sm
    );
    // Lift one finger (other still down).
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 1,
      }),
      sm
    );
    jest.advanceTimersByTime(300);
    expect(onSingleTap).not.toHaveBeenCalled();
    expect(onPanResponderEnd).not.toHaveBeenCalled();
    expect(sm.end).not.toHaveBeenCalled();
  });

  it('SPEC-130: long-press fires while at 1 finger → 3rd finger arrives → release does NOT produce spurious onSingleTap (sentinel preserved across recovery)', () => {
    // Source: longPressFired.value=true at line 766. The recovery path
    // (_handlePanResponderGrant with isRecovery=true at line 803) does
    // NOT reset longPressFired. So the eventual real release still hits
    // the suppression branch at line 1347-1357 and skips tap classification.
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

    // 1 finger lands.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    // Long-press fires.
    jest.advanceTimersByTime(200);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    // 3 fingers arrive → force-end on next move.
    g.handlers.onTouchesDown(make3FingerEvent(TOUCHES_DOWN), sm);
    g.handlers.onTouchesMove(make3FingerEvent(TOUCHES_MOVE), sm);
    // Drop back to 1 finger → recovery grant.
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_MOVE }),
      sm
    );
    // Real release.
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
    // Long-press already fired → suppression sentinel skips onSingleTap.
    // Source bug-class addressed: PR #151 thread #3179193006.
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-093: cancellation followed by next gesture → onSingleTap on next tap is NOT misclassified as double-tap', () => {
    // Source line 1385-1386 (isCancellation branch): clears
    // doubleTapFirstTapReleaseTimestamp and doubleTapFirstTap. So a
    // tap-cancel-tap sequence within doubleTapDelay does NOT misclassify
    // the second tap as a double-tap of the first.
    const onSingleTap = jest.fn();
    const onDoubleTapBefore = jest.fn();
    renderRNZV({ onSingleTap, onDoubleTapBefore, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();

    // First tap.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // Mid-window: a cancelled gesture (different finger, but same window).
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesCancelled(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_CANCELLED,
        numberOfTouches: 0,
      }),
      sm
    );
    // Another tap within doubleTapDelay.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    jest.advanceTimersByTime(300);
    // Must NOT register as a double-tap.
    expect(onDoubleTapBefore).not.toHaveBeenCalled();
  });

  it('SPEC-091: onFinalize clears firstTouch — next gesture starts a fresh cycle (onPanResponderGrant fires again)', () => {
    // Source line 1643-1645: onFinalize sets firstTouch.value = undefined.
    // Next onTouchesDown then runs the `!firstTouch.value` branch (line
    // 1568) which calls _handlePanResponderGrant(e) (non-recovery) →
    // _safeOnPanResponderGrant fires.
    //
    // Cross-ref PR #151 thread #3179193011: the firstTouch SV must stay
    // stable across finger lifts within a single gesture (between
    // onTouchesDown and onFinalize) — observable here as: the second
    // onTouchesDown within one gesture (recovery branch) does NOT call
    // grant a second time.
    const onPanResponderGrant = jest.fn();
    renderRNZV({ onPanResponderGrant });
    const g = getGesture();
    const sm = makeStateManager();

    // First gesture.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
    // Within the same gesture, a second onTouchesDown for a 2nd finger
    // does NOT fire grant (firstTouch is set).
    g.handlers.onTouchesDown(
      makeTouchEvent({
        eventType: TOUCHES_DOWN,
        numberOfTouches: 2,
        allTouches: [
          { id: 0, x: 100, y: 100 },
          { id: 1, x: 200, y: 100 },
        ],
      }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
    // Release.
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // onFinalize clears firstTouch.
    if (g.handlers.onFinalize) {
      (g.handlers as any).onFinalize();
    }
    // New gesture cycle → grant fires again.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(2);
  });
});
