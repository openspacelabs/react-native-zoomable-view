/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

// RNGH mock for Phase C gesture tests — captures `Gesture.Manual()` handlers
// and exposes them via `getByGestureTestId(testId)`. Replaces the
// pass-through Proxy mock used in Phase B (which dropped `withTestId`).
// See `singleTap.test.tsx` for the full rationale.
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

describe('ReactNativeZoomableView — onPanResponderMoveWorklet intercept (SPEC-059)', () => {
  // ----- Test A: worklet returns false → library handles move normally -----

  it('SPEC-059: returning false from onPanResponderMoveWorklet lets the library handle the move (onShiftingEnd fires on release)', () => {
    // Falsy return: source line 1425 takes the `if (worklet(...))` branch as
    // false → falls through to the standard 1-finger / 2-finger gesture
    // branches. A 1-finger move >2px sets `gestureType.value = 'shift'`
    // (line 1559) → on release, `_handlePanResponderEnd` dispatches
    // `_safeOnShiftingEnd` (line 1374) → consumer's `onShiftingEnd` fires.
    const onPanResponderMoveWorklet = (
      e: GestureTouchEvent,
      evt: unknown
    ): boolean => {
      'worklet';
      // Touch consumed-args so eslint no-unused-vars stays quiet — both
      // params are part of the contract surface exercised by Test E.
      void e;
      void evt;
      return false;
    };
    const onShiftingEnd = jest.fn();
    renderRNZV({ onPanResponderMoveWorklet, onShiftingEnd });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 50,
        y: 0,
        numberOfTouches: 1,
        eventType: TOUCHES_MOVE,
      }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 50,
        y: 0,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
  });

  // ----- Test B: worklet returns true → library short-circuits (onShiftingEnd does NOT fire) -----

  it('SPEC-059: returning true from onPanResponderMoveWorklet short-circuits internal handling (no onShiftingEnd on release)', () => {
    // Truthy return: source line 1426-1477 sets `externallyHandled.value=true`
    // and early-returns BEFORE the shift/pinch classification branches.
    // `gestureType.value` stays `undefined` → on release,
    // `_handlePanResponderEnd` skips both `onZoomEnd` and `onShiftingEnd`
    // (gated on `gestureType.value === 'pinch' | 'shift'`).
    const onPanResponderMoveWorklet = (
      e: GestureTouchEvent,
      evt: unknown
    ): boolean => {
      'worklet';
      void e;
      void evt;
      return true;
    };
    const onShiftingEnd = jest.fn();
    const onZoomEnd = jest.fn();
    renderRNZV({ onPanResponderMoveWorklet, onShiftingEnd, onZoomEnd });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 50,
        y: 0,
        numberOfTouches: 1,
        eventType: TOUCHES_MOVE,
      }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 50,
        y: 0,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onShiftingEnd).not.toHaveBeenCalled();
    expect(onZoomEnd).not.toHaveBeenCalled();
  });

  // ----- Test C: truthy then falsy → externallyHandled latches for the cycle -----

  it('SPEC-059: any truthy return latches externallyHandled for the cycle (subsequent falsy moves do not un-latch)', () => {
    // `externallyHandled` is the cycle-scoped sentinel set at source line
    // 1433 and reset only on `_handlePanResponderGrant` (line 813) or in
    // `_handlePanResponderEnd`'s suppression branch (line 1354). A consumer
    // toggling intercept off mid-gesture allows the library to start
    // running shift math on subsequent moves (gestureType becomes 'shift'),
    // but on release the tap-classification gate at line 1347 still sees
    // `externallyHandled=true` and suppresses tap classification — onSingleTap
    // never fires for a cycle that had ANY intercepted frame.
    let shouldIntercept = true;
    const onPanResponderMoveWorklet = (
      e: GestureTouchEvent,
      evt: unknown
    ): boolean => {
      'worklet';
      void e;
      void evt;
      return shouldIntercept;
    };
    const onSingleTap = jest.fn();
    const onShiftingEnd = jest.fn();
    renderRNZV({
      onPanResponderMoveWorklet,
      onSingleTap,
      onShiftingEnd,
      doubleTapDelay: 100,
    });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    // Frame 1: intercept ON — externallyHandled latches.
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 30,
        y: 0,
        numberOfTouches: 1,
        eventType: TOUCHES_MOVE,
      }),
      sm
    );
    // Frame 2: intercept OFF — library now runs shift math (sets
    // gestureType='shift') but the latched externallyHandled survives.
    shouldIntercept = false;
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 60,
        y: 0,
        numberOfTouches: 1,
        eventType: TOUCHES_MOVE,
      }),
      sm
    );
    // Release.
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 60,
        y: 0,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    jest.advanceTimersByTime(100);
    // gestureType='shift' was assigned in frame 2 → onShiftingEnd DOES fire.
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
    // But tap classification stays suppressed (`wasReleased && !gestureType`
    // is false here because gestureType='shift'; even if it were undefined,
    // externallyHandled would short-circuit the tap-scheduling branch).
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  // ----- Test D: intercept during a single move + release MUST NOT fire onSingleTap (sentinel suppression) -----

  it('SPEC-059: intercepted drag does not produce a spurious onSingleTap on release', () => {
    // Without externallyHandled, a truthy intercept that bypasses the
    // shift-classification branch leaves `gestureType.value === undefined`,
    // and the release path's tap classification (`if (wasReleased &&
    // !gestureType.value)`) would otherwise fall through to
    // `_resolveAndHandleTap` and fire a phantom `onSingleTap`. The
    // `externallyHandled` sentinel at line 1350 closes this gap.
    const onPanResponderMoveWorklet = (
      e: GestureTouchEvent,
      evt: unknown
    ): boolean => {
      'worklet';
      void e;
      void evt;
      return true;
    };
    const onSingleTap = jest.fn();
    renderRNZV({
      onPanResponderMoveWorklet,
      onSingleTap,
      doubleTapDelay: 100,
    });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    // Single intercepted move (consumer ate the drag).
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 5,
        y: 0,
        numberOfTouches: 1,
        eventType: TOUCHES_MOVE,
      }),
      sm
    );
    // Release.
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 5,
        y: 0,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // Even after advancing past `doubleTapDelay`, onSingleTap must NOT fire —
    // externallyHandled suppresses tap classification at source line 1350.
    jest.advanceTimersByTime(100);
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  // ----- Test E: worklet receives (GestureTouchEvent, ZoomableViewEvent) -----

  it('SPEC-059: worklet receives the move event and the ZoomableViewEvent object on every move tick', () => {
    // Source line 1425 invokes the worklet as
    // `onPanResponderMoveWorkletShared.value.fn(e, _getZoomableViewEventObject())`.
    // First arg is the same GestureTouchEvent passed to the move handler;
    // second arg is the standard ZoomableViewEvent (zoomLevel, offsets, dims).
    const calls: Array<{ e: GestureTouchEvent; evt: unknown }> = [];
    const onPanResponderMoveWorklet = (
      e: GestureTouchEvent,
      evt: unknown
    ): boolean => {
      'worklet';
      calls.push({ e, evt });
      return false;
    };
    renderRNZV({ onPanResponderMoveWorklet });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 12,
        y: 34,
        numberOfTouches: 1,
        eventType: TOUCHES_MOVE,
      }),
      sm
    );
    expect(calls).toHaveLength(1);
    const [{ e, evt }] = calls;
    expect(e.allTouches[0]).toMatchObject({ x: 12, y: 34 });
    expect(e.numberOfTouches).toBe(1);
    // ZoomableViewEvent shape: zoomLevel + offsets + dims (5 fields).
    expect(evt).toMatchObject({
      zoomLevel: expect.any(Number),
      offsetX: expect.any(Number),
      offsetY: expect.any(Number),
      originalWidth: expect.anything(),
      originalHeight: expect.anything(),
    });
  });
});
