export const defaultTransformSubjectData = {
  offsetX: 0,
  offsetY: 0,
  zoomLevel: 0,
  originalWidth: 0,
  originalHeight: 0,
  originalPageX: 0,
  originalPageY: 0
};
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

export function applyContainResizeMode(imgSize, containerSize) {
  const {
    width: imageWidth,
    height: imageHeight
  } = imgSize;
  const {
    width: areaWidth,
    height: areaHeight
  } = containerSize;
  const imageAspect = imageWidth / imageHeight;
  const areaAspect = areaWidth / areaHeight;
  let newSize;

  if (imageAspect >= areaAspect) {
    // longest edge is horizontal
    newSize = {
      width: areaWidth,
      height: areaWidth / imageAspect
    };
  } else {
    // longest edge is vertical
    newSize = {
      width: areaHeight * imageAspect,
      height: areaHeight
    };
  }

  if (isNaN(newSize.height)) newSize.height = areaHeight;
  if (isNaN(newSize.width)) newSize.width = areaWidth;
  const scale = imageWidth ? newSize.width / imageWidth : newSize.height / imageHeight;
  if (!isFinite(scale)) return {
    size: null,
    scale: null
  };
  return {
    size: newSize,
    scale
  };
}
/**
 * get the coord of image's origin relative to the transformSubject
 * @param resizedImageSize
 * @param transformSubject
 */

export function getImageOriginOnTransformSubject(resizedImageSize, transformSubject) {
  const {
    offsetX,
    offsetY,
    zoomLevel,
    originalWidth,
    originalHeight
  } = transformSubject;
  return {
    x: offsetX * zoomLevel + originalWidth / 2 - resizedImageSize.width / 2 * zoomLevel,
    y: offsetY * zoomLevel + originalHeight / 2 - resizedImageSize.height / 2 * zoomLevel
  };
}
/**
 * Translates the coord system of a point from the viewport's space to the image's space
 *
 * @param pointOnContainer
 * @param sheetImageSize
 * @param transformSubject
 *
 * @return {Vec2D} returns null if point is out of the sheet's bound
 */

export function viewportPositionToImagePosition({
  viewportPosition,
  imageSize,
  zoomableEvent
}) {
  const {
    size: resizedImgSize,
    scale: resizedImgScale
  } = applyContainResizeMode(imageSize, {
    width: zoomableEvent.originalWidth,
    height: zoomableEvent.originalHeight
  }) || {};
  if (resizedImgScale == null || resizedImgSize == null) return null;
  const sheetOriginOnContainer = getImageOriginOnTransformSubject(resizedImgSize, zoomableEvent);
  const pointOnSheet = {
    x: (viewportPosition.x - sheetOriginOnContainer.x) / zoomableEvent.zoomLevel / resizedImgScale,
    y: (viewportPosition.y - sheetOriginOnContainer.y) / zoomableEvent.zoomLevel / resizedImgScale
  };
  if (pointOnSheet.x < 0 || pointOnSheet.x > imageSize.width || pointOnSheet.y < 0 || pointOnSheet.y > imageSize.height) return null;
  return pointOnSheet;
}
//# sourceMappingURL=coordinateConversion.js.map