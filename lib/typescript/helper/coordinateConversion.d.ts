import { Size2D, Vec2D, ZoomableViewEvent } from 'src/typings';
export declare const defaultTransformSubjectData: ZoomableViewEvent;
/**
 * Assuming you have an image that's being resized to fit into a container
 * using the "contain" resize mode. You can use this function to calculate the
 * size of the image after fitting.
 *
 * Since our sheet is resized in this manner, we need this function
 * for things like pan boundaries and marker placement
 *
 * @param imgSize
 * @param containerSize
 */
export declare function applyContainResizeMode(imgSize: Size2D, containerSize: Size2D): {
    size: Size2D;
    scale: number;
} | {
    size: null;
    scale: null;
};
/**
 * get the coord of image's origin relative to the transformSubject
 * @param resizedImageSize
 * @param transformSubject
 */
export declare function getImageOriginOnTransformSubject(resizedImageSize: Size2D, transformSubject: ZoomableViewEvent): {
    x: number;
    y: number;
};
/**
 * Translates the coord system of a point from the viewport's space to the image's space
 *
 * @param pointOnContainer
 * @param sheetImageSize
 * @param transformSubject
 *
 * @return {Vec2D} returns null if point is out of the sheet's bound
 */
export declare function viewportPositionToImagePosition({ viewportPosition, imageSize, zoomableEvent, }: {
    viewportPosition: Vec2D;
    imageSize: Size2D;
    zoomableEvent: ZoomableViewEvent;
}): Vec2D | null;
