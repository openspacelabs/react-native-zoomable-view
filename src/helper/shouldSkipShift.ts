/**
 * Predicate guarding `_handleShifting` (SPEC-029, SPEC-108): returns `true`
 * when pan should be skipped because panning is disabled or because
 * `disablePanOnInitialZoom` is set and the current zoom matches the initial.
 */
export function shouldSkipShift(input: {
  panEnabled: boolean;
  disablePanOnInitialZoom: boolean;
  zoom: number;
  initialZoom: number;
}): boolean {
  'worklet';

  if (!input.panEnabled) return true;
  if (input.disablePanOnInitialZoom && input.zoom === input.initialZoom) {
    return true;
  }
  return false;
}
