/**
 * Calculates the new offset for the zoomSubject to ensure zoom center position is retained after zooming.
 * Parameters should correspond to whether we need the offset for the X or Y axis
 *
 * ## Terms Used:
 *
 * - Zoom Subject: the view that's being zoomed and panned
 * - Zoom Center: the point whose relative position to the window is retained
 * - Unscaled: a measurement in pixels denoting the true size as observed by the users' eyes
 * - Scaled: a measurement in pixels scaled to the "scale transformation" of the zoom subject to match with its true size.
 *  *For example:*
 *   If the scale on the zoom subject is 0.5,
 *   then to draw an actual 4px line on the zoom subject, we need to scale it to 4px / 0.5 = 8px
 *   8px is the scaled measurement
 *
 * ## Overall idea of this algorithm:
 *
 * When users perform zooming by pinching the screen,
 * we need to shift the zoom subject so that the position of the zoom center is always the same.
 * The offset amount to shift the layer is the returned value.
 *
 *
 * ## How we achieve our goal:
 *
 * To retain, the zoom center position, whenever a zoom action is performed,
 * we just need to make sure the distances from all the points in the zoom subject
 * to the zoom center increases or decreases by the growth rate of the scale.
 *
 * ```
 * newDistanceAnyPointToZoomCenter = oldDistanceAnyPointToZoomCenter * (newScale/oldScale)
 * ```
 *
 * We can't calculate that for all the points because there are unlimited points on a plain.
 * However, due to the way `transform` works in RN, every point is scaled from the zoom subject center.
 * Therefore, it's sufficient to base our calculation on the distance from the zoom subject center to the zoom center.
 *
 * ```
 * newDistanceZoomSubjectCenterToZoomCenter = oldDistanceZoomSubjectCenterToZoomCenter * (newScale/oldScale)
 * ```
 *
 * Once we have `newDistanceZoomSubjectCenterToZoomCenter`,
 * we can easily calculate the position of the new center, which leads us to the offset amount.
 * Refer to the code for more details
 *
 * @param oldOffsetXOrYScaled
 * @param zoomSubjectOriginalWidthOrHeight
 * @param oldScale
 * @param newScale
 * @param zoomCenterXOrY
 */
export declare function calcNewScaledOffsetForZoomCentering(oldOffsetXOrYScaled: number, zoomSubjectOriginalWidthOrHeight: number, oldScale: number, newScale: number, zoomCenterXOrY: number): number;
