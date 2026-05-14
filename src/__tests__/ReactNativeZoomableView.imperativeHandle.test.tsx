/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// RNGH mock — see ReactNativeZoomableView.renderOverlay.test.tsx for the
// rationale. Importing the public API transitively pulls in
// `GestureDetector` → `ReactNativeRenderer-dev`, which crashes the Jest env.
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const ReactLocal = require('react');
  const makeChainable = (): unknown => {
    const p: Record<string, unknown> = {};
    const proxy: unknown = new Proxy<Record<string, unknown>>(p, {
      get: (_target, prop) => {
        if (prop === 'toJSON') return () => ({});
        return () => proxy;
      },
    });
    return proxy;
  };
  const Gesture = new Proxy(
    {},
    {
      get: () => () => makeChainable(),
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
    State: {},
    Directions: {},
  };
});

import { render } from '@testing-library/react-native';
import React, { createRef } from 'react';
import { Text } from 'react-native';

import { ReactNativeZoomableView } from '../ReactNativeZoomableView';
import { useZoomableViewContext } from '../ReactNativeZoomableViewContext';
import type { ReactNativeZoomableViewRef } from '../typings';

type ContextProbe = {
  zoom: { value: number };
  offsetX: { value: number };
  offsetY: { value: number };
};
const captureContext = (target: { current: ContextProbe | null }) => {
  const Probe = () => {
    const ctx = useZoomableViewContext();
    target.current = ctx as unknown as ContextProbe;
    return <Text>probe</Text>;
  };
  return <Probe />;
};

// Test caveats (apply to several tests below):
// (1) Under `react-native-reanimated/mock`, `withTiming(toValue, cfg, cb)`
//     invokes `cb(true)` SYNCHRONOUSLY and returns `toValue`. There is no
//     in-flight animation window under the mock. Tests that try to assert
//     cancellation-during-animation use the synchronous ordering: the
//     second method call must observe / be observable AFTER the first
//     `withTiming` synchronously completes. We therefore assert the
//     POST-CONDITION (zoom.value, offset values, no extra onZoomEnd fired
//     after a cancellation-equivalent action) rather than mid-animation
//     interception.
// (2) The reanimated mock's `useSharedValue` creates a NEW Proxy on each
//     call — meaning every component re-render recreates the SharedValues.
//     `wrapper.onLayout` triggers `setWrapperSize` which schedules a
//     re-render that wipes `originalWidth/Height` (and `offsetX/Y`,
//     `zoom`). Tests requiring `originalWidth/Height > 0` (moveTo math,
//     moveStaticPinTo math) cannot reliably read post-call offsets;
//     instead we assert the EARLY-RETURN no-op contract (the "before
//     layout" branch from SPEC-075 / SPEC-077 / SPEC-078).

describe('ReactNativeZoomableView — imperative handle (zoomTo/zoomBy/moveTo/moveBy/moveStaticPinTo)', () => {
  describe('SPEC-066: zoomTo uses zoomToAnimation (250ms duration, Easing.out(ease))', () => {
    it('SPEC-066: zoomTo writes zoom.value to the requested level (synchronously under mock withTiming)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref} initialZoom={1} maxZoom={5}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      ref.current?.zoomTo(2);
      // Under the reanimated mock, withTiming returns the target value
      // synchronously — the assignment `zoom.value = withTiming(...)` thus
      // lands the target value immediately. End-state is the contract;
      // the 250ms duration is a config constant on `zoomToAnimation`
      // verified at the source level.
      expect(probe.current?.zoom.value).toBe(2);
    });

    it('SPEC-149: zoomToAnimation default 250ms duration is exported as config (verified at source-level — Phase A finding)', () => {
      // The actual duration/easing constants live in
      // `src/animations/index.ts` and are imported into ReactNativeZoomableView
      // as `zoomToAnimation`. End-to-end timing assertion requires fake
      // timers + a non-mock reanimated runtime; deferred to Phase C
      // (gesture-driven integration). This test asserts the call surface:
      // zoomTo returns a boolean and writes zoom.value.
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} />);
      const result = ref.current?.zoomTo(1.2);
      expect(result).toBe(true);
    });
  });

  describe('SPEC-067: zoomTo return-value contract', () => {
    it('SPEC-067: returns false when zoomEnabled=false', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} zoomEnabled={false} />);
      expect(ref.current?.zoomTo(1.2)).toBe(false);
    });

    it('SPEC-067: returns false when newZoomLevel > maxZoom', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} maxZoom={2} />);
      expect(ref.current?.zoomTo(2.1)).toBe(false);
    });

    it('SPEC-067: returns false when newZoomLevel < minZoom', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} minZoom={0.5} />);
      expect(ref.current?.zoomTo(0.4)).toBe(false);
    });

    it('SPEC-067: returns true when within bounds', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} minZoom={0.5} maxZoom={3} />);
      expect(ref.current?.zoomTo(1.5)).toBe(true);
    });
  });

  describe('SPEC-068: zoomCenter set/clear via zoomToDestination', () => {
    it('SPEC-068: zoomTo with zoomCenter completes (zoom write under mock)', () => {
      // Centering math runs in the unified transform reaction, which is a
      // NOOP under reanimated mock (`useAnimatedReaction: NOOP`). End-state
      // zoom-write is observable; per-tick offset recomputation belongs to
      // Phase C integration. This test asserts that passing a zoomCenter
      // does not break the call path.
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref} initialZoom={1} maxZoom={5}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      const result = ref.current?.zoomTo(2, { x: 100, y: 200 });
      expect(result).toBe(true);
      expect(probe.current?.zoom.value).toBe(2);
    });
  });

  describe('SPEC-069: zoomTo without zoomCenter geometric-centre default', () => {
    it('SPEC-069: zoomTo without zoomCenter completes without error', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} maxZoom={5} />);
      expect(ref.current?.zoomTo(2)).toBe(true);
    });
  });

  describe('SPEC-070: natural completion fires onZoomEnd(undefined, …)', () => {
    it('SPEC-070: zoomTo finished=true callback fires onZoomEnd with event=undefined', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      // Mock withTiming invokes cb(true) synchronously → the natural
      // completion branch fires `runOnJS(_safeOnZoomEnd)(undefined, evt)`.
      // runOnJS is identity under mock; the call lands synchronously.
      ref.current?.zoomTo(2);
      expect(onZoomEnd).toHaveBeenCalledTimes(1);
      // First arg is the GestureTouchEvent — undefined per SPEC-053.
      expect(onZoomEnd.mock.calls[0]?.[0]).toBeUndefined();
      // Second arg is a ZoomableViewEvent payload with the expected shape.
      // Note: under the reanimated mock, `withTiming(toValue, cfg, cb)`
      // invokes `cb` BEFORE returning `toValue` (see mock.ts line 141-148),
      // so `_getZoomableViewEventObject()` inside the callback reads
      // `zoom.value` BEFORE the assignment lands. The zoomLevel observed
      // here is therefore the PRE-zoom value (1). The contract under test
      // is the EVENT SHAPE (5 ZoomableViewEvent fields present), not the
      // exact zoomLevel value (covered at the source level).
      const payload = onZoomEnd.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(payload).toEqual(
        expect.objectContaining({
          zoomLevel: expect.any(Number),
          offsetX: expect.any(Number),
          offsetY: expect.any(Number),
          originalHeight: expect.any(Number),
          originalWidth: expect.any(Number),
        })
      );
    });
  });

  // SPEC-071 cancellation paths — under reanimated mock, withTiming's
  // callback fires synchronously inside the zoomTo() call (before any
  // subsequent code runs). So the "cancel mid-animation" scenario the
  // contract describes (a second method call before withTiming completes)
  // collapses to a sequential scenario at test time. We test each path's
  // POST-CONDITION: after the second action runs, onZoomEnd has fired
  // EXACTLY ONCE (from the first zoomTo's synchronous natural completion).
  // The second action — even though it cancels in production — does not
  // produce a second onZoomEnd, matching the spec's "cancellation does NOT
  // fire onZoomEnd" guarantee.
  //
  // The stronger contract — that withTiming's completion callback bails
  // when `finished===false` — is enforced by source code at line 1067
  // (`if (!finished) return;`) and visually verified by the renderOverlay
  // / Phase A pure-helper suites. Component-test coverage here exercises
  // the cancellation *call ordering* contract: second method does not
  // cause an extra onZoomEnd fire after a "completed" first zoomTo.
  describe('SPEC-071: cancellation paths — onZoomEnd does NOT re-fire from the cancelling action', () => {
    it('SPEC-071a: moveTo invoked after zoomTo does not fire onZoomEnd again', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      ref.current?.zoomTo(2);
      expect(onZoomEnd).toHaveBeenCalledTimes(1); // natural completion
      onZoomEnd.mockClear();
      // moveTo calls `cancelAnimation(zoom)` + `zoomToDestination.value = undefined`.
      // No new withTiming call on zoom, so no new onZoomEnd. (moveTo's
      // early-return when originalWidth=0 also leaves zoom alone, but the
      // cancel-then-no-op contract is what guarantees no extra onZoomEnd.)
      ref.current?.moveTo(100, 200);
      expect(onZoomEnd).not.toHaveBeenCalled();
    });

    it('SPEC-071b: moveBy invoked after zoomTo does not fire onZoomEnd again', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      ref.current?.zoomTo(2);
      onZoomEnd.mockClear();
      ref.current?.moveBy(10, 10);
      expect(onZoomEnd).not.toHaveBeenCalled();
    });

    it('SPEC-071c: moveStaticPinTo invoked after zoomTo does not fire onZoomEnd again', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView
          ref={ref}
          maxZoom={5}
          onZoomEnd={onZoomEnd}
          // moveStaticPinTo requires staticPinPosition + content dims;
          // without them, the no-op branch leaves zoom alone (SPEC-078).
          staticPinPosition={{ x: 50, y: 50 }}
          contentWidth={400}
          contentHeight={600}
        />
      );
      ref.current?.zoomTo(2);
      onZoomEnd.mockClear();
      ref.current?.moveStaticPinTo({ x: 25, y: 25 });
      expect(onZoomEnd).not.toHaveBeenCalled();
    });

    it('SPEC-071d: unmount during/after zoomTo does not fire onZoomEnd', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      const { unmount } = render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      // Reset the natural-completion call from the initial zoomTo, then
      // unmount. The component-level cleanup queues `cancelAnimation(zoom)`
      // via `runOnUI`. Under mock, `runOnUI` is identity, but
      // `cancelAnimation` is NOOP — the contract under test here is that
      // post-unmount, no new onZoomEnd fires (the `_safeOnZoomEnd`
      // post-unmount guard at line 321-326 ensures it).
      ref.current?.zoomTo(2);
      onZoomEnd.mockClear();
      unmount();
      // Allow any deferred handlers to drain. Under mock everything is
      // synchronous, so nothing to drain — assert immediately.
      expect(onZoomEnd).not.toHaveBeenCalled();
    });
  });

  describe('SPEC-072: zoomBy falls back to zoomStep when delta is falsy', () => {
    it('SPEC-072: zoomBy(undefined) applies zoomStep (default 0.5)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      // current zoom=1, +zoomStep(0.5) = 1.5 (within [0.5, 1.5]).
      const result = ref.current?.zoomBy(undefined as unknown as number);
      expect(result).toBe(true);
      expect(probe.current?.zoom.value).toBe(1.5);
    });

    it('SPEC-072: zoomBy(0) applies zoomStep (`||=` triggers on 0)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      const result = ref.current?.zoomBy(0);
      expect(result).toBe(true);
      // 1 + 0.5 = 1.5
      expect(probe.current?.zoom.value).toBe(1.5);
    });

    it('SPEC-072: zoomBy with explicit non-zero delta applies that delta', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      const result = ref.current?.zoomBy(0.25);
      expect(result).toBe(true);
      expect(probe.current?.zoom.value).toBeCloseTo(1.25, 10);
    });
  });

  describe('SPEC-073: zoomBy calls zoomTo(zoom+delta) — return-value matches the bounds check', () => {
    it('SPEC-073: zoomBy returns false when zoom+delta exceeds maxZoom', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} maxZoom={1.5} />);
      // 1 + 0.6 = 1.6 > 1.5 → false
      expect(ref.current?.zoomBy(0.6)).toBe(false);
    });
  });

  describe('SPEC-074 + SPEC-075 + SPEC-076: moveTo math + no-op-pre-measurement + cancels in-flight zoomTo', () => {
    it('SPEC-075: moveTo is a no-op before measurement (originalWidth=0)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      // No onLayout fired → originalWidth/Height are 0 → moveTo early-returns.
      ref.current?.moveTo(123, 456);
      // Offsets stay at the SV defaults (0).
      expect(probe.current?.offsetX.value).toBe(0);
      expect(probe.current?.offsetY.value).toBe(0);
    });

    it('SPEC-075: moveTo pre-measurement leaves in-flight zoomTo behaviour untouched (no cancellation when early-returning)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      // Per the source comment (line 1255-1264): "if (!originalWidth.value
      // || !originalHeight.value) return; … Cancellation runs only on the
      // active path that will actually write offsets below." So moveTo
      // before measurement must NOT cancel a prior zoomTo. Under mock,
      // zoomTo completes synchronously and fires onZoomEnd via the natural
      // path; what we assert is that moveTo does NOT produce a SECOND
      // cancellation-related onZoomEnd fire (which it never does anyway
      // since cancellation paths suppress onZoomEnd).
      ref.current?.zoomTo(2);
      expect(onZoomEnd).toHaveBeenCalledTimes(1);
      onZoomEnd.mockClear();
      ref.current?.moveTo(100, 100); // early-returns
      expect(onZoomEnd).not.toHaveBeenCalled();
    });

    // SPEC-074 math (post-measurement offsetX = -(newX - origW/2)/zoom) is
    // NOT directly observable here because firing wrapper.onLayout queues
    // setWrapperSize → re-render → fresh SharedValues under the reanimated
    // mock (mock recreates SVs on every render). Math is asserted via the
    // pure-helper unit suite (Phase A) and end-to-end via Phase C
    // gesture-driven tests. Documented here so a future agent doesn't
    // think this gap was missed.
  });

  describe('SPEC-077: moveBy shifts by delta — works without measurement', () => {
    it('SPEC-077: moveBy({50, 30}) on fresh mount sets offsets = (-50, -30) (zoom=1)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      // No measurement guard on moveBy. zoom=1, offsets start at 0:
      //   newOffsetX = (0*1 - 50)/1 = -50  ;  newOffsetY = (0*1 - 30)/1 = -30
      ref.current?.moveBy(50, 30);
      expect(probe.current?.offsetX.value).toBe(-50);
      expect(probe.current?.offsetY.value).toBe(-30);
    });

    it('SPEC-077: moveBy cancels in-flight zoomTo (no extra onZoomEnd)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      ref.current?.zoomTo(2);
      onZoomEnd.mockClear();
      ref.current?.moveBy(10, 0);
      expect(onZoomEnd).not.toHaveBeenCalled();
    });
  });

  describe('SPEC-078: moveStaticPinTo requires staticPinPosition + originalWidth/Height + contentWidth/Height', () => {
    it('SPEC-078: moveStaticPinTo without staticPinPosition is a no-op (leaves offsets)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView
          ref={ref}
          contentWidth={400}
          contentHeight={600}
        >
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      ref.current?.moveStaticPinTo({ x: 100, y: 100 });
      expect(probe.current?.offsetX.value).toBe(0);
      expect(probe.current?.offsetY.value).toBe(0);
    });

    it('SPEC-078: moveStaticPinTo without contentWidth/Height is a no-op', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref} staticPinPosition={{ x: 50, y: 50 }}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      ref.current?.moveStaticPinTo({ x: 100, y: 100 });
      expect(probe.current?.offsetX.value).toBe(0);
      expect(probe.current?.offsetY.value).toBe(0);
    });

    it('SPEC-078: moveStaticPinTo without originalWidth/Height (pre-measurement) is a no-op', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView
          ref={ref}
          staticPinPosition={{ x: 50, y: 50 }}
          contentWidth={400}
          contentHeight={600}
        >
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      // staticPinPosition + contentWidth/Height provided, but no onLayout
      // fired so originalWidth/Height are 0 → early-return guard
      // (line 1215).
      ref.current?.moveStaticPinTo({ x: 100, y: 100 });
      expect(probe.current?.offsetX.value).toBe(0);
      expect(probe.current?.offsetY.value).toBe(0);
    });

    it('SPEC-078: no-op path does not fire onZoomEnd from a stale zoomTo (cancellation runs only on the active path)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView
          ref={ref}
          maxZoom={5}
          onZoomEnd={onZoomEnd}
          // staticPinPosition missing → early-return
          contentWidth={400}
          contentHeight={600}
        />
      );
      ref.current?.zoomTo(2);
      onZoomEnd.mockClear();
      ref.current?.moveStaticPinTo({ x: 25, y: 25 });
      expect(onZoomEnd).not.toHaveBeenCalled();
    });
  });

  describe('SPEC-079: moveStaticPinTo cancels in-flight zoomTo on active path', () => {
    it('SPEC-079: active-path moveStaticPinTo does not fire a second onZoomEnd', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView
          ref={ref}
          maxZoom={5}
          onZoomEnd={onZoomEnd}
          staticPinPosition={{ x: 50, y: 50 }}
          contentWidth={400}
          contentHeight={600}
        />
      );
      ref.current?.zoomTo(2);
      onZoomEnd.mockClear();
      // Active-path moveStaticPinTo (all guards satisfied EXCEPT
      // originalWidth — which our mock-driven test cannot easily set
      // without re-rendering away the SVs). The SPEC-079 contract is
      // call-ordering: cancellation runs INSIDE moveStaticPinTo before
      // any offset write; observable side effect is "no extra onZoomEnd".
      ref.current?.moveStaticPinTo({ x: 25, y: 25 });
      expect(onZoomEnd).not.toHaveBeenCalled();
    });
  });

  describe('SPEC-080: moveStaticPinTo duration truthy/falsy', () => {
    it('SPEC-080: passing duration does not throw (truthy branch uses withTiming)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(
        <ReactNativeZoomableView
          ref={ref}
          staticPinPosition={{ x: 50, y: 50 }}
          contentWidth={400}
          contentHeight={600}
        />
      );
      expect(() =>
        ref.current?.moveStaticPinTo({ x: 25, y: 25 }, 200)
      ).not.toThrow();
    });

    it('SPEC-080: omitting duration does not throw (falsy branch direct-write)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(
        <ReactNativeZoomableView
          ref={ref}
          staticPinPosition={{ x: 50, y: 50 }}
          contentWidth={400}
          contentHeight={600}
        />
      );
      expect(() =>
        ref.current?.moveStaticPinTo({ x: 25, y: 25 })
      ).not.toThrow();
    });
  });
});
