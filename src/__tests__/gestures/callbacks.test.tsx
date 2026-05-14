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
const TOUCHES_CANCELLED = 4;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const renderRNZV = (
  props: Parameters<typeof ReactNativeZoomableView>[0] = {},
  ref?: React.Ref<ReactNativeZoomableViewRef>
) =>
  render(
    <GestureHandlerRootView>
      <ReactNativeZoomableView
        ref={ref}
        visualTouchFeedbackEnabled={false}
        {...props}
      />
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

describe('ReactNativeZoomableView — pan-responder callbacks (SPEC-056-058, 081, 082, 143)', () => {
  // ----- SPEC-056: onPanResponderGrant fires on first touch-down -----

  it('SPEC-056: onPanResponderGrant fires on the first touch-down of a gesture', () => {
    const onPanResponderGrant = jest.fn();
    renderRNZV({ onPanResponderGrant });
    const sm = makeStateManager();
    getGesture().handlers.onTouchesDown(
      makeTouchEvent({ x: 50, y: 60, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
    const [evt, zEvt] = onPanResponderGrant.mock.calls[0];
    expect((evt as GestureTouchEvent).allTouches[0]).toMatchObject({
      x: 50,
      y: 60,
    });
    expect(zEvt).toMatchObject({
      zoomLevel: expect.any(Number),
      offsetX: expect.any(Number),
      offsetY: expect.any(Number),
    });
  });

  it('SPEC-056: onPanResponderGrant NOT re-fired during 3+ finger recovery', () => {
    // Recovery branch: `_handlePanResponderGrant(e, /*isRecovery=*/ true)`
    // is invoked from `_handlePanResponderMove` when a 3+ finger transient
    // force-ended the active gesture and then dropped back to ≤2 fingers
    // (see ReactNativeZoomableView.tsx:1483-1488). The `if (!isRecovery)`
    // gate at line 803 must keep `onPanResponderGrant` from re-firing.
    const onPanResponderGrant = jest.fn();
    renderRNZV({ onPanResponderGrant });
    const g = getGesture();
    const sm = makeStateManager();
    // 1) First touch — fires grant once.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 100, y: 100, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
    // 2) 3+ fingers force-end via a move with numberOfTouches > 2.
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 100,
        y: 100,
        numberOfTouches: 3,
        eventType: TOUCHES_MOVE,
        allTouches: [
          { id: 0, x: 100, y: 100 },
          { id: 1, x: 110, y: 110 },
          { id: 2, x: 120, y: 120 },
        ],
      }),
      sm
    );
    // 3) Drop back to 2 fingers → recovery grant (isRecovery=true).
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 100,
        y: 100,
        numberOfTouches: 2,
        eventType: TOUCHES_MOVE,
        allTouches: [
          { id: 0, x: 100, y: 100 },
          { id: 1, x: 110, y: 110 },
        ],
      }),
      sm
    );
    // Grant must STILL be exactly 1 — recovery does not re-fire it.
    expect(onPanResponderGrant).toHaveBeenCalledTimes(1);
  });

  // ----- SPEC-057: onPanResponderEnd fires unconditionally on every gesture end -----

  it('SPEC-057: onPanResponderEnd fires on natural release (numberOfTouches=0)', () => {
    const onPanResponderEnd = jest.fn();
    renderRNZV({ onPanResponderEnd });
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
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-057: onPanResponderEnd fires on 3+ finger force-end via move handler', () => {
    // The 3+ finger force-end path (ReactNativeZoomableView.tsx:1499) invokes
    // `_handlePanResponderEnd(e)` with wasReleased defaulting to false — but
    // the `runOnJS(_safeOnPanResponderEnd)` dispatch at line 1369 fires
    // UNCONDITIONALLY. Consumer callback must fire even though tap
    // classification is suppressed.
    const onPanResponderEnd = jest.fn();
    renderRNZV({ onPanResponderEnd });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    expect(onPanResponderEnd).toHaveBeenCalledTimes(0);
    g.handlers.onTouchesMove(
      makeTouchEvent({
        x: 0,
        y: 0,
        numberOfTouches: 3,
        eventType: TOUCHES_MOVE,
        allTouches: [
          { id: 0, x: 0, y: 0 },
          { id: 1, x: 10, y: 10 },
          { id: 2, x: 20, y: 20 },
        ],
      }),
      sm
    );
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
  });

  it('SPEC-057: onPanResponderEnd fires on RNGH cancellation', () => {
    const onPanResponderEnd = jest.fn();
    renderRNZV({ onPanResponderEnd });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 5, y: 5, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesCancelled(
      makeTouchEvent({
        x: 5,
        y: 5,
        eventType: TOUCHES_CANCELLED,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
  });

  // ----- SPEC-058: onPanResponderTerminate fires AFTER onPanResponderEnd in the cancellation branch -----

  it('SPEC-058: onPanResponderTerminate fires only on RNGH cancellation, not natural release', () => {
    const onPanResponderTerminate = jest.fn();
    renderRNZV({ onPanResponderTerminate });
    const g = getGesture();
    const sm = makeStateManager();
    // Natural release — terminate must NOT fire.
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
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
    expect(onPanResponderTerminate).not.toHaveBeenCalled();
  });

  it('SPEC-058: onPanResponderTerminate fires AFTER onPanResponderEnd in the cancellation branch', () => {
    const onPanResponderEnd = jest.fn();
    const onPanResponderTerminate = jest.fn();
    renderRNZV({ onPanResponderEnd, onPanResponderTerminate });
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 12, y: 12, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesCancelled(
      makeTouchEvent({
        x: 12,
        y: 12,
        eventType: TOUCHES_CANCELLED,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
    expect(onPanResponderTerminate).toHaveBeenCalledTimes(1);
    // Order: end before terminate (source line 1369 dispatches End first,
    // then the cancellation branch at line 1383 dispatches Terminate).
    const endOrder = onPanResponderEnd.mock.invocationCallOrder[0];
    const termOrder = onPanResponderTerminate.mock.invocationCallOrder[0];
    expect(endOrder).toBeLessThan(termOrder);
  });

  // ----- SPEC-081: ref.current.gestureStarted reflects active gesture state -----

  it('SPEC-081: ref.gestureStarted is true during a gesture, false after release', () => {
    const ref = createRef<ReactNativeZoomableViewRef>();
    renderRNZV({}, ref);
    if (!ref.current) throw new Error('ref not attached');
    // Before any touch — false.
    expect(ref.current.gestureStarted).toBe(false);
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    // During gesture — true.
    expect(ref.current.gestureStarted).toBe(true);
    g.handlers.onTouchesUp(
      makeTouchEvent({
        x: 0,
        y: 0,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );
    // After release — false (mirror reset dispatched via runOnJS at end of
    // _handlePanResponderEnd; runOnJS is synchronous under reanimated/mock).
    expect(ref.current.gestureStarted).toBe(false);
  });

  it('SPEC-081: ref.gestureStarted reads true from inside onPanResponderGrant', () => {
    const ref = createRef<ReactNativeZoomableViewRef>();
    let grantReadValue: boolean | undefined;
    const onPanResponderGrant = jest.fn(() => {
      grantReadValue = ref.current?.gestureStarted;
    });
    renderRNZV({ onPanResponderGrant }, ref);
    const g = getGesture();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      makeStateManager()
    );
    // SPECS L157 contract: a consumer reading `ref.current.gestureStarted`
    // from inside `onPanResponderGrant` sees `true`. The source mirror-write
    // at line 831 (`runOnJS(setGestureStartedJS)(true)`) is queued FIRST,
    // then the grant callback at line 833 — FIFO under runOnJS guarantees
    // the mirror is set before the callback runs.
    expect(grantReadValue).toBe(true);
  });

  // ----- SPEC-082: gestureStarted reset happens AFTER all end-callbacks fire -----

  it('SPEC-082: ref.gestureStarted reads true from inside onPanResponderEnd, false after handler returns', () => {
    const ref = createRef<ReactNativeZoomableViewRef>();
    let endReadValue: boolean | undefined;
    const onPanResponderEnd = jest.fn(() => {
      endReadValue = ref.current?.gestureStarted;
    });
    renderRNZV({ onPanResponderEnd }, ref);
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
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
    // Inside the End callback — must read true (mirror reset is queued LAST
    // at source line 1407, FIFO after all end-callback dispatches).
    expect(endReadValue).toBe(true);
    // After the handler returns — mirror reset has drained, must read false.
    expect(ref.current?.gestureStarted).toBe(false);
  });

  it('SPEC-082: ref.gestureStarted reads true from inside onPanResponderTerminate (cancellation branch)', () => {
    // The cancellation branch dispatches Terminate from INSIDE the worklet
    // (source line 1383), BEFORE the terminal `setGestureStartedJS(false)`
    // mirror reset at line 1407. JSDoc on `_handlePanResponderEnd` calls
    // this out explicitly: Terminate must see `gestureStarted=true` to be
    // symmetric with End/ZoomEnd/ShiftingEnd.
    const ref = createRef<ReactNativeZoomableViewRef>();
    let terminateReadValue: boolean | undefined;
    const onPanResponderTerminate = jest.fn(() => {
      terminateReadValue = ref.current?.gestureStarted;
    });
    renderRNZV({ onPanResponderTerminate }, ref);
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeTouchEvent({ x: 0, y: 0, eventType: TOUCHES_DOWN }),
      sm
    );
    g.handlers.onTouchesCancelled(
      makeTouchEvent({
        x: 0,
        y: 0,
        eventType: TOUCHES_CANCELLED,
        numberOfTouches: 0,
      }),
      sm
    );
    expect(terminateReadValue).toBe(true);
    expect(ref.current?.gestureStarted).toBe(false);
  });
});
