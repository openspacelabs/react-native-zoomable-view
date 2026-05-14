/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-non-null-assertion */
/**
 * Phase F — scenario / near-e2e tests for `ReactNativeZoomableView`.
 *
 * Builds on the Phase E real-RNGH plumbing (see `src/__tests__/e2e/probe.test.tsx`
 * for the single-tap probe and `src/__tests__/gestures/*` for the per-spec
 * tests). The per-gesture tests assert one observable at a time
 * (`onZoomEnd` fired, `gestureType` latched). The scenarios below drive
 * realistic MULTI-FRAME touch sequences and verify end-to-end outcomes:
 *
 *   - callback payload SHAPES (`ZoomableViewEvent` keys and types)
 *   - callback payload VALUES (real numeric values reflecting the
 *     pan/pinch math after several frames)
 *   - callback ORDERING and counts across a full down→move(×N)→up cycle
 *   - the rendered inner `Animated.View`'s `transform` array carries the
 *     RNZV.tsx:1648 4-element [scaleX, scaleY, translateX, translateY]
 *     shape (read via `toJSON()` at INITIAL render — see fidelity wall §F2)
 *   - the `NonScalingOverlay`'s Animated.View has the
 *     `computeOverlayTransform` 5-element transform shape (initial render)
 *
 * Fidelity walls under `react-native-reanimated/mock`
 * (`node_modules/react-native-reanimated/src/mock.ts`). Each one is
 * marked inline at the scenario that's constrained by it. Also captured
 * in `phaseF-findings.md` §3.
 *
 * ### F1 — `useAnimatedReaction` is a NO-OP under the mock (mock.ts:87).
 * The unified-transform reaction (RNZV.tsx:618) that fires
 * `onTransformWorklet` therefore never runs from gesture-driven
 * SharedValue writes. **`onTransformWorklet` cannot be observed** under
 * jest — the only way to verify per-frame transform fires is on a
 * device (Detox). Scenarios below assert via the END-callback
 * (`onZoomEnd` / `onShiftingEnd` / `onPanResponderEnd`) which DO fire
 * (queued via `runOnJS` inside `_handlePanResponderEnd`, and
 * `runOnJS: ID` in the mock makes those synchronous).
 *
 * ### F2 — `useSharedValue` returns a FRESH Proxy on every render
 * (`mock.ts:53` — `const value = { value: init }; return new Proxy(...)`).
 * SharedValues do NOT persist across renders under the mock. This means:
 *
 *   (a) The CALLBACK PAYLOADS for the end-of-gesture callbacks are
 *       correct, because the handler closure captured the SVs at mount
 *       and mutated them in place during the gesture sequence — the
 *       callback (fired synchronously via `runOnJS: ID`) reads the
 *       mutated values BEFORE any rerender resets them.
 *
 *   (b) `rerender(<RNZV ...>)` AFTER the gesture creates NEW SV
 *       Proxies seeded with their initial values — so a post-gesture
 *       `toJSON()` walk would show `scaleX: 1`, `translateX: 0`, etc.
 *       This is the fidelity wall the dispatch warned about.
 *
 *   (c) `useDerivedValue` and `useAnimatedStyle` are likewise re-
 *       evaluated each render against the fresh SVs.
 *
 * Consequence: rendered-transform scenarios (5, 6) verify the SHAPE
 * of the transform array at initial render. The post-gesture
 * verification of the rendered transform's NUMERIC values is documented
 * as a fidelity gap.
 *
 * ### F3 — `useDerivedValue` returns `{ value: processor() }` evaluated
 * at the call site (`mock.ts:90`). Combined with F2: the handler closure
 * captured derived values like `maxZoom`/`movementSensitivity` from the
 * INITIAL render. Rerendering with new prop values does not propagate
 * to the captured handler closures. Tests therefore use the props at
 * INITIAL render to set up the scenario — no mid-gesture `rerender` to
 * change `maxZoom` etc.
 *
 * Touch-event dispatch is direct-handler invocation
 * (`gesture.handlers.onTouches*`) — `fireGestureHandler` from RNGH's
 * `jest-utils` does NOT support `Gesture.Manual()` in RNGH 2.20.2
 * (`AllGestures` union omits `ManualGesture`). See Phase E probe §6.5.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { View } from 'react-native';
import type { GestureTouchEvent } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { computeOverlayTransform } from '../../components/NonScalingOverlay';
import { ReactNativeZoomableView } from '../../ReactNativeZoomableView';
import type { ReactNativeZoomableViewProps } from '../../typings';

const TOUCHES_DOWN = 1;
const TOUCHES_MOVE = 2;
const TOUCHES_UP = 3;

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
const oneTouch = (x: number, y: number, id = 0): TouchPt => ({
  id,
  x,
  y,
  absoluteX: x,
  absoluteY: y,
});

const makeEvent = (overrides: {
  eventType: number;
  numberOfTouches?: number;
  allTouches?: TouchPt[];
  changedTouches?: TouchPt[];
  x?: number;
  y?: number;
}): GestureTouchEvent => {
  const x = overrides.x ?? 0;
  const y = overrides.y ?? 0;
  const numberOfTouches = overrides.numberOfTouches ?? 1;
  const allTouches = overrides.allTouches ?? [oneTouch(x, y)];
  const changedTouches = overrides.changedTouches ?? allTouches;
  return {
    numberOfTouches,
    allTouches,
    changedTouches,
    eventType: overrides.eventType,
    state: 4,
    handlerTag: 1,
  } as unknown as GestureTouchEvent;
};

const makePinchEvent = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  eventType: number
): GestureTouchEvent =>
  makeEvent({
    eventType,
    numberOfTouches: 2,
    allTouches: [oneTouch(p1.x, p1.y, 0), oneTouch(p2.x, p2.y, 1)],
    changedTouches: [oneTouch(p1.x, p1.y, 0), oneTouch(p2.x, p2.y, 1)],
  });

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

const baseProps = {
  contentWidth: 400,
  contentHeight: 600,
  visualTouchFeedbackEnabled: false,
};

const WRAPPER_W = 400;
const WRAPPER_H = 600;

const renderRNZV = (
  props: Partial<ReactNativeZoomableViewProps> = {}
): ReturnType<typeof render> =>
  render(
    <GestureHandlerRootView>
      <ReactNativeZoomableView {...baseProps} {...props} />
    </GestureHandlerRootView>
  );

/** Fire the wrapper `<View testID="zoom-subject-wrapper">`'s `onLayout` so
 *  `originalWidth/Height` SharedValues and the `wrapperSize` state mirror
 *  pick up real dimensions. Mirrors what RN does on mount in production.
 *
 *  NOTE: `originalWidth/Height` MUST be non-zero before any pinch frames
 *  or `_handlePinching` early-returns at the `!originalHeight.value` guard
 *  (RNZV.tsx:955) and zoom math doesn't run. */
const fireOnLayout = (utils: ReturnType<typeof render>) => {
  const wrapper = utils.getByTestId('zoom-subject-wrapper');
  fireEvent(wrapper, 'layout', {
    nativeEvent: {
      layout: { x: 0, y: 0, width: WRAPPER_W, height: WRAPPER_H },
    },
  });
};

/** Recursively walk the `toJSON()` tree to find the FIRST node matching pred. */
const findNode = (node: any, pred: (n: any) => boolean): any | null => {
  if (!node || typeof node !== 'object') return null;
  if (pred(node)) return node;
  const children: any[] = Array.isArray(node.children) ? node.children : [];
  for (const c of children) {
    const m = findNode(c, pred);
    if (m) return m;
  }
  return null;
};

const findAllNodes = (
  node: any,
  pred: (n: any) => boolean,
  acc: any[] = []
): any[] => {
  if (!node || typeof node !== 'object') return acc;
  if (pred(node)) acc.push(node);
  const children: any[] = Array.isArray(node.children) ? node.children : [];
  for (const c of children) findAllNodes(c, pred, acc);
  return acc;
};

const flattenStyle = (style: any): any => {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<any>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return style;
};

const getTransform = (style: any): any[] | undefined => {
  const flat = flattenStyle(style);
  return flat.transform as any[] | undefined;
};

/** Find the inner zoom-layer `Animated.View` carrying `useAnimatedStyle`'s
 *  transform. Selector: first node with a `transform` array containing
 *  `scaleX` (the inner layer's unique signature — RNZV.tsx:1650-1657). */
const findInnerZoomLayer = (utils: ReturnType<typeof render>): any | null => {
  const tree = utils.toJSON();
  return findNode(tree, (n) => {
    const t = getTransform(n.props?.style);
    if (!t || !Array.isArray(t)) return false;
    return t.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        Object.prototype.hasOwnProperty.call(item, 'scaleX')
    );
  });
};

describe('Phase F — scenario / near-e2e tests', () => {
  // --- SCENARIO 1 ---------------------------------------------------------
  it('Scenario 1: 5-frame pinch sequence — zoom clamps at maxZoom, callback payload reflects final clamped value', () => {
    // Drives a real 5-frame pinch where the distance ratio grows from
    // 200 → 400 (×2). With default `pinchToZoomInSensitivity=1` per
    // RNZV.tsx:136, `applyPinchSensitivity(deltaGrowth, 1) = 0.91*deltaGrowth`
    // so the effective product is less than 2× — but with default
    // `maxZoom=1.5` the value clamps anyway. We assert two things at
    // once: (a) the math RAN across all 5 frames (zoom reached the cap),
    // (b) the cap held (clampZoom worked).
    const onZoomEnd = jest.fn();
    const onShiftingEnd = jest.fn();
    const onPanResponderEnd = jest.fn();
    const utils = renderRNZV({
      onZoomEnd,
      onShiftingEnd,
      onPanResponderEnd,
      // Explicit defaults — also makes the assertion self-documenting.
      maxZoom: 1.5,
      pinchToZoomInSensitivity: 1,
    });
    fireOnLayout(utils);

    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeEvent({ eventType: TOUCHES_DOWN, x: 100, y: 300 }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 100, y: 300 }, { x: 300, y: 300 }, TOUCHES_DOWN),
      sm
    );

    // distance: initial=200, frame steps to 240, 280, 320, 360, 400.
    const stepsX = [340, 380, 420, 460, 500];
    for (const rightX of stepsX) {
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 300 }, { x: rightX, y: 300 }, TOUCHES_MOVE),
        sm
      );
    }
    g.handlers.onTouchesUp(
      makeEvent({ eventType: TOUCHES_UP, numberOfTouches: 0, x: 100, y: 300 }),
      sm
    );

    expect(onShiftingEnd).not.toHaveBeenCalled();
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
    const [, zEvt] = onZoomEnd.mock.calls[0];
    // The pinch math monotonically grew zoom from 1 toward 2×, hitting
    // the 1.5 cap. clampZoom enforces the cap exactly.
    expect(zEvt.zoomLevel).toBe(1.5);
    expect(zEvt).toEqual(
      expect.objectContaining({
        zoomLevel: 1.5,
        offsetX: expect.any(Number),
        offsetY: expect.any(Number),
        originalWidth: WRAPPER_W,
        originalHeight: WRAPPER_H,
      })
    );
  });

  // --- SCENARIO 1b --------------------------------------------------------
  it('Scenario 1b: 5-frame pinch with sensitivity=0 + maxZoom=Infinity reaches exactly 400/240 ≈ 1.667 (math identity verified)', () => {
    // Same gesture sequence as Scenario 1, but with
    // `pinchToZoomInSensitivity=0` (identity — see `applyPinchSensitivity`:
    // `1 - (0*9)/100 = 1`) and `maxZoom=Infinity` (no clamp).
    //
    // Math walk-through:
    //   - The initial 2-finger `onTouchesDown` NULLS `lastGestureTouchDistance`
    //     (RNZV.tsx:1616) — it does NOT seed it from the 2-finger touchDown's
    //     distance.
    //   - `_handlePinching` is NOT called from `onTouchesDown`; only from
    //     `_handlePanResponderMove` on subsequent 2-finger MOVES.
    //   - The first 2-finger MOVE (frame at distance=240) hits the seed
    //     gate in `_handlePanResponderMove` (RNZV.tsx:1513-1518) BEFORE
    //     `_handlePinching` runs: `lastGestureTouchDistance.value = 240`.
    //     Then `_handlePinching` reads `lastGestureTouchDistance=240` and
    //     `distance=240`, so growth=1.0 — no zoom change this frame.
    //   - Subsequent frames: growth = d_i / d_{i-1}, product collapses to
    //     d_final / d_seeded = 400 / 240 ≈ 1.6666...
    //
    // So with the 5 frames at distances [240, 280, 320, 360, 400] and the
    // first being the seed-frame, EXPECTED zoom = 1 * (400/240) ≈ 1.667.
    const onZoomEnd = jest.fn();
    const utils = renderRNZV({
      onZoomEnd,
      maxZoom: Infinity,
      pinchToZoomInSensitivity: 0,
    });
    fireOnLayout(utils);

    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeEvent({ eventType: TOUCHES_DOWN, x: 100, y: 300 }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 100, y: 300 }, { x: 300, y: 300 }, TOUCHES_DOWN),
      sm
    );
    const stepsX = [340, 380, 420, 460, 500];
    for (const rightX of stepsX) {
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 300 }, { x: rightX, y: 300 }, TOUCHES_MOVE),
        sm
      );
    }
    g.handlers.onTouchesUp(
      makeEvent({ eventType: TOUCHES_UP, numberOfTouches: 0, x: 100, y: 300 }),
      sm
    );

    expect(onZoomEnd).toHaveBeenCalledTimes(1);
    const [, zEvt] = onZoomEnd.mock.calls[0];
    expect(zEvt.zoomLevel).toBeCloseTo(400 / 240, 5);
  });

  // --- SCENARIO 2 ---------------------------------------------------------
  it('Scenario 2: 4-frame 1-finger pan at initialZoom=2 — offsets follow _calcOffsetShiftSinceLastGestureState exactly', () => {
    // Drives a 1-finger pan with frames:
    //   grant @ (200, 300)
    //   frame 1: (150, 250)  — promotes to shift, SEEDS lastGestureCenterPosition; shift=0
    //   frame 2: (100, 200)  — shift = (-50/2/1, -50/2/1) = (-25, -25)
    //   frame 3: (80, 180)   — shift = (-20/2, -20/2) = (-10, -10)
    //   frame 4: (60, 160)   — shift = (-20/2, -20/2) = (-10, -10)
    //   sum = (-45, -45)
    //
    // The seed-then-calc ordering in `_handlePanResponderMove`
    // (RNZV.tsx:1553-1560) writes `lastGestureCenterPosition` BEFORE
    // calling `_handleShifting`, which then sees the just-written
    // reference and computes shift=0 for that frame. This is documented
    // gesture-classifier behavior — first promotion-to-shift frame
    // contributes 0 displacement.
    const onShiftingEnd = jest.fn();
    const onPanResponderEnd = jest.fn();
    const utils = renderRNZV({
      initialZoom: 2,
      maxZoom: Infinity,
      onShiftingEnd,
      onPanResponderEnd,
    });
    fireOnLayout(utils);

    const g = getGesture();
    const sm = makeStateManager();

    g.handlers.onTouchesDown(
      makeEvent({ eventType: TOUCHES_DOWN, x: 200, y: 300 }),
      sm
    );
    g.handlers.onTouchesMove(
      makeEvent({ eventType: TOUCHES_MOVE, x: 150, y: 250 }),
      sm
    );
    g.handlers.onTouchesMove(
      makeEvent({ eventType: TOUCHES_MOVE, x: 100, y: 200 }),
      sm
    );
    g.handlers.onTouchesMove(
      makeEvent({ eventType: TOUCHES_MOVE, x: 80, y: 180 }),
      sm
    );
    g.handlers.onTouchesMove(
      makeEvent({ eventType: TOUCHES_MOVE, x: 60, y: 160 }),
      sm
    );
    g.handlers.onTouchesUp(
      makeEvent({ eventType: TOUCHES_UP, numberOfTouches: 0, x: 60, y: 160 }),
      sm
    );

    expect(onShiftingEnd).toHaveBeenCalledTimes(1);
    const [evt, zEvt] = onShiftingEnd.mock.calls[0];

    // Payload structure: exactly the 5 keys, all numeric.
    expect(Object.keys(zEvt).sort()).toEqual(
      [
        'offsetX',
        'offsetY',
        'originalHeight',
        'originalWidth',
        'zoomLevel',
      ].sort()
    );
    expect(zEvt.zoomLevel).toBe(2);
    expect(zEvt.offsetX).toBeCloseTo(-45, 5);
    expect(zEvt.offsetY).toBeCloseTo(-45, 5);
    expect(zEvt.originalWidth).toBe(WRAPPER_W);
    expect(zEvt.originalHeight).toBe(WRAPPER_H);

    // The GestureTouchEvent passed as first arg is the release frame.
    expect((evt as GestureTouchEvent).eventType).toBe(TOUCHES_UP);
    expect((evt as GestureTouchEvent).allTouches[0]).toMatchObject({
      x: 60,
      y: 160,
    });

    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
  });

  // --- SCENARIO 3 ---------------------------------------------------------
  it('Scenario 3: shift→pinch transition latches gestureType=pinch (only onZoomEnd fires, with non-zero offsets)', () => {
    // Real gestures often start single-finger and acquire a second finger
    // mid-motion. RNZV's classifier: shift is set on first >2px 1-finger
    // move; pinch supersedes when 2nd finger arrives. The terminal callback
    // is dictated by `gestureType.value` AT RELEASE — so a shift→pinch
    // sequence releases as a pinch (RNZV.tsx:1371-1374 if/else).
    const onZoomEnd = jest.fn();
    const onShiftingEnd = jest.fn();
    const onPanResponderEnd = jest.fn();
    const utils = renderRNZV({
      onZoomEnd,
      onShiftingEnd,
      onPanResponderEnd,
      maxZoom: Infinity,
      pinchToZoomInSensitivity: 0,
    });
    fireOnLayout(utils);

    const g = getGesture();
    const sm = makeStateManager();

    // Phase A — 1-finger pan for 2 frames (gestureType=shift).
    g.handlers.onTouchesDown(
      makeEvent({ eventType: TOUCHES_DOWN, x: 200, y: 300 }),
      sm
    );
    g.handlers.onTouchesMove(
      makeEvent({ eventType: TOUCHES_MOVE, x: 220, y: 300 }),
      sm
    );
    g.handlers.onTouchesMove(
      makeEvent({ eventType: TOUCHES_MOVE, x: 240, y: 300 }),
      sm
    );
    // Phase B — 2nd finger arrives. `onTouchesDown` with 2 fingers nulls
    // `lastGestureTouchDistance` and `lastGestureCenterPosition`
    // (RNZV.tsx:1616-1617).
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 240, y: 300 }, { x: 440, y: 300 }, TOUCHES_DOWN),
      sm
    );
    // Phase C — 3 pinch frames spreading right finger.
    // distance: 200 (initial seed on first 2-finger move), then 240, 280, 320.
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 240, y: 300 }, { x: 480, y: 300 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 240, y: 300 }, { x: 520, y: 300 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesMove(
      makePinchEvent({ x: 240, y: 300 }, { x: 560, y: 300 }, TOUCHES_MOVE),
      sm
    );
    g.handlers.onTouchesUp(
      makeEvent({ eventType: TOUCHES_UP, numberOfTouches: 0, x: 240, y: 300 }),
      sm
    );

    expect(onShiftingEnd).not.toHaveBeenCalled();
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
    expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
    const [, zEvt] = onZoomEnd.mock.calls[0];
    // Zoom grew through the pinch frames.
    expect(zEvt.zoomLevel).toBeGreaterThan(1);
    expect(zEvt.zoomLevel).toBeLessThan(3);
    // Pinch at an off-centre zoomCentre produces non-zero offset
    // (calcNewScaledOffsetForZoomCentering integrates the centring shift
    // PLUS the per-frame center-translation from
    // `_calcOffsetShiftSinceLastGestureState`).
    expect(Math.abs(zEvt.offsetX) + Math.abs(zEvt.offsetY)).toBeGreaterThan(0);
  });

  // --- SCENARIO 4 ---------------------------------------------------------
  it('Scenario 4: callback payload shape — both onZoomEnd and onShiftingEnd dispatch (GestureTouchEvent, ZoomableViewEvent)', () => {
    // Verifies the ZoomableViewEvent contract from `src/typings/index.ts` —
    // ALL 5 keys present with numeric values, on every end-callback fire,
    // for both pinch and shift terminations.

    // Helper to assert the full ZoomableViewEvent shape.
    const assertEventShape = (args: any[]) => {
      expect(args).toHaveLength(2);
      const [event, zEvt] = args;
      expect(event).toEqual(
        expect.objectContaining({
          eventType: TOUCHES_UP,
          numberOfTouches: 0,
        })
      );
      expect(Object.keys(zEvt).sort()).toEqual(
        [
          'offsetX',
          'offsetY',
          'originalHeight',
          'originalWidth',
          'zoomLevel',
        ].sort()
      );
      expect(typeof zEvt.zoomLevel).toBe('number');
      expect(typeof zEvt.offsetX).toBe('number');
      expect(typeof zEvt.offsetY).toBe('number');
      expect(typeof zEvt.originalWidth).toBe('number');
      expect(typeof zEvt.originalHeight).toBe('number');
      // Numeric sanity — all finite.
      expect(Number.isFinite(zEvt.zoomLevel)).toBe(true);
      expect(Number.isFinite(zEvt.offsetX)).toBe(true);
      expect(Number.isFinite(zEvt.offsetY)).toBe(true);
    };

    // Pinch path.
    {
      const onZoomEnd = jest.fn();
      const onPanResponderEnd = jest.fn();
      const utils = renderRNZV({
        onZoomEnd,
        onPanResponderEnd,
        maxZoom: Infinity,
      });
      fireOnLayout(utils);
      const g = getGesture();
      const sm = makeStateManager();
      g.handlers.onTouchesDown(
        makeEvent({ eventType: TOUCHES_DOWN, x: 100, y: 300 }),
        sm
      );
      g.handlers.onTouchesDown(
        makePinchEvent({ x: 100, y: 300 }, { x: 300, y: 300 }, TOUCHES_DOWN),
        sm
      );
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 300 }, { x: 320, y: 300 }, TOUCHES_MOVE),
        sm
      );
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 300 }, { x: 340, y: 300 }, TOUCHES_MOVE),
        sm
      );
      g.handlers.onTouchesUp(
        makeEvent({
          eventType: TOUCHES_UP,
          numberOfTouches: 0,
          x: 100,
          y: 300,
        }),
        sm
      );
      expect(onZoomEnd).toHaveBeenCalledTimes(1);
      expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
      assertEventShape(onZoomEnd.mock.calls[0]);
      assertEventShape(onPanResponderEnd.mock.calls[0]);
    }

    // Shift path.
    {
      const onShiftingEnd = jest.fn();
      const onPanResponderEnd = jest.fn();
      const utils = renderRNZV({
        onShiftingEnd,
        onPanResponderEnd,
      });
      fireOnLayout(utils);
      const g = getGesture();
      const sm = makeStateManager();
      g.handlers.onTouchesDown(
        makeEvent({ eventType: TOUCHES_DOWN, x: 200, y: 300 }),
        sm
      );
      g.handlers.onTouchesMove(
        makeEvent({ eventType: TOUCHES_MOVE, x: 220, y: 300 }),
        sm
      );
      g.handlers.onTouchesMove(
        makeEvent({ eventType: TOUCHES_MOVE, x: 240, y: 300 }),
        sm
      );
      g.handlers.onTouchesUp(
        makeEvent({
          eventType: TOUCHES_UP,
          numberOfTouches: 0,
          x: 240,
          y: 300,
        }),
        sm
      );
      expect(onShiftingEnd).toHaveBeenCalledTimes(1);
      expect(onPanResponderEnd).toHaveBeenCalledTimes(1);
      assertEventShape(onShiftingEnd.mock.calls[0]);
      assertEventShape(onPanResponderEnd.mock.calls[0]);
    }
  });

  // --- SCENARIO 5 ---------------------------------------------------------
  it('Scenario 5: rendered inner Animated.View has the [scaleX, scaleY, translateX, translateY] transform shape', () => {
    // Verifies the RENDERED TRANSFORM SHAPE of the inner zoom-layer
    // Animated.View at initial render. This locks in the contract from
    // RNZV.tsx:1648-1658 — the transform is a 4-element array with
    // exactly these keys.
    //
    // Fidelity wall §F2: post-gesture rendered transform CANNOT be
    // observed under the mock because `rerender` creates fresh SVs that
    // reset to the seed values. The callback-payload scenarios above
    // (Scenarios 1-4) carry the end-state numeric verification. Here we
    // pin the rendered SHAPE — sufficient to catch a refactor that
    // changes the transform array order or keys.
    const utils = renderRNZV({});
    fireOnLayout(utils);

    const inner = findInnerZoomLayer(utils);
    expect(inner).not.toBeNull();
    const transform = getTransform(inner.props.style)!;
    expect(transform).toEqual([
      { scaleX: expect.any(Number) },
      { scaleY: expect.any(Number) },
      { translateX: expect.any(Number) },
      { translateY: expect.any(Number) },
    ]);

    // Initial values: zoom=1 (default), offsets=0 (defaults).
    const scaleX = transform.find((t: any) => 'scaleX' in t).scaleX;
    const scaleY = transform.find((t: any) => 'scaleY' in t).scaleY;
    const translateX = transform.find((t: any) => 'translateX' in t).translateX;
    const translateY = transform.find((t: any) => 'translateY' in t).translateY;
    expect(scaleX).toBe(1);
    expect(scaleY).toBe(1);
    expect(translateX).toBe(0);
    expect(translateY).toBe(0);
  });

  // --- SCENARIO 5b --------------------------------------------------------
  it('Scenario 5b: rendered transform shape persists across a full pinch gesture (no React churn / no Proxy errors)', () => {
    // The handler closure captures the SAME Proxy objects that
    // `useAnimatedStyle`'s worklet reads. After driving the gesture,
    // those Proxies' `.value` are mutated in place — but
    // `useAnimatedStyle` under the mock is `IMMEDIATE_CALLBACK_INVOCATION`
    // (mock.ts:85), so its returned style was a SNAPSHOT taken at render
    // time. The rendered output is therefore the initial state.
    //
    // This test verifies the snapshot SHAPE survives a multi-frame
    // gesture (no React error, no Proxy churn, no broken style array)
    // and that the end-state numeric values are correctly read via
    // CALLBACKS (which is the supported observation path under the mock).
    const onZoomEnd = jest.fn();
    const utils = renderRNZV({
      onZoomEnd,
      maxZoom: Infinity,
      pinchToZoomInSensitivity: 0,
    });
    fireOnLayout(utils);

    // Drive a pinch.
    const g = getGesture();
    const sm = makeStateManager();
    g.handlers.onTouchesDown(
      makeEvent({ eventType: TOUCHES_DOWN, x: 100, y: 300 }),
      sm
    );
    g.handlers.onTouchesDown(
      makePinchEvent({ x: 100, y: 300 }, { x: 300, y: 300 }, TOUCHES_DOWN),
      sm
    );
    const stepsX = [340, 380, 420, 460, 500];
    for (const rightX of stepsX) {
      g.handlers.onTouchesMove(
        makePinchEvent({ x: 100, y: 300 }, { x: rightX, y: 300 }, TOUCHES_MOVE),
        sm
      );
    }
    g.handlers.onTouchesUp(
      makeEvent({ eventType: TOUCHES_UP, numberOfTouches: 0, x: 100, y: 300 }),
      sm
    );

    // Callback confirms the gesture math ran end-to-end. Final zoom =
    // 400/240 ≈ 1.667 — see Scenario 1b for the math walk-through.
    expect(onZoomEnd).toHaveBeenCalledTimes(1);
    expect(onZoomEnd.mock.calls[0][1].zoomLevel).toBeCloseTo(400 / 240, 5);

    // Rendered transform after gesture: SHAPE preserved (4-element array
    // with the same keys). Numeric values reflect INITIAL render per the
    // §F2 fidelity wall.
    const inner = findInnerZoomLayer(utils);
    expect(inner).not.toBeNull();
    const transform = getTransform(inner.props.style)!;
    expect(transform).toHaveLength(4);
    expect(transform[0]).toHaveProperty('scaleX');
    expect(transform[1]).toHaveProperty('scaleY');
    expect(transform[2]).toHaveProperty('translateX');
    expect(transform[3]).toHaveProperty('translateY');
  });

  // --- SCENARIO 6 ---------------------------------------------------------
  it('Scenario 6: NonScalingOverlay renders an Animated.View with computeOverlayTransform 5-element shape', () => {
    // Verifies the overlay's rendered transform array matches
    // `computeOverlayTransform`'s shape: [translateX, translateY, rotate,
    // translateX, translateY]. Also verifies that at initial render
    // (zoom=1, offsets=0, rotation=0), the overlay's width/height are
    // contentW*zoom and contentH*zoom, and the transform matches the
    // pure-math reference.
    //
    // Fidelity wall §F2: post-gesture numeric verification of the
    // overlay's transform is constrained the same way as the inner
    // zoom-layer's. The shape is locked in here; numeric correctness is
    // covered by `src/components/__tests__/computeOverlayTransform.test.ts`.
    const renderOverlay = () => (
      <View
        testID="marker"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 16,
          height: 16,
          marginLeft: -8,
          marginTop: -8,
        }}
      />
    );

    const utils = renderRNZV({ renderOverlay });
    fireOnLayout(utils);

    // Find the overlay's Animated.View by its signature transform shape.
    const tree = utils.toJSON();
    const candidates = findAllNodes(tree, (n) => {
      const t = getTransform(n.props?.style);
      if (!t || !Array.isArray(t) || t.length !== 5) return false;
      return (
        'translateX' in t[0] &&
        'translateY' in t[1] &&
        'rotate' in t[2] &&
        'translateX' in t[3] &&
        'translateY' in t[4]
      );
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const overlay = candidates[0];
    const t = getTransform(overlay.props.style)!;

    // At zoom=1, offsets=0, rotation=0: expected via the pure formula.
    const expected = computeOverlayTransform({
      contentWidth: 400,
      contentHeight: 600,
      wrapperWidth: WRAPPER_W,
      wrapperHeight: WRAPPER_H,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    });

    expect(t[0].translateX).toBeCloseTo(expected.transform[0].translateX, 5);
    expect(t[1].translateY).toBeCloseTo(expected.transform[1].translateY, 5);
    expect(t[2].rotate).toBe(expected.transform[2].rotate);
    expect(t[3].translateX).toBeCloseTo(expected.transform[3].translateX, 5);
    expect(t[4].translateY).toBeCloseTo(expected.transform[4].translateY, 5);

    // Width/height: contentW*zoom and contentH*zoom (zoom=1 here).
    const flat = flattenStyle(overlay.props.style);
    expect(flat.width).toBe(400);
    expect(flat.height).toBe(600);

    // Marker is rendered inside the overlay.
    expect(utils.queryByTestId('marker')).not.toBeNull();
  });
});
