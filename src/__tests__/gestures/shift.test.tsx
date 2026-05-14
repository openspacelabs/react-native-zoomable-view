/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

// Uses the REAL react-native-gesture-handler module (no per-file
// jest.mock) — `Gesture.Manual()` builder, registry, and `withTestId`
// resolve through RNGH's actual code. Per Phase E probe finding §2:
// the renderer-shim stub needed to bypass the `ReactNativeRenderer-dev`
// load crash lives in `jest.setup.ts`; `getByGestureTestId` is imported
// from the `react-native-gesture-handler/jest-utils` subpath (the only
// place RNGH 2.20.2 exports it).
//
// Touch-event dispatch is still direct-handler invocation
// (`gesture.handlers.onTouchesDown(...)`) — `fireGestureHandler` doesn't
// support `Manual` gestures in RNGH 2.20.2 (per probe §6.5 + the
// `AllGestures` union in `jest-utils/jestUtils.d.ts` omits ManualGesture).
//
// Tests still pass `visualTouchFeedbackEnabled={false}` to skip the
// `AnimatedTouchFeedback` mount path on tap — that component uses RN
// `Animated` which loads `ReactNativeRenderer-dev` on unmount and crashes
// (this is independent of the RNGH mock decision).

import { render } from '@testing-library/react-native';
import React from 'react';
import type { GestureTouchEvent } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ReactNativeZoomableView } from '../../ReactNativeZoomableView';

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
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const renderRNZV = (
  props: Parameters<typeof ReactNativeZoomableView>[0] = {}
) =>
  render(
    <GestureHandlerRootView>
      <ReactNativeZoomableView visualTouchFeedbackEnabled={false} {...props} />
    </GestureHandlerRootView>
  );

// Shape returned by the real `getByGestureTestId` is the underlying
// `ManualGesture` instance — `.handlers` exposes the RNZV-supplied
// onTouches* closures (private API, hence the `any` cast).
type GestureWithHandlers = {
  handlers: {
    onTouchesDown: (e: GestureTouchEvent, sm: StateManagerStub) => void;
    onTouchesMove: (e: GestureTouchEvent, sm: StateManagerStub) => void;
    onTouchesUp: (e: GestureTouchEvent, sm: StateManagerStub) => void;
    onTouchesCancelled: (e: GestureTouchEvent, sm: StateManagerStub) => void;
    onFinalize?: () => void;
  };
};
const getGesture = (): GestureWithHandlers =>
  getByGestureTestId('canvas-gesture') as unknown as GestureWithHandlers;

describe('ReactNativeZoomableView — shift (pan) gesture classification', () => {
  it('SPEC-088: 1-finger move > 2px classifies as shift (observable via onShiftingEnd on release)', () => {
    // Source line 1544 (`isShiftGesture = Math.abs(dx) > 2 || Math.abs(dy) > 2`)
    // and line 1559 (`gestureType.value = 'shift'`). Observable via the
    // gestureType-routed terminal callback at line 1373-1374.
    const onShiftingEnd = jest.fn();
    renderRNZV({ onShiftingEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 110, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 110,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-088 (negative): 1-finger move ≤ 2px does NOT classify as shift (no onShiftingEnd)', () => {
    // Sub-2px drift must not promote to shift. Source: line 1544 strict
    // greater-than (`> 2`).
    const onShiftingEnd = jest.fn();
    const onSingleTap = jest.fn();
    renderRNZV({ onShiftingEnd, onSingleTap, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 101.5, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 101.5,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    jest.advanceTimersByTime(300);
    expect(onShiftingEnd).not.toHaveBeenCalled();
    // Sub-threshold → still classified as tap.
    expect(onSingleTap).toHaveBeenCalledTimes(1);
  });

  it('SPEC-088: y-axis move > 2px also classifies as shift', () => {
    const onShiftingEnd = jest.fn();
    renderRNZV({ onShiftingEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 100, y: 110, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 110,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-064: onShiftingEnd payload is (event, zoomableViewEventObject)', () => {
    const onShiftingEnd = jest.fn();
    renderRNZV({ onShiftingEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 70, y: 50, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 70,
        y: 50,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
    const [evt, zEvt] = onShiftingEnd.mock.calls[0];
    expect(evt).toBeDefined();
    expect((evt as GestureTouchEvent).allTouches[0]).toMatchObject({
      x: 70,
      y: 50,
    });
    expect(zEvt).toMatchObject({
      zoomLevel: expect.any(Number),
      offsetX: expect.any(Number),
      offsetY: expect.any(Number),
      originalWidth: expect.anything(),
      originalHeight: expect.anything(),
    });
  });

  it('SPEC-064: onShiftingEnd fires only when gestureType=shift at release (pinch end fires onZoomEnd, not onShiftingEnd)', () => {
    // Cross-check: a pinch gesture's release routes to onZoomEnd, not
    // onShiftingEnd. Source line 1371-1374 is an if/else.
    const onShiftingEnd = jest.fn();
    const onZoomEnd = jest.fn();
    renderRNZV({ onShiftingEnd, onZoomEnd });
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
          { id: 1, x: 200, y: 200 },
        ],
      }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({
        eventType: TOUCHES_MOVE,
        numberOfTouches: 2,
        allTouches: [
          { id: 0, x: 100, y: 100 },
          { id: 1, x: 210, y: 210 },
        ],
      }),
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
    expect(onShiftingEnd).not.toHaveBeenCalled();
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-014 (gesture path): panEnabled=false → shouldSkipShift returns true → no shift math, no onShiftingEnd', () => {
    // Source: _handleShifting (line 1005) gates on shouldSkipShift. When
    // panEnabled is false, shift math is skipped. The move handler still
    // SETS gestureType='shift' (line 1559) before _handleShifting runs —
    // so onShiftingEnd DOES fire at release because gestureType is latched.
    // What's gated is the offset math inside _handleShifting, not the
    // classification. (See Phase A's shouldSkipShift.test.ts for the
    // predicate-level coverage; this test pins the gesture-path observable
    // behaviour.)
    const onShiftingEnd = jest.fn();
    renderRNZV({ panEnabled: false, onShiftingEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(() => {
      g.handlers.onTouchesMove(
        makeTouchEvent({ x: 120, y: 100, eventType: TOUCHES_MOVE }),
        sm
      );
    }).not.toThrow();
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 120,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // gestureType='shift' was latched at line 1559 before _handleShifting's
    // shouldSkipShift gate fired — so onShiftingEnd still dispatches.
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-108: disablePanOnInitialZoom=true at initialZoom → shouldSkipShift → no shift math', () => {
    // Gate covered at the predicate level in Phase A's shouldSkipShift.test.ts.
    // This pin verifies the gesture-path integration: a 1-finger move >2px
    // at initialZoom with disablePanOnInitialZoom=true still latches
    // gestureType='shift' and fires onShiftingEnd at release (the gate
    // is on the math inside _handleShifting, not on classification).
    const onShiftingEnd = jest.fn();
    renderRNZV({
      disablePanOnInitialZoom: true,
      initialZoom: 1,
      onShiftingEnd,
    });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 120, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 120,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-110: no momentum — after release, no further callbacks fire as timers advance', () => {
    // RNZV does NOT call withDecay / Animated.decay on shift release. The
    // contract is the offsets freeze at the released position. Observable
    // proxy: no callbacks fire after release as we advance timers, and
    // gestureStarted (via ref) is false after release.
    const onShiftingEnd = jest.fn();
    const onPanResponderEnd = jest.fn();
    renderRNZV({ onShiftingEnd, onPanResponderEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 120, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 120,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
    // Advance time well past any potential momentum window — no further
    // dispatches; the gesture ended at release.
    jest.advanceTimersByTime(2000);
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-088: gestureType=shift suppresses onSingleTap on release', () => {
    // Source line 1339-1340: tap classification only runs `if (wasReleased
    // && !gestureType.value)`. Once gestureType='shift' is set, the release
    // skips _resolveAndHandleTap entirely.
    const onSingleTap = jest.fn();
    const onShiftingEnd = jest.fn();
    renderRNZV({ onSingleTap, onShiftingEnd, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 115, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 115,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    jest.advanceTimersByTime(300);
    expect(onSingleTap).not.toHaveBeenCalled();
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-088 (sequential moves): shift gestureType stays latched across multiple move frames', () => {
    // Source line 1553-1558: the re-seed of lastGestureCenterPosition is
    // gated on `gestureType.value !== 'shift'`. Subsequent shift frames
    // keep gestureType='shift' without churning state.
    const onShiftingEnd = jest.fn();
    renderRNZV({ onShiftingEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 110, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 120, y: 100, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 130, y: 105, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 130,
        y: 105,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
  });
});
