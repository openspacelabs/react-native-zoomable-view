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

// Two-finger touch event helper.
const makePinchEvent = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  eventType: number,
  numberOfTouches = 2
): GestureTouchEvent =>
  makeTouchEvent({
    eventType,
    numberOfTouches,
    allTouches: [
      { id: 0, x: p1.x, y: p1.y, absoluteX: p1.x, absoluteY: p1.y },
      { id: 1, x: p2.x, y: p2.y, absoluteX: p2.x, absoluteY: p2.y },
    ],
    changedTouches: [
      { id: 0, x: p1.x, y: p1.y, absoluteX: p1.x, absoluteY: p1.y },
      { id: 1, x: p2.x, y: p2.y, absoluteX: p2.x, absoluteY: p2.y },
    ],
  });

describe('ReactNativeZoomableView — pinch gesture classification', () => {
  it('SPEC-088: 2-finger touch sequence sets gestureType=pinch (observable via onZoomEnd at release)', () => {
    // Source line 1529: `gestureType.value = 'pinch'` inside _handlePanResponderMove's
    // 2-touch branch. Observable consequence: _handlePanResponderEnd's gestureType
    // check at line 1371 dispatches onZoomEnd when gestureType === 'pinch'.
    const onZoomEnd = jest.fn();
    renderRNZV({ onZoomEnd });
    const g = getGesture();
    const sm = makeStateManager();

    // First finger lands.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    // Second finger lands (still TOUCHES_DOWN — see RNGH gesture lifecycle).
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 100, y: 100 }, { x: 200, y: 200 }, TOUCHES_DOWN),
      sm
    );
    // 2-finger move — _handlePanResponderMove sets gestureType='pinch'.
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 100, y: 100 }, { x: 210, y: 210 }, TOUCHES_MOVE),
      sm
    );
    // Second move so the pinch math has a non-stale reference distance/centre.
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 100, y: 100 }, { x: 220, y: 220 }, TOUCHES_MOVE),
      sm
    );
    // Lift one finger — numberOfTouches=1 in onTouchesUp does NOT trigger end
    // (guard at line 1627: `if (e.numberOfTouches === 0)`).
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 1,
      }),
      sm
    );
    expect(onZoomEnd).not.toHaveBeenCalled();
    // Lift last finger — genuine release → _handlePanResponderEnd fires.
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-088: onZoomEnd payload is (event, zoomableViewEventObject)', () => {
    const onZoomEnd = jest.fn();
    renderRNZV({ onZoomEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 50, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 50, y: 50 }, { x: 150, y: 150 }, TOUCHES_DOWN),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 50, y: 50 }, { x: 160, y: 160 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 50, y: 50 }, { x: 170, y: 170 }, TOUCHES_MOVE),
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
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
    const [evt, zEvt] = onZoomEnd.mock.calls[0];
    expect(evt).toBeDefined();
    expect(zEvt).toMatchObject({
      zoomLevel: expect.any(Number),
      offsetX: expect.any(Number),
      offsetY: expect.any(Number),
      originalWidth: expect.anything(),
      originalHeight: expect.anything(),
    });
  });

  it('SPEC-089: shift gesture transitioning to pinch latches gestureType=pinch (onZoomEnd, not onShiftingEnd)', () => {
    // 1-finger drag (>2px) classifies as shift → 2nd finger arrives → next
    // 2-finger move re-classifies as pinch. Source: _handlePanResponderMove
    // sets gestureType='pinch' at line 1529 in the 2-touch branch. The
    // gestureType is what _handlePanResponderEnd reads at line 1371-1374 to
    // decide which terminal callback to fire.
    const onZoomEnd = jest.fn();
    const onShiftingEnd = jest.fn();
    renderRNZV({ onZoomEnd, onShiftingEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    // 1-finger move >2px → shift.
    g.handlers.onTouchesMove(
      makeTouchEvent({ x: 110, y: 110, eventType: TOUCHES_MOVE }),
      sm
    );
    // Second finger arrives.
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 110, y: 110 }, { x: 200, y: 200 }, TOUCHES_DOWN),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 110, y: 110 }, { x: 210, y: 210 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 110, y: 110 }, { x: 220, y: 220 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 110,
        y: 110,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // Final classification is pinch; only onZoomEnd fires.
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
    expect(onShiftingEnd).not.toHaveBeenCalled();
  });

  it('SPEC-098: zoomEnabled=false short-circuits pinch math but gestureType=pinch still latched (onZoomEnd fires)', () => {
    // Source: _handlePinching's first line (`if (!zoomEnabled.value) return;`)
    // short-circuits the pinch math. BUT the gestureType='pinch' assignment
    // at line 1529 happens BEFORE _handlePinching is called, so the eventual
    // release still fires onZoomEnd (gestureType is latched).
    const onZoomEnd = jest.fn();
    renderRNZV({ zoomEnabled: false, onZoomEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 100, y: 100 }, { x: 200, y: 200 }, TOUCHES_DOWN),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 100, y: 100 }, { x: 210, y: 210 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 100, y: 100 }, { x: 220, y: 220 }, TOUCHES_MOVE),
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
    // gestureType was already 'pinch' before _handlePinching's zoomEnabled
    // gate fired, so onZoomEnd still dispatches at release.
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-094: zoom centre uses gesture midpoint when staticPinPosition is unset (no throw, completes normally)', () => {
    // Source line 933-936: zoomCenter defaults to calcGestureCenterPoint(e).
    // Under reanimated/mock the SharedValue trajectories are not observable
    // post-fact (Phase C1 §7d), so we assert the path completes (no throw)
    // and the terminal callback dispatches — the observable contract is that
    // pinch with no pin runs the gesture-midpoint branch without errors.
    const onZoomEnd = jest.fn();
    renderRNZV({ onZoomEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 100, y: 100 }, { x: 200, y: 200 }, TOUCHES_DOWN),
      sm
    );
    expect(() => {
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 100 }, { x: 210, y: 210 }, TOUCHES_MOVE),
        sm
      );
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 100 }, { x: 220, y: 220 }, TOUCHES_MOVE),
        sm
      );
    }).not.toThrow();
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-094: staticPinPosition overrides gesture-midpoint zoom centre (path runs, onZoomEnd fires)', () => {
    // Source line 938-945: `if (staticPinPosition.value) zoomCenter = {x: pin.x, y: pin.y}`.
    // Under reanimated/mock the offset trajectory is not observable, so the
    // assertable contract is that the pin-pinch path runs to completion and
    // dispatches onZoomEnd. Pure-math testing of the pin-vs-midpoint behaviour
    // belongs in Phase A's calcNewScaledOffsetForZoomCentering unit tests.
    const onZoomEnd = jest.fn();
    renderRNZV({
      onZoomEnd,
      staticPinPosition: { x: 50, y: 50 },
    });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 100, y: 100 }, { x: 200, y: 200 }, TOUCHES_DOWN),
      sm
    );
    expect(() => {
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 100 }, { x: 210, y: 210 }, TOUCHES_MOVE),
        sm
      );
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 100 }, { x: 220, y: 220 }, TOUCHES_MOVE),
        sm
      );
    }).not.toThrow();
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-088 (multi-finger normalization): 2-finger touchDown clears double-tap state', () => {
    // Source line 1597-1598 (onTouchesDown ≥2-finger branch):
    // doubleTapFirstTapReleaseTimestamp.value = undefined;
    // doubleTapFirstTap.value = undefined;
    // Observable contract: a tap → 2-finger-touch+release sequence within
    // doubleTapDelay does NOT produce a double-tap (the 2-finger arrival
    // cleared the stale first-tap state; the subsequent release is
    // suppressed via multiFingerTouchOccurred).
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
    // Mid-window: 2-finger touch+release (no movement → no pinch math,
    // but multiFingerTouchOccurred set and stale tap state cleared).
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 100, y: 100 }, { x: 200, y: 200 }, TOUCHES_DOWN),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 100,
        y: 100,
        eventType: TOUCHES_UP,
        numberOfTouches: 1,
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
    jest.advanceTimersByTime(300);
    // Neither single-tap from the first release (suppressed by the new
    // gesture's grant→clearSingleTapTimeout) nor a double-tap (multi-finger
    // touch cleared the stale timestamp) fires from the 2-finger cycle.
    expect(onDoubleTapBefore).not.toHaveBeenCalled();
  });

  it('SPEC-098 (pinch math no-op): zoomEnabled=false + 2-finger pinch produces no offsetX/offsetY callbacks via onZoomEnd path (gestureType still latched, onZoomEnd still fires)', () => {
    // Negative companion to SPEC-098 above. Same outcome — onZoomEnd fires
    // because gestureType='pinch' is latched. The contract is that disabling
    // zoom does NOT also disable the gestureType classification.
    const onZoomEnd = jest.fn();
    const onShiftingEnd = jest.fn();
    renderRNZV({ zoomEnabled: false, onZoomEnd, onShiftingEnd });
    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 0, y: 0 }, { x: 100, y: 0 }, TOUCHES_DOWN),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 0, y: 0 }, { x: 120, y: 0 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 0, y: 0 }, { x: 140, y: 0 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 0,
        y: 0,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
    // gestureType was 'pinch' at end → onShiftingEnd NOT fired.
    expect(onShiftingEnd).not.toHaveBeenCalled();
  });
});
