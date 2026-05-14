/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// RNGH mock — see ReactNativeZoomableView.renderOverlay.test.tsx for the
// same rationale. Importing the public API surface transitively pulls in
// GestureDetector → ReactNativeRenderer-dev, which crashes the Jest env.
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

import * as lib from '../index';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require('../../package.json') as {
  peerDependencies: Record<string, string>;
};

describe('public API exports (SPEC-001, 004, 010, 146)', () => {
  it('SPEC-004: ReactNativeZoomableView is exported', () => {
    expect(lib.ReactNativeZoomableView).toBeDefined();
  });

  it('SPEC-009: NonScalingOverlay is exported', () => {
    expect(lib.NonScalingOverlay).toBeDefined();
  });

  it('SPEC-008: useZoomableViewContext is exported as a function', () => {
    expect(typeof lib.useZoomableViewContext).toBe('function');
  });

  it('SPEC-010: coordinate conversion helpers are exported as functions', () => {
    expect(typeof lib.applyContainResizeMode).toBe('function');
    expect(typeof lib.getImageOriginOnTransformSubject).toBe('function');
    expect(typeof lib.viewportPositionToImagePosition).toBe('function');
  });
});

describe('peerDependencies (SPEC-001)', () => {
  it('declares react >=18.0.0', () => {
    expect(pkg.peerDependencies['react']).toMatch(/>=18\.0\.0/);
  });

  it('declares react-native >=0.79.0', () => {
    expect(pkg.peerDependencies['react-native']).toMatch(/>=0\.79\.0/);
  });

  it('declares react-native-gesture-handler ^2.20.2', () => {
    expect(pkg.peerDependencies['react-native-gesture-handler']).toMatch(
      /\^2\.20\.2/
    );
  });

  it('declares react-native-reanimated ^3.16.1', () => {
    expect(pkg.peerDependencies['react-native-reanimated']).toMatch(
      /\^3\.16\.1/
    );
  });
});
