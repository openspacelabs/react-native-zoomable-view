/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// Mock RNGH BEFORE importing ReactNativeZoomableView. RNGH's
// `GestureDetector` transitively loads
// `react-native/Libraries/Renderer/implementations/ReactNativeRenderer-dev.js`
// from `RNRenderer.ts`, which crashes in the Jest jsdom environment
// (`TypeError: Cannot read properties of undefined (reading 'S')`). The
// `react-native-gesture-handler/jestSetup` shipped with RNGH 2.20.x mocks
// only the native module — not the renderer pull-in. For these
// tree-shape tests we don't need real gesture wiring; `GestureDetector`
// becomes a pass-through function component (so it shows up in the tree
// as a child of the wrapper with displayName `GestureDetector`), and
// `Gesture.*` builders return inert chainable proxies.
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
import React from 'react';

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

const describeType = (n: RenderNode | undefined): string => {
  if (!n) return '<undefined>';
  if (typeof n.type === 'string') return n.type;
  const t = n.type as { displayName?: string; name?: string };
  return t.displayName ?? t.name ?? '<anon>';
};

const wrapperChildren = (
  wrapper: ReturnType<ReturnType<typeof render>['getByTestId']>
): RenderNode[] => wrapper.children as unknown as RenderNode[];

describe('ReactNativeZoomableView tree shape', () => {
  it('SPEC-086: wrapper View has GestureDetector among its direct children', () => {
    const { getByTestId } = render(<ReactNativeZoomableView />);
    const wrapper = getByTestId('zoom-subject-wrapper');
    const directChildren = wrapperChildren(wrapper);
    const gestureDetectorIdx = directChildren.findIndex(
      (child) => describeType(child) === 'GestureDetector'
    );
    expect(gestureDetectorIdx).toBeGreaterThanOrEqual(0);
  });

  it('SPEC-087: StaticPin is a sibling of GestureDetector — both direct children of the wrapper View, not nested', () => {
    const { getByTestId } = render(
      <ReactNativeZoomableView staticPinPosition={{ x: 100, y: 100 }} />
    );
    const wrapper = getByTestId('zoom-subject-wrapper');
    const directChildren = wrapperChildren(wrapper);

    const gestureDetectorIdx = directChildren.findIndex(
      (child) => describeType(child) === 'GestureDetector'
    );
    const pinIdx = directChildren.findIndex(
      (child) => describeType(child) === 'StaticPin'
    );

    // Both present as direct children of the wrapper — neither nested
    // beneath the other. Per SPEC-087/112, touches on interactive
    // StaticPin subregions are claimed by consumer gesture and never
    // reach the canvas GestureDetector, which only works when they're
    // siblings (not parent/child).
    expect(gestureDetectorIdx).toBeGreaterThanOrEqual(0);
    expect(pinIdx).toBeGreaterThanOrEqual(0);
  });

  it('SPEC-112: without renderOverlay, GestureDetector + StaticPin are the only structural siblings of interest under the wrapper (no NonScalingOverlay)', () => {
    const { getByTestId } = render(
      <ReactNativeZoomableView staticPinPosition={{ x: 50, y: 50 }} />
    );
    const wrapper = getByTestId('zoom-subject-wrapper');
    const directChildren = wrapperChildren(wrapper);

    const gestureDetectorIdx = directChildren.findIndex(
      (child) => describeType(child) === 'GestureDetector'
    );
    const pinIdx = directChildren.findIndex(
      (child) => describeType(child) === 'StaticPin'
    );
    const overlayIdx = directChildren.findIndex(
      (child) => describeType(child) === 'NonScalingOverlay'
    );

    expect(gestureDetectorIdx).toBeGreaterThanOrEqual(0);
    expect(pinIdx).toBeGreaterThanOrEqual(0);
    // No renderOverlay prop → NonScalingOverlay is conditionally not
    // rendered (ReactNativeZoomableView.tsx line 1738
    // `renderOverlay && (<NonScalingOverlay …>)`). Cross-ref EC-NSO-11
    // covers the WITH-overlay ordering; this assertion covers the
    // WITHOUT-overlay case so the StaticPin sibling-relation is verified
    // independently.
    expect(overlayIdx).toBe(-1);
    // GestureDetector precedes StaticPin in source order (paint order:
    // pin renders on top of the canvas-transformed layer).
    expect(gestureDetectorIdx).toBeLessThan(pinIdx);
  });

  it('SPEC-087/112: StaticPin subtree is NOT nested inside GestureDetector subtree', () => {
    const { getByTestId } = render(
      <ReactNativeZoomableView staticPinPosition={{ x: 100, y: 100 }} />
    );
    const wrapper = getByTestId('zoom-subject-wrapper');
    const directChildren = wrapperChildren(wrapper);

    // GestureDetector is mocked to pass-through children, so anything
    // mounted as its child appears under it in the RNTL tree. Walk the
    // GestureDetector subtree and confirm no StaticPin component name
    // is reachable underneath.
    const gestureDetectorChild = directChildren.find(
      (child) => describeType(child) === 'GestureDetector'
    );
    expect(gestureDetectorChild).toBeDefined();
    if (!gestureDetectorChild) {
      throw new Error('expected GestureDetector child present');
    }

    const containsStaticPin = (node: RenderNode | string): boolean => {
      if (typeof node === 'string') return false;
      if (describeType(node) === 'StaticPin') return true;
      const children = node.children;
      if (!children) return false;
      for (const c of children) {
        if (typeof c === 'string') continue;
        if (containsStaticPin(c)) return true;
      }
      return false;
    };

    expect(containsStaticPin(gestureDetectorChild)).toBe(false);
  });

  it('SPEC-042/043: visualTouchFeedbackEnabled — no AnimatedTouchFeedback mounted before any tap (touches state starts empty)', () => {
    const { getByTestId } = render(
      <ReactNativeZoomableView visualTouchFeedbackEnabled={true} />
    );
    const wrapper = getByTestId('zoom-subject-wrapper');
    const directChildren = wrapperChildren(wrapper);

    // `stateTouches` (ReactNativeZoomableView.tsx line 1712) starts as
    // an empty array; the `.map(...)` produces no children until a tap
    // adds an entry via `_addTouch`. The post-tap mount is covered by
    // Phase C's gesture-driven tests (SPEC-042) which can drive the
    // tap path via direct gesture-handler invocation. Here we only
    // assert the pre-tap baseline so the gesture-mount delta is
    // measurable.
    const feedbackIdx = directChildren.findIndex(
      (child) => describeType(child) === 'AnimatedTouchFeedback'
    );
    expect(feedbackIdx).toBe(-1);
  });
});
