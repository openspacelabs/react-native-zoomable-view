/* eslint-disable @typescript-eslint/no-explicit-any */
// `useLatestWorklet` mirrors a UI-thread worklet prop into a SharedValue so
// worklet call sites always invoke the latest consumer callback (not the
// first-render closure). PR #151 review threads #3179033549 (`useLatestWorklet`
// was the fix) and #3238350220 ("spooky magic") flag this as load-bearing:
// without it, `useAnimatedReaction` with empty deps captures the first-render
// callback identity and a parent that re-renders with a new worklet would fire
// the OLD callback for the rest of the component's lifetime.
//
// SPEC-085. Plain hook test via RTL's `renderHook`. We don't need RNGH or any
// component scaffolding — the hook only depends on Reanimated's `useSharedValue`
// (mocked by `react-native-reanimated/mock` via `jest.setup.ts`) and React's
// `useLayoutEffect`.
import { renderHook } from '@testing-library/react-native';

import { useLatestWorklet } from '../useLatestWorklet';

describe('useLatestWorklet (SPEC-085)', () => {
  it('SPEC-085: stores the initial worklet on first render', () => {
    const worklet = (() => {
      'worklet';
    }) as (...args: never[]) => unknown;

    const { result } = renderHook(({ w }) => useLatestWorklet(w), {
      initialProps: { w: worklet },
    });

    // `ref.value.fn` is the wrapper object; `.fn` is the actual worklet.
    // Object-wrap rationale lives in the hook's JSDoc — Reanimated's
    // SharedValue setter treats bare function values as animation factories.
    expect(result.current.value.fn).toBe(worklet);
  });

  it('SPEC-085: updates the stored worklet when re-rendered with a new identity', () => {
    const workletA = (() => {
      'worklet';
    }) as (...args: never[]) => unknown;
    const workletB = (() => {
      'worklet';
    }) as (...args: never[]) => unknown;

    const { result, rerender } = renderHook(({ w }) => useLatestWorklet(w), {
      initialProps: { w: workletA },
    });

    expect(result.current.value.fn).toBe(workletA);

    rerender({ w: workletB });

    // Thread #3179033549: the staleness bug was that `useAnimatedReaction`
    // captured the first-render closure. `useLatestWorklet`'s
    // `useLayoutEffect([worklet])` runs on every identity change and writes
    // the new function into the SharedValue, so a worklet reading
    // `ref.value.fn` after the re-render sees `workletB`, not `workletA`.
    expect(result.current.value.fn).toBe(workletB);
    expect(result.current.value.fn).not.toBe(workletA);
  });

  it('SPEC-085: when the consumer prop transitions to undefined, the ref holds a no-op worklet', () => {
    const workletA = (() => {
      'worklet';
    }) as (...args: never[]) => unknown;

    const { result, rerender } = renderHook(
      ({ w }: { w: ((...args: never[]) => unknown) | undefined }) =>
        useLatestWorklet(w),
      {
        initialProps: {
          w: workletA as ((...args: never[]) => unknown) | undefined,
        },
      }
    );

    expect(result.current.value.fn).toBe(workletA);

    rerender({ w: undefined });

    // After the parent drops the worklet, callers can still invoke
    // `ref.value.fn(...)` without an optional chain or `runOnJS` hop — the
    // hook substitutes a no-op worklet so the worklet-side call site stays
    // branch-free. Verify the slot is a callable, no longer `workletA`, and
    // invoking it does not throw.
    expect(typeof result.current.value.fn).toBe('function');
    expect(result.current.value.fn).not.toBe(workletA);
    expect(() =>
      (result.current.value.fn as (...args: unknown[]) => unknown)()
    ).not.toThrow();
  });
});
