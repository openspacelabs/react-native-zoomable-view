import { shouldSkipShift } from '../shouldSkipShift';

describe('shouldSkipShift', () => {
  it('SPEC-108: panEnabled=false → skip (true)', () => {
    expect(
      shouldSkipShift({
        panEnabled: false,
        disablePanOnInitialZoom: false,
        zoom: 1.5,
        initialZoom: 1,
      })
    ).toBe(true);
  });

  it('SPEC-029: disablePanOnInitialZoom && zoom===initialZoom → skip', () => {
    expect(
      shouldSkipShift({
        panEnabled: true,
        disablePanOnInitialZoom: true,
        zoom: 1,
        initialZoom: 1,
      })
    ).toBe(true);
  });

  it('SPEC-029: disablePanOnInitialZoom && zoom!==initialZoom → do NOT skip', () => {
    expect(
      shouldSkipShift({
        panEnabled: true,
        disablePanOnInitialZoom: true,
        zoom: 1.5,
        initialZoom: 1,
      })
    ).toBe(false);
  });

  it('all-enabled / non-initial zoom → do NOT skip', () => {
    expect(
      shouldSkipShift({
        panEnabled: true,
        disablePanOnInitialZoom: false,
        zoom: 2,
        initialZoom: 1,
      })
    ).toBe(false);
  });

  it('panEnabled=false has priority over disablePanOnInitialZoom check', () => {
    expect(
      shouldSkipShift({
        panEnabled: false,
        disablePanOnInitialZoom: false,
        zoom: 1.5,
        initialZoom: 1,
      })
    ).toBe(true);
  });
});
