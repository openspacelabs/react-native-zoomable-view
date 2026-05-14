/**
 * Applies the pinch-to-zoom sensitivity resistance curve.
 *
 * `sensitivity` is on a 0..10 scale where:
 *   - 0  → no resistance (full delta passes through)
 *   - 10 → 90% resistance (`deltaGrowth * 0.1`)
 *
 * The formula is `deltaGrowth * (1 - (sensitivity * 9) / 100)`.
 */
export function applyPinchSensitivity(
  deltaGrowth: number,
  sensitivity: number
): number {
  'worklet';

  return deltaGrowth * (1 - (sensitivity * 9) / 100);
}
