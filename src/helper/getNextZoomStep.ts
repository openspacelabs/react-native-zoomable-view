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
  const finiteMaxZoom = Number.isFinite(maxZoom) ? maxZoom : undefined;

  // Cycle-back at a configured maxZoom must run BEFORE the zoomStep guard —
  // zoomStep={undefined} + configured maxZoom must still reset on double-tap.
  if (
    finiteMaxZoom != null &&
    zoomLevel.toFixed(2) === finiteMaxZoom.toFixed(2)
  ) {
    return initialZoom;
  }

  if (zoomStep == null) return;

  // No finite ceiling configured → cycle at 3 zoomSteps from initialZoom so
  // double-tap still resets instead of growing forever.
  const effectiveMax =
    finiteMaxZoom ?? (initialZoom ?? 1) * Math.pow(1 + zoomStep, 3);

  if (zoomLevel.toFixed(2) === effectiveMax.toFixed(2)) {
    return initialZoom;
  }

  const nextZoomStep = zoomLevel * (1 + zoomStep);
  return nextZoomStep > effectiveMax ? effectiveMax : nextZoomStep;
};
