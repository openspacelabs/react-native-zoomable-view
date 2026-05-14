/**
 * Clamps `newZoomLevel` into the configured `[minZoom, maxZoom]` range.
 *
 * `null` or `undefined` on either bound means "unbounded on that side" —
 * matching the `!= null` gate the in-line pinch-clamp uses.
 *
 * Note: Infinity / -Infinity also act as unbounded — `Math.min(x, Infinity) = x`
 * and `Math.max(x, -Infinity) = x`.
 */
export function clampZoom(
  newZoomLevel: number,
  maxZoom: number | null | undefined,
  minZoom: number | null | undefined
): number {
  'worklet';

  let z = newZoomLevel;
  if (maxZoom != null && z > maxZoom) z = maxZoom;
  if (minZoom != null && z < minZoom) z = minZoom;
  return z;
}
