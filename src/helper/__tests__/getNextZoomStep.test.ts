import { getNextZoomStep } from '../getNextZoomStep';

describe('getNextZoomStep', () => {
  it('SPEC-099: at maxZoom → returns initialZoom (cycle reset)', () => {
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: 2,
        initialZoom: 1,
        zoomLevel: 2,
      })
    ).toBe(1);
  });

  it('SPEC-099: cycle reset uses .toFixed(2) tolerance', () => {
    // 1.9999... rounds to 2.00 → treated as at max
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: 2,
        initialZoom: 1,
        zoomLevel: 1.999,
      })
    ).toBe(1);
  });

  it('SPEC-100: zoomStep=undefined → returns undefined (when not at max)', () => {
    expect(
      getNextZoomStep({
        zoomStep: undefined,
        maxZoom: 2,
        initialZoom: 1,
        zoomLevel: 1.2,
      })
    ).toBeUndefined();
  });

  it('SPEC-100: zoomStep=undefined BUT zoomLevel===maxZoom still cycles back', () => {
    // Cycle-back guard runs BEFORE the zoomStep guard.
    expect(
      getNextZoomStep({
        zoomStep: undefined,
        maxZoom: 2,
        initialZoom: 1,
        zoomLevel: 2,
      })
    ).toBe(1);
  });

  it('SPEC-101: effectiveMax with no maxZoom = initialZoom*(1+zoomStep)^3', () => {
    // initialZoom=1, zoomStep=0.5 → effectiveMax = 1 * 1.5^3 = 3.375
    // At zoom=3.375 → returns initialZoom (1).
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: undefined,
        initialZoom: 1,
        zoomLevel: 3.375,
      })
    ).toBe(1);
  });

  it('SPEC-102: at effectiveMax (no maxZoom configured) → returns initialZoom', () => {
    // initialZoom=2, zoomStep=0.5 → effectiveMax = 2 * 1.5^3 = 6.75
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: undefined,
        initialZoom: 2,
        zoomLevel: 6.75,
      })
    ).toBe(2);
  });

  it('SPEC-103: otherwise min(zoomLevel*(1+zoomStep), effectiveMax)', () => {
    // zoom=1, step=0.5 → 1.5 (under effectiveMax of 2)
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: 2,
        initialZoom: 1,
        zoomLevel: 1,
      })
    ).toBe(1.5);
  });

  it('SPEC-103: step that would overshoot effectiveMax clamps to effectiveMax', () => {
    // zoom=1.5, step=0.5 → 2.25; clamped to effectiveMax of 2
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: 2,
        initialZoom: 1,
        zoomLevel: 1.5,
      })
    ).toBe(2);
  });

  it('SPEC-104: full cycle 1 → 1.5 → 2 → 1 (initialZoom=1, maxZoom=2, step=0.5)', () => {
    const step1 = getNextZoomStep({
      zoomStep: 0.5,
      maxZoom: 2,
      initialZoom: 1,
      zoomLevel: 1,
    });
    expect(step1).toBe(1.5);

    const step2 = getNextZoomStep({
      zoomStep: 0.5,
      maxZoom: 2,
      initialZoom: 1,
      zoomLevel: step1 as number,
    });
    expect(step2).toBe(2);

    const step3 = getNextZoomStep({
      zoomStep: 0.5,
      maxZoom: 2,
      initialZoom: 1,
      zoomLevel: step2 as number,
    });
    expect(step3).toBe(1);
  });

  it('SPEC-020: maxZoom=Infinity is filtered to undefined → falls back to effectiveMax cycle', () => {
    // Number.isFinite(Infinity) === false, so finiteMaxZoom = undefined.
    // effectiveMax = 1 * 1.5^3 = 3.375 (NOT Infinity).
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: Infinity,
        initialZoom: 1,
        zoomLevel: 1,
      })
    ).toBe(1.5);
    // At the cycle ceiling for Infinity-mode it still returns initialZoom.
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: Infinity,
        initialZoom: 1,
        zoomLevel: 3.375,
      })
    ).toBe(1);
  });

  it('SPEC-022: getNextZoomStep does not consult minZoom (one-directional cycle)', () => {
    // No minZoom param in the signature — this is a structural test.
    // The function still produces a "next" value even when current zoom < initialZoom.
    const next = getNextZoomStep({
      zoomStep: 0.5,
      maxZoom: 2,
      initialZoom: 1,
      zoomLevel: 0.4,
    });
    // 0.4 * 1.5 = 0.6 (modulo IEEE-754 noise), under effectiveMax of 2
    expect(next).toBeCloseTo(0.6, 10);
  });

  it('initialZoom=undefined defaults to 1 inside effectiveMax computation', () => {
    // initialZoom=undefined, maxZoom=undefined → effectiveMax = 1 * 1.5^3 = 3.375
    expect(
      getNextZoomStep({
        zoomStep: 0.5,
        maxZoom: undefined,
        initialZoom: undefined,
        zoomLevel: 3.375,
      })
    ).toBeUndefined(); // returns `initialZoom` which is undefined
  });

  it('zoomStep=0 produces no growth: next = zoomLevel (or effectiveMax cycle)', () => {
    // effectiveMax = 1 * 1^3 = 1. zoomLevel=1 hits cycle → returns initialZoom.
    expect(
      getNextZoomStep({
        zoomStep: 0,
        maxZoom: undefined,
        initialZoom: 1,
        zoomLevel: 1,
      })
    ).toBe(1);
  });
});
