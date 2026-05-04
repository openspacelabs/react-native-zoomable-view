import { useEffect } from 'react';
import { SharedValue, useSharedValue } from 'react-native-reanimated';

// UI-thread no-op used when the consumer hasn't supplied a worklet. Marked
// `'worklet'` so call sites can invoke it directly from a worklet context
// without an optional chain or `runOnJS` hop.
const noopWorklet = () => {
  'worklet';
};

/**
 * Mirrors a UI-thread worklet prop into a SharedValue so worklet call sites
 * always invoke the latest consumer callback (not the first-render closure
 * snapshot). When the consumer hasn't provided a worklet, the SharedValue
 * holds a no-op so call sites can drop the optional chain.
 *
 * The function is wrapped in `{ fn }` rather than stored bare because
 * Reanimated's SharedValue setter treats raw function values as animation
 * factories (calls them with no args expecting an `AnimationObject`),
 * crashing immediately on assignment. The object wrapper sidesteps that
 * branch.
 */
export const useLatestWorklet = <F extends (...args: never[]) => unknown>(
  worklet: F | undefined
): SharedValue<{ fn: F }> => {
  const ref = useSharedValue<{ fn: F }>({ fn: noopWorklet as unknown as F });
  useEffect(() => {
    ref.value = { fn: (worklet ?? noopWorklet) as F };
  }, [worklet, ref]);
  return ref;
};
