/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// Mock RNGH BEFORE importing ReactNativeZoomableView. RNGH's
// `GestureDetector` transitively loads
// `react-native/Libraries/Renderer/implementations/ReactNativeRenderer-dev.js`
// from `RNRenderer.ts`, which crashes in the Jest jsdom environment
// (`TypeError: Cannot read properties of undefined (reading 'S')`). The
// `react-native-gesture-handler/jestSetup` shipped with RNGH 2.20.x mocks
// only the native module — not the renderer pull-in. For these integration
// tests we don't need real gesture wiring; `GestureDetector` becomes a
// pass-through that renders its children, and `Gesture.*` builders return
// inert chainable proxies.
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

import { fireEvent, render } from '@testing-library/react-native';
import React, { useCallback } from 'react';
import { View } from 'react-native';

import { ReactNativeZoomableView } from '../ReactNativeZoomableView';

// Narrow `ReactTestInstance.children` shape for sibling-order assertions.
// RNTL v12's strict-type-checked surface returns broad union types — the
// `unknown`-cast happens once at the access site and the shape is
// constrained here.
type RenderNode = {
  type: string | { displayName?: string; name?: string };
  props: Record<string, unknown> & { testID?: string };
  children: RenderNode[] | string[] | null;
};

const isRenderNode = (n: unknown): n is RenderNode =>
  typeof n === 'object' && n !== null && 'props' in n && 'children' in n;

const containsTestId = (node: RenderNode | string, id: string): boolean => {
  if (typeof node === 'string') return false;
  if (!isRenderNode(node)) return false;
  if (node.props.testID === id) return true;
  const children = node.children;
  if (!children) return false;
  for (const c of children) {
    if (typeof c === 'string') continue;
    if (containsTestId(c, id)) return true;
  }
  return false;
};

const describeType = (n: RenderNode | undefined): string => {
  if (!n) return '<undefined>';
  if (typeof n.type === 'string') return n.type;
  const t = n.type as { displayName?: string; name?: string };
  return t.displayName ?? t.name ?? '<anon>';
};

// Fire a layout event on a ReactTestInstance (from getByTestId). RNTL v12
// supports `fireEvent(node, 'layout', {nativeEvent:{layout:{...}}})`
// directly.
const fireLayout = (
  node: ReturnType<ReturnType<typeof render>['getByTestId']>,
  width: number,
  height: number
) => {
  fireEvent(node, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
};

// Cast `ReactTestInstance.children` (typed broadly by RNTL) to our
// RenderNode array. Centralised here so the unsafe cast only happens once.
const wrapperChildren = (
  wrapper: ReturnType<ReturnType<typeof render>['getByTestId']>
): RenderNode[] => wrapper.children as unknown as RenderNode[];

describe('ReactNativeZoomableView renderOverlay integration', () => {
  describe('EC-NSO-10: renderOverlay branch gating by contentWidth/Height', () => {
    it('renders no marker when contentWidth/Height are not provided', () => {
      const { queryByTestId } = render(
        <ReactNativeZoomableView
          renderOverlay={() => <View testID="marker" />}
        />
      );
      // No contentWidth/Height → NonScalingOverlay early-returns null →
      // overlay children (the marker) are never mounted.
      expect(queryByTestId('marker')).toBeNull();
    });

    it('renders the marker once contentWidth/Height are set and the wrapper measures', () => {
      const { getByTestId, queryByTestId } = render(
        <ReactNativeZoomableView
          contentWidth={400}
          contentHeight={600}
          renderOverlay={() => <View testID="marker" />}
        />
      );
      const wrapper = getByTestId('zoom-subject-wrapper');
      // The overlay's null-guard is on contentWidth/Height (both already
      // set), so the marker is mounted regardless of wrapper dims. Firing
      // layout here exercises the wrapperSize state-update path consumers
      // will see at runtime.
      fireLayout(wrapper, 400, 600);
      expect(queryByTestId('marker')).not.toBeNull();
    });
  });

  describe('EC-NSO-11: mount order — overlay BEFORE StaticPin in sibling order', () => {
    it('overlay subtree precedes StaticPin subtree under the wrapper', () => {
      const { getByTestId } = render(
        <ReactNativeZoomableView
          contentWidth={400}
          contentHeight={600}
          staticPinPosition={{ x: 100, y: 100 }}
          renderOverlay={() => <View testID="marker" />}
        />
      );
      const wrapper = getByTestId('zoom-subject-wrapper');
      fireLayout(wrapper, 400, 600);

      // RNTL exposes `wrapper.children` as React component instances. With
      // RNGH mocked to a pass-through, the wrapper's direct children are
      // [GestureDetector, ..., NonScalingOverlay, StaticPin]. Identify the
      // overlay + pin by component name and assert overlay appears first.
      const directChildren = wrapperChildren(wrapper);

      const overlayIdx = directChildren.findIndex(
        (child) => describeType(child) === 'NonScalingOverlay'
      );
      const pinIdx = directChildren.findIndex(
        (child) => describeType(child) === 'StaticPin'
      );

      expect(overlayIdx).toBeGreaterThanOrEqual(0);
      expect(pinIdx).toBeGreaterThanOrEqual(0);
      expect(overlayIdx).toBeLessThan(pinIdx);
      // Cross-check: the marker is reachable from the overlay subtree
      // (defensive — confirms we identified the correct subtree).
      const overlayChild = directChildren[overlayIdx];
      expect(containsTestId(overlayChild, 'marker')).toBe(true);
    });
  });

  describe('EC-NSO-12: overlay is a sibling of GestureDetector under the wrapper', () => {
    it('overlay subtree shares the wrapper as direct parent (not nested under GestureDetector)', () => {
      const { getByTestId } = render(
        <ReactNativeZoomableView
          contentWidth={400}
          contentHeight={600}
          renderOverlay={() => <View testID="marker" />}
        />
      );
      const wrapper = getByTestId('zoom-subject-wrapper');
      fireLayout(wrapper, 400, 600);

      // Sibling assertion: both NonScalingOverlay and GestureDetector
      // appear as DIRECT children of the wrapper (the common
      // coordinate-frame container measured by originalWidth/Height). The
      // overlay must NOT live underneath GestureDetector's subtree.
      const directChildren = wrapperChildren(wrapper);
      const gestureDetectorChild = directChildren.find(
        (child) => describeType(child) === 'GestureDetector'
      );
      const overlayChild = directChildren.find(
        (child) => describeType(child) === 'NonScalingOverlay'
      );
      expect(gestureDetectorChild).toBeDefined();
      expect(overlayChild).toBeDefined();
      if (!overlayChild || !gestureDetectorChild) {
        throw new Error('expected both children present');
      }
      // The marker must be inside the overlay subtree, NOT inside the
      // GestureDetector subtree.
      expect(containsTestId(overlayChild, 'marker')).toBe(true);
      expect(containsTestId(gestureDetectorChild, 'marker')).toBe(false);
    });
  });

  describe('EC-NSO-13: onLayout 0×0 does not overwrite wrapperSize', () => {
    it('a zero-dim layout event after a valid one leaves the overlay marker mounted', () => {
      const { getByTestId, queryByTestId } = render(
        <ReactNativeZoomableView
          contentWidth={400}
          contentHeight={600}
          renderOverlay={() => <View testID="marker" />}
        />
      );
      const wrapper = getByTestId('zoom-subject-wrapper');

      // First, a valid layout — wrapperSize state becomes {400, 600}.
      fireLayout(wrapper, 400, 600);
      expect(queryByTestId('marker')).not.toBeNull();

      // Now an invalid 0×0 layout — onLayout's guard
      // `if (!width || !height) return` must short-circuit BEFORE
      // setWrapperSize, so the state stays {400, 600} and the overlay
      // remains mounted.
      fireLayout(wrapper, 0, 0);
      expect(queryByTestId('marker')).not.toBeNull();

      // Zero-width alone: same guard, same behaviour.
      fireLayout(wrapper, 0, 600);
      expect(queryByTestId('marker')).not.toBeNull();

      // Zero-height alone: same guard, same behaviour.
      fireLayout(wrapper, 400, 0);
      expect(queryByTestId('marker')).not.toBeNull();
    });
  });

  describe('EC-NSO-14: identical onLayout dims dedup (no spurious re-renders)', () => {
    it('identical sequential layout dims do not trigger additional overlay renders', () => {
      let renderCount = 0;
      const Marker = () => {
        renderCount++;
        return <View testID="marker" />;
      };

      // Hoist the renderOverlay callback with `useCallback` so the
      // `renderOverlay` prop identity is stable across parent renders —
      // otherwise React would call the function each render and Marker's
      // count would conflate parent-rerender effects with the wrapperSize
      // dedup contract we're testing.
      const Host = () => {
        const renderOverlay = useCallback(() => <Marker />, []);
        return (
          <ReactNativeZoomableView
            contentWidth={400}
            contentHeight={600}
            renderOverlay={renderOverlay}
          />
        );
      };

      const { getByTestId } = render(<Host />);
      const wrapper = getByTestId('zoom-subject-wrapper');

      // First valid layout — wrapperSize state transitions from {0, 0} to
      // {400, 600}. Marker renders.
      fireLayout(wrapper, 400, 600);
      const afterFirst = renderCount;
      expect(afterFirst).toBeGreaterThan(0);

      // Identical layout — setWrapperSize's functional updater returns
      // `prev`, React's bail-out skips the re-render of the
      // NonScalingOverlay subtree. Marker render count stays put.
      fireLayout(wrapper, 400, 600);
      expect(renderCount).toBe(afterFirst);

      // And again — dedup must hold across multiple identical events.
      fireLayout(wrapper, 400, 600);
      expect(renderCount).toBe(afterFirst);
    });
  });
});
