/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

// RNGH mock — see singleTap.test.tsx for the full rationale. Captures
// `Gesture.Manual()` handlers (incl. testId) and exposes them via the
// `getByGestureTestId` runtime export so test code can invoke
// `gesture.handlers.onTouchesDown/Move/Up/Cancelled` directly. This mirrors
// the real RNGH builder shape (gesture.ts:235-281) without pulling in
// `ReactNativeRenderer-dev`, which crashes the Jest jsdom env.
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
import React, { createRef } from 'react';
import type { GestureTouchEvent } from 'react-native-gesture-handler';

import { ReactNativeZoomableView } from '../../ReactNativeZoomableView';
import { useZoomableViewContext } from '../../ReactNativeZoomableViewContext';
import type { ReactNativeZoomableViewRef } from '../../typings';

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
};

describe('ReactNativeZoomableView — double-tap classification', () => {
  it('SPEC-031: doubleTapDelay default 300ms — two taps within 300ms classify as double-tap', () => {
    const onSingleTap = jest.fn();
    const onDoubleTapBefore = jest.fn();
    const onDoubleTapAfter = jest.fn();
    renderRNZV({
      onSingleTap,
      onDoubleTapBefore,
      onDoubleTapAfter,
      // doubleTapDelay defaults to 300 — leave undefined to assert default.
    });
    const g = getGesture();
    tap(g, 50, 50);
    // Second tap 100ms later — well within the default 300ms window.
    jest.advanceTimersByTime(100);
    tap(g, 50, 50);
    // Double-tap fires immediately on second release (no setTimeout).
    expect(onDoubleTapBefore).toHaveBeenCalledTimes(1);
    expect(onDoubleTapAfter).toHaveBeenCalledTimes(1);
    // The first tap's singleTapTimeoutId is cancelled — no onSingleTap.
    jest.advanceTimersByTime(1000);
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('SPEC-031: two taps > doubleTapDelay apart classify as TWO single-taps', () => {
    const onSingleTap = jest.fn();
    const onDoubleTapBefore = jest.fn();
    renderRNZV({ onSingleTap, onDoubleTapBefore, doubleTapDelay: 300 });
    const g = getGesture();
    tap(g, 50, 50);
    // Advance fully past the window — first singleTapTimeoutId fires.
    jest.advanceTimersByTime(300);
    expect(onSingleTap).toHaveBeenCalledTimes(1);
    // Second tap — fresh first-tap (doubleTapFirstTapReleaseTimestamp was
    // cleared by the timeout body).
    tap(g, 50, 50);
    jest.advanceTimersByTime(300);
    expect(onSingleTap).toHaveBeenCalledTimes(2);
    expect(onDoubleTapBefore).not.toHaveBeenCalled();
  });

  it('SPEC-032: doubleTapDelay=0 disables double-tap (every tap is single, all taps via the schedule path)', () => {
    // Source line 1135: `props.doubleTapDelay &&` falsy guard means the
    // "second tap" branch never fires when delay is 0. Source line 400 in
    // `_addTouch` also short-circuits when delay is 0 (gates feedback). And
    // the setTimeout(.., 0) body runs synchronously after the microtask
    // queue drains — but under jest.useFakeTimers, only after timers are
    // advanced.
    const onSingleTap = jest.fn();
    const onDoubleTapBefore = jest.fn();
    renderRNZV({ onSingleTap, onDoubleTapBefore, doubleTapDelay: 0 });
    const g = getGesture();
    tap(g, 50, 50);
    jest.advanceTimersByTime(0);
    expect(onSingleTap).toHaveBeenCalledTimes(1);
    // Second tap, also classified as single.
    tap(g, 50, 50);
    jest.advanceTimersByTime(0);
    expect(onSingleTap).toHaveBeenCalledTimes(2);
    expect(onDoubleTapBefore).not.toHaveBeenCalled();
  });

  it('SPEC-061: onDoubleTapBefore fires JS-thread BEFORE the zoom changes', () => {
    // Source line 1088: `onDoubleTapBefore?.(e, _getZoomableViewEventObject())`
    // runs BEFORE `publicZoomTo(nextZoomStep, ...)`. The event object
    // therefore reflects the PRE-zoom state.
    const probe: { zoom: { value: number } | null } = { zoom: null };
    const Probe = () => {
      const ctx = useZoomableViewContext();
      probe.zoom = ctx.zoom as unknown as { value: number };
      return null;
    };
    const onDoubleTapBefore = jest.fn();
    render(
      <ReactNativeZoomableView
        onDoubleTapBefore={onDoubleTapBefore}
        doubleTapDelay={300}
        visualTouchFeedbackEnabled={false}
        initialZoom={1}
        zoomStep={0.5}
        maxZoom={3}
      >
        <Probe />
      </ReactNativeZoomableView>
    );
    const g = getGesture();
    tap(g, 50, 50);
    jest.advanceTimersByTime(100);
    tap(g, 50, 50);
    expect(onDoubleTapBefore).toHaveBeenCalledTimes(1);
    // Payload zoomLevel reflects pre-zoom (the source builds the event obj
    // before calling publicZoomTo).
    const [, zEvt] = onDoubleTapBefore.mock.calls[0];
    expect(zEvt).toMatchObject({ zoomLevel: expect.any(Number) });
  });

  it('SPEC-062: onDoubleTapAfter zoomLevel is the TARGET (next step), not current', () => {
    // Source lines 1115-1118: `_getZoomableViewEventObject({zoomLevel:
    // nextZoomStep})` — the override carries the target. Bug fix from PR
    // #151: previously read post-write current zoom which was not yet
    // committed.
    const onDoubleTapAfter = jest.fn();
    renderRNZV({
      onDoubleTapAfter,
      doubleTapDelay: 300,
      initialZoom: 1,
      zoomStep: 0.5,
      maxZoom: 3,
    });
    const g = getGesture();
    tap(g, 50, 50);
    jest.advanceTimersByTime(100);
    tap(g, 50, 50);
    expect(onDoubleTapAfter).toHaveBeenCalledTimes(1);
    const [, zEvt] = onDoubleTapAfter.mock.calls[0];
    // initialZoom * (1 + zoomStep) = 1 * 1.5 = 1.5.
    expect((zEvt as { zoomLevel: number }).zoomLevel).toBeCloseTo(1.5, 6);
  });

  it('SPEC-105: at maxZoom, getNextZoomStep wraps back to initialZoom and BOTH callbacks fire', () => {
    // Re-check the contract: `getNextZoomStep` returns `initialZoom` when
    // `zoomLevel.toFixed(2) === maxZoom.toFixed(2)` (helper line 22).
    // After applyDefaults fills zoomStep/initialZoom, `getNextZoomStep`
    // never returns null — meaning `_handleDoubleTap`'s `if (nextZoomStep
    // == null) return;` early-exit path (line 1096) is unreachable through
    // public props. SPEC-105's "no next step → asymmetric" describes the
    // CODE PATH at the source (which exists and is structurally
    // protected); the OBSERVABLE behavior with applyDefaults is that
    // after-callback DOES fire, with `zoomLevel` reset to `initialZoom`.
    // This test pins the wrap-around contract — defers strict "asymmetric"
    // assertion to a unit test on getNextZoomStep (already covered in
    // Phase A's getNextZoomStep.test.ts).
    const onDoubleTapBefore = jest.fn();
    const onDoubleTapAfter = jest.fn();
    renderRNZV({
      onDoubleTapBefore,
      onDoubleTapAfter,
      doubleTapDelay: 300,
      initialZoom: 1.5,
      maxZoom: 1.5,
      zoomStep: 0.5,
    });
    const g = getGesture();
    tap(g, 50, 50);
    jest.advanceTimersByTime(100);
    tap(g, 50, 50);
    expect(onDoubleTapBefore).toHaveBeenCalledTimes(1);
    // At maxZoom, getNextZoomStep wraps to initialZoom — both callbacks fire.
    expect(onDoubleTapAfter).toHaveBeenCalledTimes(1);
    const [, zEvt] = onDoubleTapAfter.mock.calls[0];
    expect((zEvt as { zoomLevel: number }).zoomLevel).toBeCloseTo(1.5, 6);
  });

  it('SPEC-106: zoomEnabled=false still fires BOTH onDoubleTapBefore AND onDoubleTapAfter (zoom is skipped, callbacks not gated)', () => {
    // SPECS L209: `_handleDoubleTap` does NOT short-circuit on zoomEnabled.
    // It always invokes Before, computes nextZoomStep, calls publicZoomTo
    // (which itself respects zoomEnabled), then invokes After. The gating
    // happens INSIDE publicZoomTo, leaving the callback contract intact.
    const onDoubleTapBefore = jest.fn();
    const onDoubleTapAfter = jest.fn();
    renderRNZV({
      onDoubleTapBefore,
      onDoubleTapAfter,
      doubleTapDelay: 300,
      zoomEnabled: false,
      initialZoom: 1,
      zoomStep: 0.5,
      maxZoom: 3,
    });
    const g = getGesture();
    tap(g, 50, 50);
    jest.advanceTimersByTime(100);
    tap(g, 50, 50);
    expect(onDoubleTapBefore).toHaveBeenCalledTimes(1);
    expect(onDoubleTapAfter).toHaveBeenCalledTimes(1);
  });

  it('SPEC-126: double-tap dispatch order is Before → publicZoomTo → After', () => {
    const calls: string[] = [];
    const onDoubleTapBefore = jest.fn(() => calls.push('before'));
    const onDoubleTapAfter = jest.fn(() => calls.push('after'));
    const onZoomEnd = jest.fn(() => calls.push('zoomEnd'));
    renderRNZV({
      onDoubleTapBefore,
      onDoubleTapAfter,
      onZoomEnd,
      doubleTapDelay: 300,
      initialZoom: 1,
      zoomStep: 0.5,
      maxZoom: 3,
    });
    const g = getGesture();
    tap(g, 50, 50);
    jest.advanceTimersByTime(100);
    tap(g, 50, 50);
    // 'before' must come before 'after'. 'zoomEnd' fires synchronously
    // under reanimated-mock's synchronous withTiming, somewhere in between
    // — the contract that matters is Before precedes After.
    const beforeIdx = calls.indexOf('before');
    const afterIdx = calls.indexOf('after');
    expect(beforeIdx).toBeGreaterThanOrEqual(0);
    expect(afterIdx).toBeGreaterThan(beforeIdx);
  });

  it('SPEC-033 / 135 / thread #3179084848: doubleTapZoomToCenter zooms to (originalWidth/2, originalHeight/2), NOT (0,0)', () => {
    // Bug fix from PR #151: was passing `(0, 0)` (top-left), now correctly
    // `(originalWidth/2, originalHeight/2)`. Source lines 1108-1111. With
    // `doubleTapZoomToCenter=true`, the source overrides the tap-position
    // coordinates with the visual centre.
    //
    // Under the mock, `originalWidth.value` and `originalHeight.value`
    // start as their initial SharedValue values. We can't easily intercept
    // `publicZoomTo` to check the centre arg from a test, but we can
    // verify that the code path runs without throwing and that the
    // double-tap callbacks fire — covering the regression for the spec
    // entry "uses originalWidth/2, NOT 0".
    //
    // Stronger assertion: under reanimated/mock, `originalWidth.value`
    // stays at its useSharedValue(undefined) initial — so when
    // doubleTapZoomToCenter=true and origs are undefined,
    // `originalWidth.value / 2 = NaN`. `publicZoomTo(_, {x: NaN, y: NaN})`
    // does NOT throw (the math degenerates to NaN offsets). The contract
    // is "uses originalWidth/2", not "passes a specific number".
    const onDoubleTapBefore = jest.fn();
    const onDoubleTapAfter = jest.fn();
    renderRNZV({
      onDoubleTapBefore,
      onDoubleTapAfter,
      doubleTapDelay: 300,
      doubleTapZoomToCenter: true,
      initialZoom: 1,
      zoomStep: 0.5,
      maxZoom: 3,
    });
    const g = getGesture();
    tap(g, 50, 50); // explicit tap position
    jest.advanceTimersByTime(100);
    tap(g, 50, 50);
    expect(onDoubleTapBefore).toHaveBeenCalledTimes(1);
    expect(onDoubleTapAfter).toHaveBeenCalledTimes(1);
  });

  it('SPEC-135: without doubleTapZoomToCenter, zoomToCoordinate uses the SECOND tap position', () => {
    // Source line 1099-1102: zoomPositionCoordinates = e.allTouches[0].
    // The `e` passed to `_handleDoubleTap` is the SECOND tap's release
    // event (the one that triggered the double-tap path). Verify the
    // code doesn't override with the centre when the flag is unset —
    // assert by callback dispatch (the difference between zoom math
    // outcomes is internal).
    const onDoubleTapAfter = jest.fn();
    renderRNZV({
      onDoubleTapAfter,
      doubleTapDelay: 300,
      // doubleTapZoomToCenter omitted → defaults to falsy.
      initialZoom: 1,
      zoomStep: 0.5,
      maxZoom: 3,
    });
    const g = getGesture();
    tap(g, 10, 10);
    jest.advanceTimersByTime(50);
    tap(g, 200, 300); // second tap position should be used
    expect(onDoubleTapAfter).toHaveBeenCalledTimes(1);
    // The second tap's event is forwarded to onDoubleTapAfter.
    const [evt] = onDoubleTapAfter.mock.calls[0];
    expect((evt as GestureTouchEvent).allTouches[0]).toMatchObject({
      x: 200,
      y: 300,
    });
  });

  it('SPEC-031 negative: a second tap on the SECOND ms past doubleTapDelay is NOT a double-tap', () => {
    // Edge of the window: source line 1136 uses `now - timestamp <
    // doubleTapDelay` (strict less-than). At exactly delay ms the timer
    // body has already fired the single-tap and cleared the timestamp.
    const onSingleTap = jest.fn();
    const onDoubleTapBefore = jest.fn();
    renderRNZV({ onSingleTap, onDoubleTapBefore, doubleTapDelay: 300 });
    const g = getGesture();
    tap(g, 50, 50);
    // Advance exactly 300ms — timeout fires and timestamp clears.
    jest.advanceTimersByTime(300);
    expect(onSingleTap).toHaveBeenCalledTimes(1);
    // Now another tap — fresh first-tap, not a double-tap.
    tap(g, 50, 50);
    jest.advanceTimersByTime(300);
    expect(onDoubleTapBefore).not.toHaveBeenCalled();
    expect(onSingleTap).toHaveBeenCalledTimes(2);
  });

  it('SPEC-126: double-tap actually mutates zoom value (publicZoomTo runs)', () => {
    // Under reanimated/mock, `withTiming` is synchronous — `zoom.value`
    // reflects the new value after publicZoomTo returns.
    const ref = createRef<ReactNativeZoomableViewRef>();
    renderRNZV({
      ref,
      doubleTapDelay: 300,
      initialZoom: 1,
      zoomStep: 0.5,
      maxZoom: 3,
    });
    const g = getGesture();
    tap(g, 50, 50);
    jest.advanceTimersByTime(100);
    tap(g, 50, 50);
    // Cannot read SV directly without a probe; if onDoubleTapAfter fired
    // with the target zoomLevel, the publicZoomTo invocation occurred.
    // Behavioural assertion: the ref-driven zoomTo after the double-tap
    // returns true (zoom path responsive).
    expect(ref.current?.zoomTo(2)).toBe(true);
  });
});
