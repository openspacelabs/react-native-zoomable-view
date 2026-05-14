import { calcShiftDelta } from '../calcShiftDelta';

describe('calcShiftDelta', () => {
  it('SPEC-027: zoom=1, sensitivity=1 passes dx/dy through unchanged', () => {
    expect(
      calcShiftDelta({ dx: 10, dy: 0, zoom: 1, movementSensitivity: 1 })
    ).toEqual({ dxShift: 10, dyShift: 0 });
  });

  it('SPEC-027: zoom scales the shift down (dx/zoom)', () => {
    expect(
      calcShiftDelta({ dx: 10, dy: 8, zoom: 2, movementSensitivity: 1 })
    ).toEqual({ dxShift: 5, dyShift: 4 });
  });

  it('SPEC-027: movementSensitivity scales the shift down (dx/zoom/sensitivity)', () => {
    expect(
      calcShiftDelta({ dx: 10, dy: 0, zoom: 1, movementSensitivity: 2 })
    ).toEqual({ dxShift: 5, dyShift: 0 });
  });

  it('SPEC-028: movementSensitivity=0 returns {0,0} (silently disables panning)', () => {
    expect(
      calcShiftDelta({ dx: 10, dy: 10, zoom: 1, movementSensitivity: 0 })
    ).toEqual({ dxShift: 0, dyShift: 0 });
  });

  it('SPEC-109: dy axis is independent of dx (regression for dy/dx swap)', () => {
    // Pure-vertical: dx=0 must not bleed into dyShift; pure-horizontal: dy=0
    // must not bleed into dxShift.
    expect(
      calcShiftDelta({ dx: 0, dy: 20, zoom: 1, movementSensitivity: 1 })
    ).toEqual({ dxShift: 0, dyShift: 20 });
    expect(
      calcShiftDelta({ dx: 20, dy: 0, zoom: 1, movementSensitivity: 1 })
    ).toEqual({ dxShift: 20, dyShift: 0 });
  });

  it('handles negative dx/dy symmetrically', () => {
    expect(
      calcShiftDelta({ dx: -10, dy: -4, zoom: 2, movementSensitivity: 1 })
    ).toEqual({ dxShift: -5, dyShift: -2 });
  });
});
