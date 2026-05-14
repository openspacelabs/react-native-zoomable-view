import { calcNewScaledOffsetForZoomCentering } from '../calcNewScaledOffsetForZoomCentering';

describe('calcNewScaledOffsetForZoomCentering', () => {
  it('SPEC-096: same-scale + zoom centre at subject centre → offset unchanged', () => {
    // oldScale = newScale = 1, offset = 0, zoomCenter at W/2 (subject centre).
    // currentDist = (W/2 + 0) - W/2 = 0 → newDist = 0 → newOffset = 0.
    expect(calcNewScaledOffsetForZoomCentering(0, 100, 1, 1, 50)).toBeCloseTo(
      0
    );
  });

  it('SPEC-096: same-scale + arbitrary zoom centre → offset unchanged (growthRate=1)', () => {
    // growthRate=1 means newDist === currentDist → no offset change.
    expect(
      calcNewScaledOffsetForZoomCentering(0, 100, 1.5, 1.5, 17)
    ).toBeCloseTo(0);
  });

  it('SPEC-096: zoomCenter at (0,0), zoom 1→2, W=100 → offset becomes 25 (scaled)', () => {
    // origCenter=50, currCenter=50, dist=50-0=50, newDist=50*2=100, newCenter=100,
    // newOffsetUnscaled = 100-50 = 50, divided by newScale 2 → 25.
    expect(calcNewScaledOffsetForZoomCentering(0, 100, 1, 2, 0)).toBeCloseTo(
      25
    );
  });

  it('SPEC-096: zoom 1→2 then 2→1 round-trips offset back to original', () => {
    // Zoom in then zoom out about the same point should produce the original
    // offset. Pick zoomCenter=0, W=100, oldOffset=0.
    const offsetAfterZoomIn = calcNewScaledOffsetForZoomCentering(
      0,
      100,
      1,
      2,
      0
    );
    // Reverse the same zoom centring transform: oldScale=2, newScale=1,
    // oldOffsetXOrYScaled is the value we computed above.
    const offsetAfterZoomOut = calcNewScaledOffsetForZoomCentering(
      offsetAfterZoomIn,
      100,
      2,
      1,
      0
    );
    expect(offsetAfterZoomOut).toBeCloseTo(0, 6);
  });

  it('returns a finite number for typical inputs', () => {
    expect(
      Number.isFinite(calcNewScaledOffsetForZoomCentering(10, 800, 1, 1.5, 400))
    ).toBe(true);
  });
});
