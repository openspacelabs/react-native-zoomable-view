import {
  applyContainResizeMode,
  getImageOriginOnTransformSubject,
  viewportPositionToImagePosition,
} from '../coordinateConversion';

describe('applyContainResizeMode', () => {
  it('SPEC-010: image aspect == container aspect → exact fit', () => {
    const result = applyContainResizeMode(
      { width: 200, height: 100 },
      { width: 400, height: 200 }
    );
    expect(result.size).toEqual({ width: 400, height: 200 });
    expect(result.scale).toBeCloseTo(2);
  });

  it('SPEC-010: image wider than container (longest edge horizontal) → letterbox top/bottom', () => {
    const result = applyContainResizeMode(
      { width: 200, height: 100 },
      { width: 400, height: 400 }
    );
    expect(result.size).toEqual({ width: 400, height: 200 });
    expect(result.scale).toBeCloseTo(2);
  });

  it('SPEC-010: image taller than container (longest edge vertical) → letterbox left/right', () => {
    const result = applyContainResizeMode(
      { width: 100, height: 200 },
      { width: 400, height: 400 }
    );
    expect(result.size).toEqual({ width: 200, height: 400 });
    expect(result.scale).toBeCloseTo(2);
  });

  it('SPEC-133: degenerate input (image width=0, height=0) returns null sentinel', () => {
    // imageAspect = NaN, areaAspect = 1; NaN >= 1 is false → vertical branch
    // newSize = { width: 100*NaN=NaN, height: 100 }; NaN-replacement rewrites
    // width to 100. Then scale = (imageWidth ? ... : newSize.height/imageHeight)
    // = 100/0 = Infinity → !isFinite → returns the {size:null, scale:null} sentinel.
    const result = applyContainResizeMode(
      { width: 0, height: 0 },
      { width: 100, height: 100 }
    );
    expect(result.size).toBeNull();
    expect(result.scale).toBeNull();
  });
});

describe('getImageOriginOnTransformSubject', () => {
  it('SPEC-010: at zoom=1 and offset=0, origin == centre offset of resized image', () => {
    // x = 0 + 400/2 - (200/2)*1 = 200 - 100 = 100
    // y = 0 + 400/2 - (100/2)*1 = 200 - 50  = 150
    expect(
      getImageOriginOnTransformSubject(
        { width: 200, height: 100 },
        {
          offsetX: 0,
          offsetY: 0,
          zoomLevel: 1,
          originalWidth: 400,
          originalHeight: 400,
        }
      )
    ).toEqual({ x: 100, y: 150 });
  });

  it('zoom scales the offset contribution but image size term too', () => {
    // x = 10*2 + 400/2 - (200/2)*2 = 20 + 200 - 200 = 20
    expect(
      getImageOriginOnTransformSubject(
        { width: 200, height: 100 },
        {
          offsetX: 10,
          offsetY: 0,
          zoomLevel: 2,
          originalWidth: 400,
          originalHeight: 400,
        }
      ).x
    ).toBeCloseTo(20);
  });
});

describe('viewportPositionToImagePosition', () => {
  it('SPEC-010: viewport centre maps to image centre at zoom=1, offset=0', () => {
    // Container 400x400; image 200x100. After contain: image fits as 400x200.
    // Origin on container: x = 0 + 200 - 200 = 0; y = 0 + 200 - 100 = 100.
    // viewport (200, 200) → pointOnSheet = ((200-0)/1/2, (200-100)/1/2) = (100, 50)
    // 100/50 in image coords = centre of 200x100 image. ✓
    const pt = viewportPositionToImagePosition({
      viewportPosition: { x: 200, y: 200 },
      imageSize: { width: 200, height: 100 },
      zoomableEvent: {
        offsetX: 0,
        offsetY: 0,
        zoomLevel: 1,
        originalWidth: 400,
        originalHeight: 400,
      },
    });
    if (pt === null) throw new Error('expected non-null image position');
    expect(pt.x).toBeCloseTo(100);
    expect(pt.y).toBeCloseTo(50);
  });

  it('SPEC-133: degenerate image (0x0) returns null (resize scale is null sentinel)', () => {
    const pt = viewportPositionToImagePosition({
      viewportPosition: { x: 200, y: 200 },
      imageSize: { width: 0, height: 0 },
      zoomableEvent: {
        offsetX: 0,
        offsetY: 0,
        zoomLevel: 1,
        originalWidth: 400,
        originalHeight: 400,
      },
    });
    expect(pt).toBeNull();
  });
});
