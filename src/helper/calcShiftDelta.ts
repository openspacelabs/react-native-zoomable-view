/**
 * Pure-math helper for the pan/pinch shift computation in
 * `_calcOffsetShiftSinceLastGestureState`.
 *
 * Given a frame-to-frame gesture-centre delta (`dx`, `dy`) in viewport pixels,
 * the current `zoom`, and the user-configurable `movementSensitivity`, returns
 * the shift to apply to the zoom subject's offsets (in unscaled pixels).
 *
 * @returns `{dxShift:0, dyShift:0}` when `movementSensitivity` is `0` — this
 * silently disables panning (SPEC-028) because the call-site gate
 * `if (... && movementSensitivity.value)` treats `0` as falsy.
 */
export function calcShiftDelta(input: {
  dx: number;
  dy: number;
  zoom: number;
  movementSensitivity: number;
}): { dxShift: number; dyShift: number } {
  'worklet';

  if (!input.movementSensitivity) return { dxShift: 0, dyShift: 0 };

  return {
    dxShift: input.dx / input.zoom / input.movementSensitivity,
    dyShift: input.dy / input.zoom / input.movementSensitivity,
  };
}
