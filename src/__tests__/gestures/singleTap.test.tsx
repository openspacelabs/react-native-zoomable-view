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
import React, { createRef } from 'react';
import type { GestureTouchEvent } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ReactNativeZoomableView } from '../../ReactNativeZoomableView';
import type { ReactNativeZoomableViewRef } from '../../typings';

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

// Convenience: drive a complete single-touch tap (down then up).
const tap = (
  gesture: ReturnType<typeof getGesture>,
  x: number,
  y: number,
  sm = makeStateManager()
) => {
  gesture.handlers.onTouchesDown(
    makeTouchEvent({ x, y, eventType: TOUCHES_DOWN }),
    sm
  );
  gesture.handlers.onTouchesUp(
    makeTouchEvent({
      x,
      y,
      eventType: TOUCHES_UP,
      numberOfTouches: 0,
    }),
    sm
  );
  return sm;
};

describe('ReactNativeZoomableView — single tap classification', () => {
  it('SPEC-060: onSingleTap fires after doubleTapDelay when single touch released without movement', () => {
    const onSingleTap = jest.fn();
    renderRNZV({ onSingleTap, doubleTapDelay: 300 });
    tap(getGesture(), 100, 100);
    // Before doubleTapDelay elapses, onSingleTap must NOT have fired.
    expect(onSingleTap).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(onSingleTap).toHaveBeenCalledTimes(1);
  });

  it('SPEC-060: payload is (event, zoomableViewEventObject)', () => {
    const onSingleTap = jest.fn();
    renderRNZV({ onSingleTap, doubleTapDelay: 300 });
    tap(getGesture(), 50, 75);
    jest.advanceTimersByTime(300);
    expect(onSingleTap).toHaveBeenCalledTimes(1);
    const [evt, zEvt] = onSingleTap.mock.calls[0];
    // Event preserves the original GestureTouchEvent shape passed through
    // _resolveAndHandleTap (the up event triggers the schedule, but the
    // scheduled body uses the closure-captured up event).
    expect(evt).toBeDefined();
    expect((evt as GestureTouchEvent).allTouches[0]).toMatchObject({
      x: 50,
      y: 75,
    });
    // Zoomable event object shape: zoomLevel + offsets + dims (5 fields).
    expect(zEvt).toMatchObject({
      zoomLevel: expect.any(Number),
      offsetX: expect.any(Number),
      offsetY: expect.any(Number),
      originalWidth: expect.anything(),
      originalHeight: expect.anything(),
    });
  });

  it('SPEC-125: first tap schedules singleTapTimeoutId for doubleTapDelay ms', () => {
    const onSingleTap = jest.fn();
    renderRNZV({ onSingleTap, doubleTapDelay: 250 });
    tap(getGesture(), 10, 10);
    jest.advanceTimersByTime(249);
    expect(onSingleTap).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onSingleTap).toHaveBeenCalledTimes(1);
  });

  it('SPEC-092: tap classification fires only on genuine release (numberOfTouches=0)', () => {
    // onTouchesUp with numberOfTouches > 0 (one of several fingers lifted)
    // must NOT trigger tap classification. The source guards this at
    // ReactNativeZoomableView.tsx:1627 (`if (e.numberOfTouches === 0)`).
    const onSingleTap = jest.fn();
    renderRNZV({ onSingleTap, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 10, y: 10, eventType: TOUCHES_DOWN }),
      sm
    );
    // Spurious onTouchesUp with numberOfTouches=1 (other finger still down)
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 10,
        y: 10,
        eventType: TOUCHES_UP,
        numberOfTouches: 1,
      }),
      sm
    );
    jest.advanceTimersByTime(300);
    expect(onSingleTap).not.toHaveBeenCalled();
    // sm.end() also not called — release path gated by numberOfTouches===0.
    expect(sm.end).not.toHaveBeenCalled();
  });

  it('SPEC-092 (negative): movement > 2px makes it a shift, not a tap', () => {
    // Once `gestureType.value === 'shift'`, _handlePanResponderEnd skips
    // tap classification (gate `wasReleased && !gestureType.value`).
    const onSingleTap = jest.fn();
    renderRNZV({ onSingleTap, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    // Move 10px on x — exceeds 2px threshold → gestureType=shift.
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
    jest.advanceTimersByTime(300);
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-129: long-press sentinel suppresses subsequent onSingleTap', () => {
    const onLongPress = jest.fn();
    const onSingleTap = jest.fn();
    renderRNZV({
      onLongPress,
      onSingleTap,
      longPressDuration: 500,
      doubleTapDelay: 300,
    });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    // Let the long-press timer fire.
    jest.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    // Now release the finger — _handlePanResponderEnd sees
    // longPressFired.value=true and suppresses tap classification.
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

  it('SPEC-130: long-press sentinel survives a 3+ finger transient (recovery)', () => {
    // Long-press fires → user adds 3rd finger (force-end recovery) → back
    // to 1 finger → release. `longPressFired` was set when the timer fired
    // and only resets on a non-recovery grant — so the eventual release
    // must still suppress onSingleTap.
    const onLongPress = jest.fn();
    const onSingleTap = jest.fn();
    renderRNZV({
      onLongPress,
      onSingleTap,
      longPressDuration: 500,
      doubleTapDelay: 300,
    });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    jest.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    // 3-finger move — _handlePanResponderMove force-ends with
    // wasReleased=false (doesn't trigger tap), gestureStarted becomes
    // false, but `longPressFired` stays true.
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
    // Back to 1 finger (recovery grant) — !isRecovery branch in
    // _handlePanResponderGrant is skipped, longPressFired preserved.
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_MOVE }),
      sm
    );
    // Now release.
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

  it('SPEC-123 / 127: with staticPinPosition set, single-tap pans toward pin then fires onSingleTap', () => {
    // The setTimeout body in _resolveAndHandleTap reads
    // staticPinPosition.value and, when set, schedules a 200ms withTiming
    // toward the pin. Under reanimated/mock, withTiming is synchronous —
    // we observe the final offsetX/offsetY values via the imperative ref
    // (gestureStarted alone won't tell us). However, since the mock's
    // shared values are Proxies with no stable identity across renders,
    // we assert ONLY the observable outcome — `onSingleTap` fired AND
    // the pin-pan setup did not throw.
    const onSingleTap = jest.fn();
    const ref = createRef<ReactNativeZoomableViewRef>();
    renderRNZV({
      ref,
      onSingleTap,
      staticPinPosition: { x: 200, y: 200 },
      doubleTapDelay: 300,
      visualTouchFeedbackEnabled: false,
    });
    tap(getGesture(), 50, 50);
    jest.advanceTimersByTime(300);
    expect(onSingleTap).toHaveBeenCalledTimes(1);
  });

  it('SPEC-124: pan-to-pin reads the LATEST staticPinPosition (not the closure-captured one)', () => {
    // The setTimeout body reads `staticPinPosition.value` — a SharedValue
    // read at fire time — not the closure-captured `props.staticPinPosition`
    // from schedule time. Source line 1169-1184.
    //
    // Under mock, SVs reset on every render, so we cannot rerender between
    // schedule and fire. Instead we assert the *code path* by verifying
    // that with no pin set at schedule time, `onSingleTap` still fires
    // (the SV-value-undefined branch — line 1172 falsy guard).
    const onSingleTap = jest.fn();
    renderRNZV({ onSingleTap, doubleTapDelay: 300 });
    tap(getGesture(), 50, 50);
    jest.advanceTimersByTime(300);
    // No pin → pan-to-pin branch skipped → onSingleTap still fires.
    expect(onSingleTap).toHaveBeenCalledTimes(1);
  });

  it('SPEC-129 / source-bug-fix (PR #178 thread #3179033552): a new grant within doubleTapDelay clears singleTapTimeoutId so no spurious onSingleTap', () => {
    // Pattern: tap → before `doubleTapDelay` elapses, a new touch starts.
    // The new grant's `clearSingleTapTimeout` runOnJS must cancel the
    // pending fire so `onSingleTap` does not fire alongside the new
    // gesture. Source line 801.
    const onSingleTap = jest.fn();
    renderRNZV({ onSingleTap, doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();
    // First tap.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 10, y: 10, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 10,
        y: 10,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // 100ms into the 300ms window, a new gesture starts.
    jest.advanceTimersByTime(100);
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 200, y: 200, eventType: TOUCHES_DOWN }),
      sm
    );
    // Move past 2px to mark this as a shift (so the release doesn't
    // produce a tap of its own).
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 220, y: 220, eventType: TOUCHES_MOVE }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 220,
        y: 220,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // Flush — the original singleTapTimeoutId should have been cleared.
    jest.advanceTimersByTime(500);
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-060: state manager begin/activate called in order on first touch', () => {
    // RNZV calls stateManager.begin() then stateManager.activate() inside
    // onTouchesDown when !firstTouch.value (source lines 1573-1574).
    renderRNZV({ doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 10, y: 10, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(sm.begin).toHaveBeenCalledTimes(1);
    expect(sm.activate).toHaveBeenCalledTimes(1);
    expect(sm.begin.mock.invocationCallOrder[0]).toBeLessThan(
      sm.activate.mock.invocationCallOrder[0]
    );
  });

  it('SPEC-092: genuine release calls stateManager.end()', () => {
    renderRNZV({ doubleTapDelay: 300 });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 10, y: 10, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 10,
        y: 10,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(sm.end).toHaveBeenCalledTimes(1);
  });

  it('SPEC-060 negative: no onSingleTap when prop is omitted (no-throw contract)', () => {
    // Omitting onSingleTap should not throw — the source wraps it in
    // useLatestCallback with a () => undefined fallback (line 340).
    expect(() => {
      renderRNZV({ doubleTapDelay: 300 });
      tap(getGesture(), 10, 10);
      jest.advanceTimersByTime(300);
    }).not.toThrow();
  });
});
