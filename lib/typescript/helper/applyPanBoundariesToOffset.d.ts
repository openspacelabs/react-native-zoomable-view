/**
 * Takes a single offset value and calculates the correct offset value
 * to make sure it's within the pan boundaries
 *
 *
 * @param offsetScaled
 * @param containerSize
 * @param contentSize
 * @param scale
 * @param boundaryPadding - see README
 *
 * @returns {number}
 */
export declare function applyPanBoundariesToOffset(offsetScaled: number, containerSize: number, contentSize: number, scale: number, boundaryPadding: number): number;
