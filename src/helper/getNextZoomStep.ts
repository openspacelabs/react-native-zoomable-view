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
  if (maxZoom == null) return;

  if (zoomLevel.toFixed(2) === maxZoom.toFixed(2)) {
    return initialZoom;
  }

  if (zoomStep == null) return;

  const nextZoomStep = zoomLevel * (1 + zoomStep);
  if (nextZoomStep > maxZoom) {
    return maxZoom;
  }

  return nextZoomStep;
};
