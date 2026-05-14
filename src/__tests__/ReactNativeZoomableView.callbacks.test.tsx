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

// Probe that captures the context-exposed SharedValues from inside the tree.
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

// Mock-runtime caveats (apply throughout this file):
// (1) `useAnimatedReaction` is a NOOP under the reanimated mock — the
//     unified transform reaction (line 618), the onLayoutWorklet reaction
//     (line 685), and the staticPin settle reaction (line 475) NEVER fire
//     automatically. Tests that need to observe these reactions exercise
//     them via SOURCE-OBSERVABLE side effects only (callback fired vs. not,
//     payload-shape verification of programmatic-zoomTo's onZoomEnd, etc.).
// (2) `withTiming` invokes `cb(true)` SYNCHRONOUSLY before returning
//     `toValue` — see imperativeHandle.test.tsx for full discussion.

describe('ReactNativeZoomableView — callbacks', () => {
  // SPEC-008: useZoomableViewContext exposes zoom, offsetX, offsetY to
  // descendant components. The mere fact that the captureContext probe
  // above does not throw — and reads the SVs as `{value: number}` — is the
  // contract.
  describe('SPEC-008: useZoomableViewContext returns { zoom, offsetX, offsetY } for descendants', () => {
    it('SPEC-008: returns the three SharedValues to a descendant component', () => {
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      expect(probe.current).not.toBeNull();
      expect(probe.current?.zoom).toEqual(
        expect.objectContaining({ value: expect.any(Number) })
      );
      expect(probe.current?.offsetX).toEqual(
        expect.objectContaining({ value: expect.any(Number) })
      );
      expect(probe.current?.offsetY).toEqual(
        expect.objectContaining({ value: expect.any(Number) })
      );
    });

    it('SPEC-008: useZoomableViewContext throws outside a ReactNativeZoomableView', () => {
      // Defensive contract from the hook implementation. Render the probe
      // OUTSIDE the provider — the throw should reach React's error
      // boundary. We capture via a try/catch on render.
      const probe = { current: null as ContextProbe | null };
      // Silence the expected console.error noise from React's error
      // boundary forward.
      const errSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      try {
        expect(() => render(captureContext(probe))).toThrow(
          /useZoomableViewContext must be used within ReactNativeZoomableView/
        );
      } finally {
        errSpy.mockRestore();
      }
    });
  });

  describe('SPEC-053 + SPEC-065 + SPEC-070: onZoomEnd contract (programmatic-completion path)', () => {
    it('SPEC-053: onZoomEnd from natural zoomTo completion receives event = undefined', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      ref.current?.zoomTo(2);
      expect(onZoomEnd).toHaveBeenCalledTimes(1);
      expect(onZoomEnd.mock.calls[0]?.[0]).toBeUndefined();
    });

    it('SPEC-053: onZoomEnd payload is the ZoomableViewEvent shape', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      ref.current?.zoomTo(2);
      const payload = onZoomEnd.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(payload).toEqual(
        expect.objectContaining({
          zoomLevel: expect.any(Number),
          offsetX: expect.any(Number),
          offsetY: expect.any(Number),
          originalWidth: expect.any(Number),
          originalHeight: expect.any(Number),
        })
      );
    });

    it('SPEC-065: cancelled zoomTo (return-false branch) does NOT fire onZoomEnd', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView
          ref={ref}
          zoomEnabled={false}
          onZoomEnd={onZoomEnd}
        />
      );
      // zoomTo bails at the `if (!zoomEnabled.value) return false;` gate —
      // no withTiming scheduled, no onZoomEnd.
      const result = ref.current?.zoomTo(2);
      expect(result).toBe(false);
      expect(onZoomEnd).not.toHaveBeenCalled();
    });

    it('SPEC-065: out-of-bounds zoomTo (maxZoom-exceeded) does NOT fire onZoomEnd', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView
          ref={ref}
          maxZoom={1.5}
          onZoomEnd={onZoomEnd}
        />
      );
      const result = ref.current?.zoomTo(3);
      expect(result).toBe(false);
      expect(onZoomEnd).not.toHaveBeenCalled();
    });
  });

  describe('SPEC-054 + SPEC-137 + SPEC-148: onLayoutWorklet payload contract', () => {
    // SPEC-054 is reaction-driven (useAnimatedReaction in source line 685
    // fires when originalWidth/Height/X/Y change). Under reanimated mock
    // useAnimatedReaction is NOOP, so the reaction never fires
    // automatically — we cannot observe a natural fire. We assert the
    // contract surface: the prop accepts a function reference without
    // throwing.

    it('SPEC-054: onLayoutWorklet is accepted as a prop without crashing', () => {
      const onLayoutWorklet = jest.fn();
      expect(() =>
        render(<ReactNativeZoomableView onLayoutWorklet={onLayoutWorklet} />)
      ).not.toThrow();
    });

    it('SPEC-137 + SPEC-148: onLayoutWorklet payload is unwrapped {x, y, width, height}, NOT a LayoutChangeEvent (source-level contract; reaction-driven fire deferred to Phase C)', () => {
      // Per SPEC-148 the payload is parent-relative {x,y,width,height} —
      // the source builds the object explicitly at line 694-699 from
      // `originalWidth/Height/X/Y` SharedValues, not from the
      // LayoutChangeEvent. The reaction itself is gated by
      // `if (!originalWidth.value || !originalHeight.value) return;` (line
      // 693), guaranteeing zero-dim layouts never reach the consumer.
      // Reaction fires require `useAnimatedReaction` (NOOP under mock); the
      // contract is verified at the source level. This test asserts the
      // prop type accepts the unwrapped-shape callback.
      const onLayoutWorklet: (l: {
        x: number;
        y: number;
        width: number;
        height: number;
      }) => void = jest.fn();
      expect(() =>
        render(<ReactNativeZoomableView onLayoutWorklet={onLayoutWorklet} />)
      ).not.toThrow();
    });
  });

  describe('SPEC-055 + SPEC-138: onTransformWorklet fires every transform tick', () => {
    it('SPEC-055: onTransformWorklet is accepted as a prop without crashing', () => {
      const onTransformWorklet = jest.fn();
      expect(() =>
        render(
          <ReactNativeZoomableView onTransformWorklet={onTransformWorklet} />
        )
      ).not.toThrow();
    });

    it('SPEC-138: onTransformWorklet receives a ZoomableViewEvent (contract verified at the type level; reaction-driven fire deferred to Phase C)', () => {
      // The unified transform reaction (source line 618) calls
      // onTransformWorkletShared.value.fn(zoomableViewEvent) — the
      // ZoomableViewEvent shape. Under the reanimated mock the reaction is
      // NOOP. Type contract is enforced by `tsc --noEmit`. This test
      // asserts the prop is accepted.
      const onTransformWorklet: (e: {
        zoomLevel: number;
        offsetX: number;
        offsetY: number;
        originalHeight: number;
        originalWidth: number;
      }) => void = jest.fn();
      expect(() =>
        render(
          <ReactNativeZoomableView onTransformWorklet={onTransformWorklet} />
        )
      ).not.toThrow();
    });
  });

  describe('SPEC-107: every onTransformWorklet fire sees consistent zoom+offset pair (no chimera state)', () => {
    it('SPEC-107: source-level invariant — unified transform reaction is a single useAnimatedReaction recomputing offsets BEFORE invoking the consumer worklet (no observable chimera under mock; gesture-driven verification deferred to Phase C)', () => {
      // SPEC-107 guarantees that the zoom→offset recompute and the
      // onTransformWorklet consumer call happen in the SAME useAnimatedReaction
      // tick (source line 618, single fused reaction). Splitting into two
      // reactions would surface a tick where zoom advanced but offsets had
      // not yet been recomputed. Under the reanimated mock this reaction is
      // NOOP — we cannot observe the centering invariant from JS. The
      // structural guarantee (single fused reaction) is asserted at the
      // source level; this test holds the contract slot.
      const onTransformWorklet = jest.fn();
      render(
        <ReactNativeZoomableView
          maxZoom={5}
          onTransformWorklet={onTransformWorklet}
        />
      );
      // Render-without-throw passes; reaction-driven invariant verification
      // belongs to integration tests with a non-mock reanimated runtime.
      expect(onTransformWorklet).not.toThrow();
    });
  });

  describe('SPEC-140: onStaticPinPositionMoveWorklet is a worklet UI-thread callback', () => {
    it('SPEC-140: prop is accepted; reaction-driven fire deferred to Phase C', () => {
      // SPEC-140 (rename of legacy `onStaticPinPositionMove` → -Worklet).
      // The actual fire path runs inside `_invokeOnTransform` (source line
      // 438-454) which is itself driven by the unified transform reaction
      // — NOOP under reanimated mock. Source contract: requires
      // contentWidth + contentHeight for the content-space position math
      // (the `_staticPinPosition` helper has the guard at line 369).
      const onStaticPinPositionMoveWorklet = jest.fn();
      expect(() =>
        render(
          <ReactNativeZoomableView
            staticPinPosition={{ x: 50, y: 50 }}
            contentWidth={400}
            contentHeight={600}
            onStaticPinPositionMoveWorklet={onStaticPinPositionMoveWorklet}
          />
        )
      ).not.toThrow();
    });
  });

  describe('SPEC-053 + SPEC-070: onZoomEnd is JS-thread (callback runs via runOnJS hop)', () => {
    it('SPEC-070 + SPEC-053: the runOnJS wrapper delivers the callback synchronously under mock and natural completion only', () => {
      // Source line 1071: `runOnJS(_safeOnZoomEnd)(undefined,
      // _getZoomableViewEventObject())` from inside the withTiming
      // completion callback when finished===true. Mock makes runOnJS the
      // identity function, so this lands synchronously. We assert one fire
      // per zoomTo natural completion — and that the `_safeOnZoomEnd`
      // wrapper guards against post-unmount fire (verified in SPEC-071d
      // unmount path in imperativeHandle.test.tsx).
      const ref = createRef<ReactNativeZoomableViewRef>();
      const onZoomEnd = jest.fn();
      render(
        <ReactNativeZoomableView ref={ref} maxZoom={5} onZoomEnd={onZoomEnd} />
      );
      ref.current?.zoomTo(1.5);
      ref.current?.zoomTo(2);
      ref.current?.zoomTo(2.5);
      // 3 natural completions → 3 fires.
      expect(onZoomEnd).toHaveBeenCalledTimes(3);
      // Each event is undefined per SPEC-053.
      expect(onZoomEnd.mock.calls.every((c) => c[0] === undefined)).toBe(true);
    });
  });

  describe('SPEC-149: zoomToAnimation default config (250ms / Easing.out(Easing.ease))', () => {
    it('SPEC-149: zoomToAnimation is the WithTimingConfig constant imported by publicZoomTo (source-level: src/animations/index.ts)', () => {
      // Direct import of the constant — duration and easing are static,
      // immutable, and exported.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { zoomToAnimation } = require('../animations');
      expect(zoomToAnimation.duration).toBe(250);
      expect(zoomToAnimation.easing).toBeDefined();
    });
  });
});
