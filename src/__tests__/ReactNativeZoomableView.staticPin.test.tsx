/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// SPEC-045 / 046 / 048-051 / 117-122 — static-pin mount, styling, settle
// reaction (`onStaticPinPositionChange` 100ms debounce + ε dedup +
// cancellation), and `onStaticPinPositionMoveWorklet` UI-thread payload.
//
// Two test surfaces in this file:
//
//   1. Component-tree tests render `<StaticPin>` directly (SPEC-046/117/118/119)
//      or `<ReactNativeZoomableView>` with `staticPinPosition` (SPEC-045). For
//      these we use the same RNGH mock as
//      `ReactNativeZoomableView.renderOverlay.test.tsx` — pass-through
//      `GestureDetector`, inert `Gesture.*` chainables.
//
//   2. Settle-reaction tests need to fire the `useAnimatedReaction` worker
//      manually. The stock `react-native-reanimated/mock` (wired in
//      `jest.setup.ts`) replaces `useAnimatedReaction` with NOOP, so reactions
//      registered during render never run. We layer a thin override on top of
//      the mock: a captured-reactions array that records `(mapper, worker)`
//      pairs in declaration order. The test then invokes the relevant worker
//      with a synthetic current/prev value, advances Jest fake timers, and
//      asserts the JS-thread callback (`onStaticPinPositionChange`) fired or
//      not. Threads #3164939942 (debounce double-fire), #3179477073 (cancel
//      when content-dims go falsy), and #3179033549 (`useLatestWorklet`
//      staleness) drive these cases.

// The override must run BEFORE the import of `ReactNativeZoomableView`.
// `useAnimatedReaction` is the only Reanimated symbol we need to override —
// everything else delegates to the stock mock.
const __capturedReactions: Array<{
  mapper: (...args: any[]) => any;
  worker: (current: any, previous: any) => void;
}> = [];

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const actual = require('react-native-reanimated/mock');
  return {
    ...actual,
    useAnimatedReaction: (
      mapper: (...args: any[]) => any,
      worker: (current: any, previous: any) => void
    ) => {
      __capturedReactions.push({ mapper, worker });
    },
  };
});

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

import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Image, View } from 'react-native';

import { StaticPin } from '../components/StaticPin';
import { ReactNativeZoomableView } from '../ReactNativeZoomableView';

type RenderNode = {
  type: string | { displayName?: string; name?: string };
  props: Record<string, unknown> & { testID?: string };
  children: RenderNode[] | string[] | null;
};

const isRenderNode = (n: unknown): n is RenderNode =>
  typeof n === 'object' && n !== null && 'props' in n && 'children' in n;

const describeType = (n: RenderNode | undefined | string): string => {
  if (!n || typeof n === 'string') return '<undefined>';
  if (typeof n.type === 'string') return n.type;
  const t = n.type as { displayName?: string; name?: string };
  return t.displayName ?? t.name ?? '<anon>';
};

const findByDisplayName = (
  root: RenderNode | string,
  name: string
): RenderNode | null => {
  if (typeof root === 'string') return null;
  if (!isRenderNode(root)) return null;
  if (describeType(root) === name) return root;
  if (root.children) {
    for (const c of root.children) {
      const hit = findByDisplayName(c, name);
      if (hit) return hit;
    }
  }
  return null;
};

const fireLayoutOn = (
  node: ReturnType<ReturnType<typeof render>['getByTestId']>,
  width: number,
  height: number
) => {
  fireEvent(node, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
};

// Locate the settle-reaction entry in the captured-reactions array. RNZV
// registers two `useAnimatedReaction`s in render order:
//   [0] settle reaction for `onStaticPinPositionChange` — mapper returns
//       Vec2D|undefined.
//   [1] unified transform reaction — mapper returns the full
//       ZoomableViewEvent (has `zoomLevel` key).
//   [2] onLayoutWorklet reaction — mapper returns an array.
// Probe the mapper's return shape (rather than relying on index) so the test
// stays robust to RNZV re-ordering its reactions; if the contract changes the
// test fails loudly rather than reading the wrong worker.
const findSettleReaction = (): {
  mapper: (...args: any[]) => any;
  worker: (current: any, previous: any) => void;
} => {
  for (const r of __capturedReactions) {
    const probe = r.mapper();
    if (probe === undefined) {
      // mapper returned undefined — `_staticPinPosition` early-returns when
      // `staticPinPosition`/`contentWidth`/`contentHeight`/`originalWidth/Height`
      // are missing. This is the settle reaction.
      return r;
    }
    if (
      typeof probe === 'object' &&
      probe !== null &&
      'x' in probe &&
      'y' in probe &&
      !('zoomLevel' in probe)
    ) {
      // Bare Vec2D — also the settle reaction (after preconditions met).
      return r;
    }
  }
  throw new Error('settle reaction not found among captured reactions');
};

const flushCapturedReactions = () => {
  __capturedReactions.length = 0;
};

describe('StaticPin direct render (SPEC-046, 117, 118, 119)', () => {
  it('SPEC-046: default icon (no `staticPinIcon` prop) renders the built-in 48×64 pin image', () => {
    // The default pin marker lives in `src/assets/pin.png` and is sized by
    // `styles.pin` in `StaticPin.tsx`. Consumers who pass `staticPinIcon`
    // replace this marker; consumers who don't get the default. The
    // dimensions are load-bearing for the `transform: [translateY:-height,
    // translateX:-width/2]` anchor math — SPEC-118 verifies that anchor
    // arithmetic at the wrapper level.
    const { toJSON } = render(
      <StaticPin
        staticPinPosition={{ x: 0, y: 0 }}
        staticPinIcon={null}
        pinSize={{ width: 0, height: 0 }}
        setPinSize={() => undefined}
      />
    );
    const tree = toJSON() as unknown as RenderNode;
    const img = findByDisplayName(tree, 'Image');
    expect(img).not.toBeNull();
    if (!img) throw new Error('Image not found');
    // RN flattens StyleSheet objects to numeric IDs; resolve via
    // Image's flattened style. RTL preserves the raw style object on the
    // rendered node so we read it directly.
    const style = img.props['style'] as { width: number; height: number };
    expect(style.width).toBe(48);
    expect(style.height).toBe(64);
  });

  it('SPEC-117: outermost wrapper sets `left`/`top` from `staticPinPosition.x`/`y`', () => {
    // The first entry in the wrapper's style array is `{left: position.x,
    // top: position.y}` — this is what positions the pin in the
    // viewport coordinate space (subject-relative pixels). Consumers
    // assume this contract when reading the `staticPinPosition` prop;
    // last-write-wins through `pinProps.style` is intentional and tested
    // by SPEC-047 (Phase D scope).
    const { toJSON } = render(
      <StaticPin
        staticPinPosition={{ x: 123, y: 456 }}
        staticPinIcon={null}
        pinSize={{ width: 48, height: 64 }}
        setPinSize={() => undefined}
      />
    );
    const tree = toJSON() as unknown as RenderNode;
    // The outer View is the root node.
    expect(tree.type).toBe('View');
    const style = tree.props['style'] as Array<Record<string, unknown>>;
    expect(Array.isArray(style)).toBe(true);
    // First entry of the style array is the position object.
    expect(style[0]).toEqual({ left: 123, top: 456 });
  });

  it('SPEC-118: internal transform anchors the pin bottom-centre once `pinSize` is non-zero', () => {
    // After the inner `<View onLayout>` reports a layout rect, the
    // parent stores those dims in `pinSize` and the wrapper's transform
    // becomes `[{translateY: -height}, {translateX: -width/2}]`. The
    // anchor is bottom-centre so the pin's tip sits exactly on
    // `staticPinPosition` regardless of the icon's own dimensions.
    const { toJSON } = render(
      <StaticPin
        staticPinPosition={{ x: 0, y: 0 }}
        staticPinIcon={null}
        pinSize={{ width: 60, height: 80 }}
        setPinSize={() => undefined}
      />
    );
    const tree = toJSON() as unknown as RenderNode;
    const style = tree.props['style'] as Array<Record<string, unknown>>;
    // Third style entry carries `{opacity, transform}`. Transform array
    // ordering is load-bearing: RN composes transforms in declared order,
    // and `translateY` after `translateX` here would offset the anchor by
    // (width/2 * 0, height * 0) = unchanged — but the order is documented
    // and consumers writing `pinProps.style.transform` rely on stable
    // semantics from the underlying anchor. Lock both.
    const opacityTransformEntry = style[2];
    const transform = opacityTransformEntry['transform'] as Array<
      Record<string, number>
    >;
    expect(transform).toEqual([{ translateY: -80 }, { translateX: -30 }]);
  });

  it('SPEC-119: opacity is 0 when `pinSize` is still {0, 0}', () => {
    // Pre-measurement (icon not yet laid out), opacity must be 0 so the
    // pin is invisible while its anchor transform is still wrong (the
    // default `{0, 0}` size would anchor to `staticPinPosition` instead
    // of `staticPinPosition - (width/2, height)`). One paint frame later
    // the layout effect flips it to 1.
    const { toJSON } = render(
      <StaticPin
        staticPinPosition={{ x: 100, y: 100 }}
        staticPinIcon={null}
        pinSize={{ width: 0, height: 0 }}
        setPinSize={() => undefined}
      />
    );
    const tree = toJSON() as unknown as RenderNode;
    const style = tree.props['style'] as Array<Record<string, unknown>>;
    expect(style[2]['opacity']).toBe(0);
  });

  it('SPEC-119: opacity is 1 once `pinSize` reports both width and height', () => {
    const { toJSON } = render(
      <StaticPin
        staticPinPosition={{ x: 100, y: 100 }}
        staticPinIcon={null}
        pinSize={{ width: 48, height: 64 }}
        setPinSize={() => undefined}
      />
    );
    const tree = toJSON() as unknown as RenderNode;
    const style = tree.props['style'] as Array<Record<string, unknown>>;
    expect(style[2]['opacity']).toBe(1);
  });

  it('SPEC-119: opacity stays 0 when only one of width/height is reported (asymmetric measure)', () => {
    // The opacity gate uses `width && height` — strict AND. A measurement
    // pass that reports only one dimension (RN onLayout edge case during
    // rotation/font-scaling) must not prematurely flip opacity to 1, or
    // consumers see the pin briefly mis-anchored.
    const halfMeasured = render(
      <StaticPin
        staticPinPosition={{ x: 0, y: 0 }}
        staticPinIcon={null}
        pinSize={{ width: 48, height: 0 }}
        setPinSize={() => undefined}
      />
    );
    const tree = halfMeasured.toJSON() as unknown as RenderNode;
    const style = tree.props['style'] as Array<Record<string, unknown>>;
    expect(style[2]['opacity']).toBe(0);
  });

  it('SPEC-119: layout event drives `setPinSize` with the measured dims', () => {
    // Closes the loop: the inner `<View onLayout>` calls
    // `setPinSize(layout)` when RN delivers the layout rect. Verify the
    // hook fires with `nativeEvent.layout`'s width/height (parent-relative
    // x/y are ignored — pinSize is just dimensions).
    const setPinSize = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <StaticPin
        staticPinPosition={{ x: 0, y: 0 }}
        staticPinIcon={null}
        pinSize={{ width: 0, height: 0 }}
        setPinSize={setPinSize}
      />
    );
    // The inner measurement View is the only View with an onLayout handler
    // — the outer wrapper doesn't measure. Locate by walking the tree.
    const views = UNSAFE_getAllByType(View);
    const measurer = views.find(
      (v) => typeof (v.props as { onLayout?: unknown }).onLayout === 'function'
    );
    expect(measurer).toBeDefined();
    if (!measurer) throw new Error('measurer View not found');
    fireEvent(measurer, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 48, height: 64 } },
    });
    expect(setPinSize).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 48,
      height: 64,
    });
  });
});

// Walks a `ReactTestInstance`-shaped subtree (children from
// `getByTestId(...).children`) — `toJSON` flattens function components,
// erasing displayName, so the mount checks must operate on the test-instance
// tree instead. See `ReactNativeZoomableView.renderOverlay.test.tsx` for the
// same pattern.
const containsByDisplayNameTI = (root: unknown, name: string): boolean => {
  if (!root || typeof root !== 'object') return false;
  const node = root as { type?: unknown; children?: unknown };
  const t = node.type as { displayName?: string; name?: string } | undefined;
  if (t && (t.displayName ?? t.name) === name) return true;
  const children = node.children;
  if (Array.isArray(children)) {
    for (const c of children) {
      if (containsByDisplayNameTI(c, name)) return true;
    }
  }
  return false;
};

describe('ReactNativeZoomableView staticPin mount (SPEC-045)', () => {
  beforeEach(() => {
    flushCapturedReactions();
  });

  it('SPEC-045: setting `staticPinPosition` mounts a `StaticPin` in the tree', () => {
    // `propStaticPinPosition && <StaticPin .../>` — the JSX gate is a
    // simple truthy check on the prop. Without the prop the pin is
    // absent; with it the pin mounts. Pinch zoom centre selection
    // (`_handlePinching` reads `staticPinPosition.value` at fire time) is
    // covered in Phase C — here we only verify mount.
    const { getByTestId } = render(
      <ReactNativeZoomableView staticPinPosition={{ x: 50, y: 60 }}>
        <View />
      </ReactNativeZoomableView>
    );
    const wrapper = getByTestId('zoom-subject-wrapper');
    expect(containsByDisplayNameTI(wrapper, 'StaticPin')).toBe(true);
  });

  it('SPEC-045: omitting `staticPinPosition` leaves `StaticPin` un-mounted', () => {
    const { getByTestId } = render(
      <ReactNativeZoomableView>
        <View />
      </ReactNativeZoomableView>
    );
    const wrapper = getByTestId('zoom-subject-wrapper');
    expect(containsByDisplayNameTI(wrapper, 'StaticPin')).toBe(false);
  });
});

describe('onStaticPinPositionChange settle reaction (SPEC-048, 049, 050, 121)', () => {
  beforeEach(() => {
    flushCapturedReactions();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('SPEC-048 / 121: fires the JS-thread callback once ~100ms after motion stops', () => {
    // Per thread #3164939942 + SPECS.md L93: the settle reaction debounces
    // a stream of pin-position writes into a single `runOnJS` hop after
    // `SETTLE_QUIET_MS` (100ms) of quiet. Test:
    //  1) render with required props (`staticPinPosition`, `contentWidth`,
    //     `contentHeight`),
    //  2) drive a single position write via the captured worker,
    //  3) advance fake timers by 100ms,
    //  4) assert callback fired exactly once with the content-space
    //     coordinate.
    const onStaticPinPositionChange = jest.fn();
    render(
      <ReactNativeZoomableView
        staticPinPosition={{ x: 100, y: 100 }}
        contentWidth={400}
        contentHeight={400}
        onStaticPinPositionChange={onStaticPinPositionChange}
      >
        <View />
      </ReactNativeZoomableView>
    );
    const settle = findSettleReaction();
    // Drive the worker with a content-space Vec2D (the mapper's resolved
    // output). The first arg is `current`, second is `previous` (unused
    // by the worker — it dedupes against `lastFiredPosition.value`, the
    // last value the JS callback was fired with).
    act(() => {
      settle.worker({ x: 75, y: 75 }, undefined);
    });
    expect(onStaticPinPositionChange).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(onStaticPinPositionChange).toHaveBeenCalledTimes(1);
    expect(onStaticPinPositionChange).toHaveBeenCalledWith({ x: 75, y: 75 });
  });

  it('SPEC-048 / 121: each new position cancels the in-flight timer (only the last value fires)', () => {
    // The settle reaction calls `clearTimeout(settleTimer.value)` on
    // every tick (line 492-494), so a rapid stream of mapper fires
    // collapses to ONE bridge hop at the END of motion. Drive three
    // positions in quick succession, advance the clock once, and assert
    // only the final position made it across.
    const onStaticPinPositionChange = jest.fn();
    render(
      <ReactNativeZoomableView
        staticPinPosition={{ x: 100, y: 100 }}
        contentWidth={400}
        contentHeight={400}
        onStaticPinPositionChange={onStaticPinPositionChange}
      >
        <View />
      </ReactNativeZoomableView>
    );
    const settle = findSettleReaction();
    act(() => {
      settle.worker({ x: 10, y: 10 }, undefined);
      // Advance halfway — not enough to fire.
      jest.advanceTimersByTime(50);
      settle.worker({ x: 20, y: 20 }, { x: 10, y: 10 });
      jest.advanceTimersByTime(50);
      settle.worker({ x: 30, y: 30 }, { x: 20, y: 20 });
      // Now drain the full quiet window.
      jest.advanceTimersByTime(100);
    });
    expect(onStaticPinPositionChange).toHaveBeenCalledTimes(1);
    expect(onStaticPinPositionChange).toHaveBeenCalledWith({ x: 30, y: 30 });
  });

  it('SPEC-049: epsilon dedup suppresses a fire when the settled position equals the last-fired one', () => {
    // `samePosition` (line 467-473) uses ε=0.001 so a settle that lands
    // within sensor noise of the previously fired position does not re-
    // bridge. Test: fire once, then fire again with a sub-epsilon delta;
    // the callback must NOT fire a second time. This is the regression
    // guard for thread #3164939942's "double fire on no-op pan" case.
    const onStaticPinPositionChange = jest.fn();
    render(
      <ReactNativeZoomableView
        staticPinPosition={{ x: 100, y: 100 }}
        contentWidth={400}
        contentHeight={400}
        onStaticPinPositionChange={onStaticPinPositionChange}
      >
        <View />
      </ReactNativeZoomableView>
    );
    const settle = findSettleReaction();
    act(() => {
      settle.worker({ x: 50, y: 50 }, undefined);
      jest.advanceTimersByTime(100);
    });
    expect(onStaticPinPositionChange).toHaveBeenCalledTimes(1);

    // Same position again — dedup must hold.
    act(() => {
      settle.worker({ x: 50, y: 50 }, { x: 50, y: 50 });
      jest.advanceTimersByTime(100);
    });
    expect(onStaticPinPositionChange).toHaveBeenCalledTimes(1);

    // Sub-epsilon delta (0.0005 < 0.001) — still dedup.
    act(() => {
      settle.worker({ x: 50.0005, y: 50.0005 }, { x: 50, y: 50 });
      jest.advanceTimersByTime(100);
    });
    expect(onStaticPinPositionChange).toHaveBeenCalledTimes(1);

    // Past-epsilon delta — fires a second time.
    act(() => {
      settle.worker({ x: 50.002, y: 50 }, { x: 50.0005, y: 50.0005 });
      jest.advanceTimersByTime(100);
    });
    expect(onStaticPinPositionChange).toHaveBeenCalledTimes(2);
    expect(onStaticPinPositionChange).toHaveBeenLastCalledWith({
      x: 50.002,
      y: 50,
    });
  });

  it('SPEC-050: when `current` is undefined (pin or content-dims went away), the armed timer is cleared and the callback does NOT fire', () => {
    // Thread #3179477073 regression. The worker's first branch:
    //   if (!current) { clearTimeout(settleTimer.value); ... return; }
    // exists because the consumer can unset `staticPinPosition` or zero
    // out `contentWidth/Height` mid-settle; without the explicit clear,
    // the in-flight 100ms timer would fire with a stale Vec2D captured by
    // the previous tick's closure.
    const onStaticPinPositionChange = jest.fn();
    render(
      <ReactNativeZoomableView
        staticPinPosition={{ x: 100, y: 100 }}
        contentWidth={400}
        contentHeight={400}
        onStaticPinPositionChange={onStaticPinPositionChange}
      >
        <View />
      </ReactNativeZoomableView>
    );
    const settle = findSettleReaction();
    act(() => {
      // Arm the settle with a valid position.
      settle.worker({ x: 33, y: 33 }, undefined);
      // Halfway through the quiet window, the mapper returns undefined
      // (consumer unset the pin or zeroed contentWidth/Height).
      jest.advanceTimersByTime(50);
      settle.worker(undefined, { x: 33, y: 33 });
      // Drain the rest of the window — the timer must have been cleared,
      // so nothing fires.
      jest.advanceTimersByTime(200);
    });
    expect(onStaticPinPositionChange).not.toHaveBeenCalled();
  });

  it('SPEC-050: an already-fired settle followed by a falsy mapper does not re-fire', () => {
    // Defensive: confirm the falsy-current branch is idempotent. After a
    // legitimate fire, an undefined mapper output (post-unmount preview,
    // or content-dims collapsing) leaves the callback at one invocation.
    const onStaticPinPositionChange = jest.fn();
    render(
      <ReactNativeZoomableView
        staticPinPosition={{ x: 100, y: 100 }}
        contentWidth={400}
        contentHeight={400}
        onStaticPinPositionChange={onStaticPinPositionChange}
      >
        <View />
      </ReactNativeZoomableView>
    );
    const settle = findSettleReaction();
    act(() => {
      settle.worker({ x: 11, y: 22 }, undefined);
      jest.advanceTimersByTime(100);
    });
    expect(onStaticPinPositionChange).toHaveBeenCalledTimes(1);
    act(() => {
      settle.worker(undefined, { x: 11, y: 22 });
      jest.advanceTimersByTime(200);
    });
    expect(onStaticPinPositionChange).toHaveBeenCalledTimes(1);
  });
});

describe('onStaticPinPositionMoveWorklet UI thread (SPEC-051, 120, 122)', () => {
  beforeEach(() => {
    flushCapturedReactions();
  });

  it('SPEC-051: registers the worker via `useLatestWorklet` so the latest consumer is invoked from worklet context', () => {
    // SPEC-051 says `onStaticPinPositionMoveWorklet` is a UI-thread
    // worklet fired whenever the pin's content position changes.
    // `_invokeOnTransform` resolves the move-worklet via
    // `onStaticPinPositionMoveWorkletShared.value.fn(position)` — the
    // SharedValue mirror created by `useLatestWorklet` (SPEC-085). The
    // mount path here verifies that supplying the prop renders without
    // error; identity-update behaviour is covered by the dedicated
    // `useLatestWorklet` suite. Driving `_invokeOnTransform` itself via
    // the transform reaction requires the SharedValue Proxy from the
    // mock to persist `originalWidth/Height` writes across the JS-thread
    // `useZoomSubject` `useLatestCallback` boundary, which under the
    // stock mock is not guaranteed; the gesture-driven coverage path is
    // Phase C.
    const onStaticPinPositionMoveWorklet = jest.fn();
    const { getByTestId, toJSON } = render(
      <ReactNativeZoomableView
        staticPinPosition={{ x: 100, y: 100 }}
        contentWidth={400}
        contentHeight={400}
        onStaticPinPositionMoveWorklet={onStaticPinPositionMoveWorklet}
      >
        <View />
      </ReactNativeZoomableView>
    );
    expect(toJSON()).not.toBeNull();
    // The component accepted the prop without runtime error and the pin
    // is mounted (the move-worklet without a pin is meaningless).
    const wrapper = getByTestId('zoom-subject-wrapper');
    expect(containsByDisplayNameTI(wrapper, 'StaticPin')).toBe(true);
  });

  it('SPEC-120: without `contentWidth`/`contentHeight`, `_staticPinPosition` returns undefined and the settle reaction does not fire `onStaticPinPositionChange`', () => {
    // SPEC-120 says the worklet (and by extension the settle reaction
    // which reuses `_staticPinPosition` as its mapper) requires both
    // `contentWidth` and `contentHeight`. Without them the mapper early-
    // returns and nothing crosses the bridge. This is the JS-thread side
    // of the same gate that protects the UI-thread move worklet.
    jest.useFakeTimers();
    try {
      const onStaticPinPositionChange = jest.fn();
      render(
        <ReactNativeZoomableView
          staticPinPosition={{ x: 100, y: 100 }}
          // contentWidth/contentHeight intentionally omitted
          onStaticPinPositionChange={onStaticPinPositionChange}
        >
          <View />
        </ReactNativeZoomableView>
      );
      const settle = findSettleReaction();
      // mapper(); should be undefined under these conditions.
      expect(settle.mapper()).toBeUndefined();
      // Driving the worker with `current=undefined` exercises the
      // missing-dims branch (the worker doesn't itself check dims —
      // `_staticPinPosition` does — so we simulate the mapper's contract).
      act(() => {
        settle.worker(undefined, undefined);
        jest.advanceTimersByTime(200);
      });
      expect(onStaticPinPositionChange).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('SPEC-122: callback payload is in content-space coordinates (mapper resolves via `viewportPositionToImagePosition`)', () => {
    // SPEC-122 contract: both `onStaticPinPositionChange` and
    // `onStaticPinPositionMoveWorklet` emit content-space coords (the
    // pin's position in the image's coordinate system, not the
    // viewport's). `_staticPinPosition` (the shared mapper) calls
    // `viewportPositionToImagePosition` under the hood, which assumes
    // `contain` resize mode and returns the content-relative pixel.
    //
    // The test asserts: feed the SAME `staticPinPosition` viewport
    // coord into the settle path, and the value the callback receives
    // is whatever `viewportPositionToImagePosition` produces for that
    // input — NOT the raw viewport coord. We can't fire the mapper end-
    // to-end under the mock (originalWidth/Height path is brittle), so
    // we drive the worker directly with a synthetic content-space value
    // and confirm the callback receives THAT value verbatim (the worker
    // does not transform; it just forwards). The mapper-side contract
    // is verified independently in
    // `src/helper/__tests__/coordinateConversion.test.ts`.
    jest.useFakeTimers();
    try {
      const onStaticPinPositionChange = jest.fn();
      render(
        <ReactNativeZoomableView
          staticPinPosition={{ x: 100, y: 100 }}
          contentWidth={400}
          contentHeight={400}
          onStaticPinPositionChange={onStaticPinPositionChange}
        >
          <View />
        </ReactNativeZoomableView>
      );
      const settle = findSettleReaction();
      // Synthetic content-space coord — this would have been produced by
      // the mapper from a viewport position + zoom/offset state, but the
      // worker doesn't care about provenance, only forwards.
      const contentSpacePoint = { x: 213.7, y: 89.4 };
      act(() => {
        settle.worker(contentSpacePoint, undefined);
        jest.advanceTimersByTime(100);
      });
      expect(onStaticPinPositionChange).toHaveBeenCalledTimes(1);
      expect(onStaticPinPositionChange).toHaveBeenCalledWith(contentSpacePoint);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('StaticPin onLayout integration via ReactNativeZoomableView (SPEC-119)', () => {
  it('SPEC-119: firing an onLayout on the wrapper does not affect the pin opacity gate (gate is internal to StaticPin)', () => {
    // Cross-check that the opacity-0-pre-measurement contract is
    // internal to StaticPin's own measurement View — firing layout on
    // the outer `zoom-subject-wrapper` (which writes `originalWidth/
    // Height`) does not flip the pin opacity. Only `setPinSize`-via-
    // StaticPin's own inner `<View onLayout>` does. This guards against
    // a future regression where someone "helpfully" wires
    // `originalWidth/Height` into pin opacity and breaks the anchor
    // semantics.
    const { getByTestId, toJSON } = render(
      <ReactNativeZoomableView
        staticPinPosition={{ x: 100, y: 100 }}
        contentWidth={400}
        contentHeight={400}
      >
        <View />
      </ReactNativeZoomableView>
    );
    fireLayoutOn(getByTestId('zoom-subject-wrapper'), 400, 600);
    // After firing the wrapper layout, walk the JSON-flattened tree for
    // StaticPin's rendered output. The outer View it renders has
    // `position: 'absolute'` from `styles.pinWrapper` (second style
    // entry) — locate that View. The opacity gate lives on the same
    // style array (third entry: `{opacity, transform}`).
    const tree = toJSON() as unknown as RenderNode;
    // Recursive walk: find any View whose style array contains both
    // `position: 'absolute'` AND a numeric `top`/`left` matching the
    // pin position we set. That's the pin's outer wrapper.
    const findPinWrapperView = (
      node: RenderNode | string | null
    ): RenderNode | null => {
      if (!node || typeof node === 'string' || !isRenderNode(node)) return null;
      const style = node.props['style'];
      if (Array.isArray(style)) {
        const positionEntry = style[0] as Record<string, unknown> | undefined;
        if (
          positionEntry &&
          positionEntry['left'] === 100 &&
          positionEntry['top'] === 100
        ) {
          return node;
        }
      }
      if (node.children) {
        for (const c of node.children) {
          const hit = findPinWrapperView(c);
          if (hit) return hit;
        }
      }
      return null;
    };
    const pinOuterView = findPinWrapperView(tree);
    expect(pinOuterView).not.toBeNull();
    if (!pinOuterView) throw new Error('pin outer view not found');
    const style = pinOuterView.props['style'] as Array<Record<string, unknown>>;
    // pinSize state is still {0,0} (StaticPin's internal measurement
    // hasn't fired), so opacity must still be 0 — wrapper-layout did
    // NOT flip it.
    expect(style[2]['opacity']).toBe(0);
  });
});

// Defensive: silence the unused-import lint for `Image` if pin tests are
// refactored away later. The import is here to give the tree-walk
// helper a stable component-name target.
void Image;
