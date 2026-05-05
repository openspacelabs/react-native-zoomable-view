/**
 * Returns the next zoom step based on current step and zoomStep property.
 * If we are zoomed all the way in -> return to initialzoom
 *
 * @returns {*}
 */
export const getNextZoomStep = ({
  zoomStep,
  maxZoom,
  initialZoom,
  zoomLevel,
}: {
  zoomStep: number | undefined;
  maxZoom: number | undefined;
  initialZoom: number | undefined;
  zoomLevel: number;
}) => {
  // `Infinity` is the documented opt-in for unbounded zoom-in (SPECS L58,
  // L196-200) and is the only TS-clean migration target now that the
  // `maxZoom?: number | null` typing was narrowed to `maxZoom?: number`.
  // Treat `Infinity` the same way the legacy code treated `null`: route
  // through the derived three-step ceiling below, not the finite-clamp path.
  // (`Infinity != null` is true, so a bare `maxZoom != null` gate would set
  // `effectiveMax = Infinity` and never engage the cycle.)
  const isFiniteMax = maxZoom != null && Number.isFinite(maxZoom);

  // Cycle-back when at a configured maxZoom must be checked BEFORE
  // the zoomStep guard — otherwise users with zoomStep={null} and
  // a configured maxZoom lose the reset-to-initialZoom behavior on
  // double-tap at max zoom.
  if (isFiniteMax && zoomLevel.toFixed(2) === maxZoom.toFixed(2)) {
    return initialZoom;
  }

  // If no zoomStep is configured, there is no increment to compute.
  if (zoomStep == null) return;

  // Determine the effective ceiling for double-tap cycling.
  // When maxZoom is non-finite (Infinity / unset), use a default of 3 zoom
  // steps from initialZoom so double-tap still cycles back — otherwise
  // every tap would grow zoom indefinitely with no reset path.
  const effectiveMax = isFiniteMax
    ? maxZoom
    : (initialZoom ?? 1) * Math.pow(1 + zoomStep, 3);

  // This cycle-back is only reachable when maxZoom is non-finite; when
  // finite the equivalent check above already returned.
  if (zoomLevel.toFixed(2) === effectiveMax.toFixed(2)) {
    return initialZoom;
  }

  const nextZoomStep = zoomLevel * (1 + zoomStep);
  if (nextZoomStep > effectiveMax) {
    return effectiveMax;
  }

  return nextZoomStep;
};
