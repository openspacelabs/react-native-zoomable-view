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
  // `null` and `undefined` are both treated as "not set" via the `!= null`
  // checks below — accept either to match the public prop typing where
  // `null = unlimited` and `undefined = default`.
  zoomStep: number | null | undefined;
  maxZoom: number | null | undefined;
  initialZoom: number | undefined;
  zoomLevel: number;
}) => {
  // Cycle-back when at a configured maxZoom must be checked BEFORE
  // the zoomStep guard — otherwise users with zoomStep={null} and
  // a configured maxZoom lose the reset-to-initialZoom behavior on
  // double-tap at max zoom.
  if (maxZoom != null && zoomLevel.toFixed(2) === maxZoom.toFixed(2)) {
    return initialZoom;
  }

  // If no zoomStep is configured, there is no increment to compute.
  if (zoomStep == null) return;

  // Determine the effective ceiling for double-tap cycling.
  // When maxZoom is null (unlimited zoom), use a default of 3 zoom
  // steps from initialZoom so double-tap still cycles back — otherwise
  // every tap would grow zoom indefinitely with no reset path.
  const effectiveMax =
    maxZoom != null ? maxZoom : (initialZoom ?? 1) * Math.pow(1 + zoomStep, 3);

  // This cycle-back is only reachable when maxZoom == null; when
  // maxZoom != null the equivalent check above already returned.
  if (zoomLevel.toFixed(2) === effectiveMax.toFixed(2)) {
    return initialZoom;
  }

  const nextZoomStep = zoomLevel * (1 + zoomStep);
  if (nextZoomStep > effectiveMax) {
    return effectiveMax;
  }

  return nextZoomStep;
};
