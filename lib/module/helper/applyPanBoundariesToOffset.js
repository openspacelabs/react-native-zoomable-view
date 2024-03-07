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
export function applyPanBoundariesToOffset(offsetScaled, containerSize, contentSize, scale, boundaryPadding) {
  const contentSizeUnscaled = contentSize * scale;
  const offsetUnscaled = offsetScaled * scale;
  const contentStartBorderUnscaled = containerSize / 2 + offsetUnscaled - contentSizeUnscaled / 2;
  const contentEndBorderUnscaled = contentStartBorderUnscaled + contentSizeUnscaled;
  const containerStartBorder = 0;
  const containerEndBorder = containerStartBorder + containerSize; // do not let boundary padding be greater than the container size or less than 0

  if (!boundaryPadding || boundaryPadding < 0) boundaryPadding = 0;
  if (boundaryPadding > containerSize) boundaryPadding = containerSize; // Calculate container's measurements with boundary padding applied.
  // this should shrink the container's size by the amount of the boundary padding,
  // so that the content inside can be panned a bit further away from the original container's boundaries.

  const paddedContainerSize = containerSize - boundaryPadding * 2;
  const paddedContainerStartBorder = containerStartBorder + boundaryPadding;
  const paddedContainerEndBorder = containerEndBorder - boundaryPadding; // if content is smaller than the padded container,
  // don't let the content move

  if (contentSizeUnscaled < paddedContainerSize) {
    return 0;
  } // if content is larger than the padded container,
  // don't let the padded container go outside of content
  // maximum distance the content's center can move from its original position.
  // assuming the content original center is the container's center.


  const contentMaxOffsetScaled = (paddedContainerSize / 2 - contentSizeUnscaled / 2) / scale;

  if ( // content reaching the end boundary
  contentEndBorderUnscaled < paddedContainerEndBorder) {
    return contentMaxOffsetScaled;
  }

  if ( // content reaching the start boundary
  contentStartBorderUnscaled > paddedContainerStartBorder) {
    return -contentMaxOffsetScaled;
  }

  return offsetScaled;
}
//# sourceMappingURL=applyPanBoundariesToOffset.js.map