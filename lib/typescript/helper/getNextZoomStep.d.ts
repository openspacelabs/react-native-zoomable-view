/**
 * Returns the next zoom step based on current step and zoomStep property.
 * If we are zoomed all the way in -> return to initialzoom
 *
 * @returns {*}
 */
export declare const getNextZoomStep: ({ zoomStep, maxZoom, initialZoom, zoomLevel, }: {
    zoomStep: number | undefined;
    maxZoom: number | undefined;
    initialZoom: number | undefined;
    zoomLevel: number;
}) => number | undefined;
//# sourceMappingURL=getNextZoomStep.d.ts.map