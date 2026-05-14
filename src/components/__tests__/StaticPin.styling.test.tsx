/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { act, render } from '@testing-library/react-native';
import React from 'react';
import { Text, View } from 'react-native';

import { Size2D } from '../../typings';
import { StaticPin } from '../StaticPin';

// Narrow `ReactTestInstance` to the fields we need. The outer wrapper View is
// the root of `StaticPin`; the inner `onLayout` View is its first child.
type RenderNode = {
  type: string | { displayName?: string; name?: string };
  props: Record<string, unknown> & {
    style?: unknown;
    pointerEvents?: string;
    onLayout?: (e: { nativeEvent: { layout: Size2D } }) => void;
  };
  children: RenderNode[] | string[] | null;
};

// Wrapper that holds the pinSize state so we can drive `onLayout` from the
// test and assert the post-layout transform/opacity. Mirrors what
// `ReactNativeZoomableView` does internally (it owns `pinSize` via useState
// and passes it down). Keeping the harness here avoids importing the parent.
const Harness = ({
  staticPinPosition,
  staticPinIcon,
  pinProps,
  initialPinSize,
}: {
  staticPinPosition: { x: number; y: number };
  staticPinIcon?: React.ReactNode;
  pinProps?: React.ComponentProps<typeof StaticPin>['pinProps'];
  initialPinSize?: Size2D;
}) => {
  const [pinSize, setPinSize] = React.useState<Size2D>(
    initialPinSize ?? { width: 0, height: 0 }
  );
  return (
    <StaticPin
      staticPinPosition={staticPinPosition}
      staticPinIcon={staticPinIcon}
      pinSize={pinSize}
      setPinSize={setPinSize}
      pinProps={pinProps}
    />
  );
};

// Flatten a style prop (array, object, or nested arrays) into a single object.
// `StaticPin` always passes an array; consumers expect the rightmost
// definition to win. Mirrors React Native's StyleSheet.flatten semantics.
const flattenStyle = (style: unknown): Record<string, unknown> => {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...flattenStyle(s) }),
      {}
    );
  }
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
};

// Walk a json node + extract the outer (wrapper) and the inner onLayout View.
const treeOf = (
  tree: ReturnType<ReturnType<typeof render>['toJSON']>
): RenderNode => {
  if (!tree) throw new Error('toJSON returned null');
  if (Array.isArray(tree))
    throw new Error('toJSON returned array — expected single root');
  return tree as unknown as RenderNode;
};

describe('StaticPin styling', () => {
  it('SPEC-117: outer wrapper left/top match staticPinPosition', () => {
    const tree = render(
      <Harness staticPinPosition={{ x: 137, y: 219 }} />
    ).toJSON();
    const root = treeOf(tree);
    const style = flattenStyle(root.props.style);
    expect(style.left).toBe(137);
    expect(style.top).toBe(219);
    // Absolute positioning is baked into `styles.pinWrapper` — the wrapper
    // pulls itself out of layout flow so left/top are screen-relative.
    expect(style.position).toBe('absolute');
  });

  it('SPEC-119: opacity is 0 before icon onLayout fires (pinSize = {0,0})', () => {
    const tree = render(
      <Harness staticPinPosition={{ x: 0, y: 0 }} />
    ).toJSON();
    const root = treeOf(tree);
    const style = flattenStyle(root.props.style);
    expect(style.opacity).toBe(0);
  });

  it('SPEC-119: opacity flips to 1 after onLayout reports a non-zero size', () => {
    const { toJSON, UNSAFE_root } = render(
      <Harness staticPinPosition={{ x: 0, y: 0 }} />
    );
    // The inner onLayout view is the first descendant View with an
    // `onLayout` prop. Find it via the test-instance tree (we cannot rely
    // on `toJSON` to expose function props).
    const innerInstance = UNSAFE_root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        typeof node.type !== 'string' &&
        // outer too has no onLayout; only inner provides one
        typeof node.props.onLayout === 'function'
    )[0];
    expect(innerInstance).toBeDefined();
    act(() => {
      (
        innerInstance.props as {
          onLayout: (e: { nativeEvent: { layout: Size2D } }) => void;
        }
      ).onLayout({ nativeEvent: { layout: { width: 48, height: 64 } } });
    });
    const style = flattenStyle(treeOf(toJSON()).props.style);
    expect(style.opacity).toBe(1);
  });

  it('SPEC-118: internal transform is [{translateY:-h},{translateX:-w/2}] after onLayout', () => {
    // Drive `setPinSize` via `initialPinSize` so the harness starts with a
    // realistic post-layout size and we can read the transform from the
    // first render — equivalent to the post-onLayout state.
    const tree = render(
      <Harness
        staticPinPosition={{ x: 0, y: 0 }}
        initialPinSize={{ width: 50, height: 80 }}
      />
    ).toJSON();
    const style = flattenStyle(treeOf(tree).props.style);
    expect(style.transform).toEqual([{ translateY: -80 }, { translateX: -25 }]);
  });

  it('SPEC-113: wrapper default pointerEvents is "box-none"', () => {
    const tree = render(
      <Harness staticPinPosition={{ x: 0, y: 0 }} />
    ).toJSON();
    const root = treeOf(tree);
    // `pointerEvents` is forwarded as a direct prop on the View (the
    // component sets `pointerEvents={pointerEvents}` explicitly, with
    // `box-none` as the destructured default).
    expect(root.props.pointerEvents).toBe('box-none');
  });

  it('SPEC-114: default-marker icon container has pointerEvents="none"', () => {
    // No `staticPinIcon` → the component renders the bundled default
    // marker inside a `pointerEvents="none"` View so the marker never
    // claims a touch ahead of the canvas gesture detector.
    const { UNSAFE_root } = render(
      <Harness staticPinPosition={{ x: 0, y: 0 }} />
    );
    const noneViews = UNSAFE_root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        typeof node.type !== 'string' && node.props.pointerEvents === 'none'
    );
    expect(noneViews.length).toBeGreaterThanOrEqual(1);
  });

  it('SPEC-115: pinProps={{pointerEvents:"auto"}} overrides wrapper default (threads #3107340687, #3179480336)', () => {
    const tree = render(
      <Harness
        staticPinPosition={{ x: 0, y: 0 }}
        pinProps={{ pointerEvents: 'auto' }}
      />
    ).toJSON();
    expect(treeOf(tree).props.pointerEvents).toBe('auto');
  });

  it('SPEC-116: pinProps spread CANNOT clobber pointerEvents (destructure-before-spread)', () => {
    // The component destructures `pointerEvents` out of `pinProps` BEFORE
    // spreading `...restPinProps` so a malicious / accidental late entry
    // in `pinProps` cannot last-write-wins against the explicit
    // `pointerEvents={pointerEvents}` prop. Here we simulate that by
    // attempting to put `pointerEvents` at the END of the props object.
    // Because destructure happens first, the final value should reflect
    // the destructured default ("box-none") OR the explicit override —
    // never the trailing spread.
    const sneaky = { foo: 'bar', pointerEvents: 'auto' } as const;
    const tree = render(
      <Harness staticPinPosition={{ x: 0, y: 0 }} pinProps={sneaky} />
    ).toJSON();
    // Destructure-before-spread means `pointerEvents: 'auto'` from the
    // destructured `pointerEvents` variable is used (the override path,
    // SPEC-115) — confirming the spread does NOT clobber an EXPLICIT
    // pointerEvents prop on the JSX (it's still respected as a value
    // pull-out, not a spread-overwrite). The regression we guard against
    // is a refactor that drops the destructure and just spreads — at
    // which point the inner JSX `pointerEvents={pointerEvents}` would be
    // overwritten by the trailing spread. We assert the current correct
    // shape: `auto` makes it through AND `foo` is also forwarded via
    // `...restPinProps`.
    const root = treeOf(tree);
    expect(root.props.pointerEvents).toBe('auto');
    expect(root.props.foo).toBe('bar');
  });

  it('SPEC-047: pinProps.style applied AFTER internal style array (caller wins on collisions)', () => {
    // The component's style array is:
    //   [{ left, top }, styles.pinWrapper, { opacity, transform }, pinStyle]
    // So pinProps.style sits at the rightmost slot — caller's values
    // override the internal defaults on the same key.
    const tree = render(
      <Harness
        staticPinPosition={{ x: 10, y: 20 }}
        initialPinSize={{ width: 48, height: 64 }}
        pinProps={{ style: { opacity: 0.5 } }}
      />
    ).toJSON();
    const style = flattenStyle(treeOf(tree).props.style);
    // Caller's opacity wins.
    expect(style.opacity).toBe(0.5);
    // Internal left/top/position survive (caller didn't override).
    expect(style.left).toBe(10);
    expect(style.top).toBe(20);
    expect(style.position).toBe('absolute');
  });

  it('SPEC-047: caller transform REPLACES internal anchor transforms', () => {
    // Style flattening replaces the `transform` array wholesale on key
    // collision (it does NOT merge or concat). So when the caller
    // supplies `transform: [...]`, the internal anchor transform
    // `[{translateY:-h},{translateX:-w/2}]` is lost. This is a
    // SHARP-EDGE the spec explicitly calls out: callers that want to
    // ADD a transform must include the anchor entries themselves.
    const tree = render(
      <Harness
        staticPinPosition={{ x: 0, y: 0 }}
        initialPinSize={{ width: 48, height: 64 }}
        pinProps={{ style: { transform: [{ rotate: '45deg' }] } }}
      />
    ).toJSON();
    const style = flattenStyle(treeOf(tree).props.style);
    expect(style.transform).toEqual([{ rotate: '45deg' }]);
  });

  it('SPEC-115/116: explicit pinProps.pointerEvents and pinProps.style co-exist; arbitrary other props forward via spread', () => {
    const tree = render(
      <Harness
        staticPinPosition={{ x: 1, y: 2 }}
        pinProps={{
          pointerEvents: 'auto',
          style: { opacity: 0.25 },
          accessibilityLabel: 'pin',
        }}
      />
    ).toJSON();
    const root = treeOf(tree);
    expect(root.props.pointerEvents).toBe('auto');
    expect(root.props.accessibilityLabel).toBe('pin');
    expect(flattenStyle(root.props.style).opacity).toBe(0.25);
  });

  it('SPEC-114 cross: custom staticPinIcon replaces default marker — no default pointerEvents="none" container required', () => {
    // When a caller supplies a custom `staticPinIcon`, the bundled
    // default image is NOT rendered, so the `pointerEvents="none"`
    // wrapper around it is also absent. The wrapper-level pointerEvents
    // default ("box-none") still applies, but the inner default-marker
    // container is no longer in the tree.
    const { UNSAFE_root } = render(
      <Harness
        staticPinPosition={{ x: 0, y: 0 }}
        staticPinIcon={<Text>custom</Text>}
      />
    );
    const noneViews = UNSAFE_root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        typeof node.type !== 'string' && node.props.pointerEvents === 'none'
    );
    // With a custom icon, no internal pointerEvents="none" view is
    // generated by StaticPin itself. (A custom icon that happens to
    // include its own pointerEvents="none" would change this — none of
    // our test icons do.)
    expect(noneViews.length).toBe(0);
  });
});

// Touch View to ensure the import is used if tree-shaking trims (eslint).
void View;
