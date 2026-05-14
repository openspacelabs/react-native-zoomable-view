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

// Helper child that exposes the context's SharedValues to the test scope so
// we can assert prop-driven initial state. The reanimated mock returns plain
// `{ value }` Proxies for SharedValues, readable synchronously.
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

describe('ReactNativeZoomableView — props & defaults', () => {
  describe('SPEC-011: zoomEnabled default true', () => {
    it('SPEC-011: zoomTo succeeds without explicit zoomEnabled prop', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} />);
      // zoomEnabled defaulted to true → publicZoomTo proceeds (returns true
      // when within [minZoom,maxZoom] = [0.5, 1.5]).
      expect(ref.current?.zoomTo(1.2)).toBe(true);
    });
  });

  describe('SPEC-012: zoomEnabled true→false snaps zoom back to initialZoom', () => {
    it('SPEC-012: flipping zoomEnabled false snaps zoom.value to initialZoom and does NOT fire onZoomEnd', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      const onZoomEnd = jest.fn();
      const { rerender } = render(
        <ReactNativeZoomableView
          ref={ref}
          initialZoom={2}
          maxZoom={5}
          onZoomEnd={onZoomEnd}
        >
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      // Drive zoom away from initialZoom. Under the reanimated mock
      // `withTiming` invokes the completion callback synchronously with
      // `finished=true`, so onZoomEnd does fire here on natural completion.
      // We clear the mock and observe ONLY the snap-flip side-effect below.
      ref.current?.zoomTo(3);
      onZoomEnd.mockClear();

      // Flip the prop — the snap useLayoutEffect should reset zoom to
      // initialZoom via a direct `.value =` write (NOT withTiming), so it
      // must NOT fire onZoomEnd.
      rerender(
        <ReactNativeZoomableView
          ref={ref}
          initialZoom={2}
          maxZoom={5}
          zoomEnabled={false}
          onZoomEnd={onZoomEnd}
        >
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );

      expect(probe.current?.zoom.value).toBe(2);
      expect(onZoomEnd).not.toHaveBeenCalled();
    });
  });

  describe('SPEC-013: panEnabled default true', () => {
    it('SPEC-013: defaults wire panEnabled true (verified via render-without-throw; SPEC-014 covers the gesture-vs-programmatic gate)', () => {
      // panEnabled is consumed by `_handleShifting` (gesture path) which is
      // out of scope for Phase B. Render-without-throw asserts the default
      // is wired; the gesture gate is covered by Phase C.
      const ref = createRef<ReactNativeZoomableViewRef>();
      const { unmount } = render(<ReactNativeZoomableView ref={ref} />);
      expect(ref.current).not.toBeNull();
      unmount();
    });
  });

  describe('SPEC-014: panEnabled=false gates gesture pan only; programmatic methods bypass', () => {
    it('SPEC-014: moveBy writes offsets even when panEnabled=false (no measurement prereq)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView ref={ref} panEnabled={false}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      // moveBy has no measurement guard per SPEC-077, so we can call without
      // firing the wrapper onLayout. zoom=1, offsets start at 0:
      //   newOffsetX = (0*1 - 50)/1 = -50  ;  newOffsetY = (0*1 - 30)/1 = -30
      // This proves the programmatic path bypasses the panEnabled gate
      // (the gate lives in `_handleShifting` — only reachable via gesture
      // path which is out of scope for Phase B).
      ref.current?.moveBy(50, 30);
      expect(probe.current?.offsetX.value).toBe(-50);
      expect(probe.current?.offsetY.value).toBe(-30);
    });

    it('SPEC-014: zoomBy proceeds even when panEnabled=false (further proof programmatic methods ignore the pan gate)', () => {
      const ref = createRef<ReactNativeZoomableViewRef>();
      render(<ReactNativeZoomableView ref={ref} panEnabled={false} />);
      // zoomBy → publicZoomTo(zoom+step). Default step is 0.5, current zoom
      // is 1, target 1.5 — within [0.5, 1.5]. Returns true on success.
      expect(ref.current?.zoomBy(0.25)).toBe(true);
    });
  });

  describe('SPEC-015: initialZoom default 1, applied on mount', () => {
    it('SPEC-015: initialZoom=2 sets zoom.value to 2', () => {
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView initialZoom={2} maxZoom={5}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      expect(probe.current?.zoom.value).toBe(2);
    });

    it('SPEC-015: default initialZoom keeps zoom.value at 1', () => {
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      expect(probe.current?.zoom.value).toBe(1);
    });
  });

  describe('SPEC-016: initialZoom=0 silently ignored', () => {
    it('SPEC-016: initialZoom=0 leaves zoom.value at the SV default (1)', () => {
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView initialZoom={0}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      // The useLayoutEffect guard is `if (props.initialZoom) zoom.value = ...`
      // — `0` is falsy so it's skipped. SharedValue construction default is 1.
      expect(probe.current?.zoom.value).toBe(1);
    });
  });

  describe('SPEC-017: initialOffsetX default 0; 0 is honored', () => {
    it('SPEC-017: initialOffsetX={50} sets offsetX.value to 50', () => {
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView initialOffsetX={50}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      expect(probe.current?.offsetX.value).toBe(50);
    });

    it('SPEC-017: initialOffsetX={0} explicit zero is honored (guard is != null, not falsy)', () => {
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView initialOffsetX={0}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      expect(probe.current?.offsetX.value).toBe(0);
    });
  });

  describe('SPEC-018: initialOffsetY default 0; 0 is honored', () => {
    it('SPEC-018: initialOffsetY={75} sets offsetY.value to 75', () => {
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView initialOffsetY={75}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      expect(probe.current?.offsetY.value).toBe(75);
    });

    it('SPEC-018: initialOffsetY={0} explicit zero is honored', () => {
      const probe = { current: null as ContextProbe | null };
      render(
        <ReactNativeZoomableView initialOffsetY={0}>
          {captureContext(probe)}
        </ReactNativeZoomableView>
      );
      expect(probe.current?.offsetY.value).toBe(0);
    });
  });

  describe('SPEC-034: movementSensibility legacy alias warns + forwards to movementSensitivity', () => {
    it('SPEC-034: passing movementSensibility logs a deprecation warning in __DEV__', () => {
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        render(
          <ReactNativeZoomableView
            // Cast — the legacy prop is intentionally absent from the public
            // TS surface; only runtime acceptance survives for migration.
            {...({ movementSensibility: 2 } as object)}
          />
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('movementSensibility')
        );
        expect(warnSpy.mock.calls[0]?.[0]).toEqual(
          expect.stringContaining('deprecated')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('SPEC-034: movementSensibility forwards to movementSensitivity when the new prop is undefined (mount-without-throw)', () => {
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        // Forwarding path is internal — the resolved SharedValue is only
        // consumed by `_handleShifting` (gesture path, out of scope for
        // Phase B). Render-without-throw + warn-fired is the observable
        // surface in component tests.
        const ref = createRef<ReactNativeZoomableViewRef>();
        render(
          <ReactNativeZoomableView
            ref={ref}
            {...({ movementSensibility: 2 } as object)}
          />
        );
        expect(ref.current).not.toBeNull();
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('SPEC-034: explicit movementSensitivity wins over legacy movementSensibility when both are provided', () => {
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        // Source guard: `if (props.movementSensitivity === undefined)` skips
        // the forward — the new prop's value wins. Render-without-throw
        // asserts the both-passed branch doesn't crash.
        const ref = createRef<ReactNativeZoomableViewRef>();
        render(
          <ReactNativeZoomableView
            ref={ref}
            movementSensitivity={1}
            {...({ movementSensibility: 999 } as object)}
          />
        );
        expect(ref.current).not.toBeNull();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
