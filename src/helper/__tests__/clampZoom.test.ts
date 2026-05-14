import { clampZoom } from '../clampZoom';

describe('clampZoom', () => {
  it('returns z unchanged when min < z < max', () => {
    expect(clampZoom(1.5, 2, 0.5)).toBe(1.5);
  });

  it('clamps high when z > max', () => {
    expect(clampZoom(3, 2, 0.5)).toBe(2);
  });

  it('clamps low when z < min', () => {
    expect(clampZoom(0.1, 2, 0.5)).toBe(0.5);
  });

  it('SPEC-020: maxZoom=Infinity acts as unbounded (Math.min(z, Infinity)=z)', () => {
    // Note: source uses `!= null` then `>` — Infinity is not null but
    // `z > Infinity` is always false, so z passes through unchanged.
    expect(clampZoom(1000, Infinity, 0.5)).toBe(1000);
    expect(clampZoom(1e100, Infinity, 0.5)).toBe(1e100);
  });

  it('SPEC-097: minZoom=-Infinity acts as unbounded', () => {
    expect(clampZoom(-1000, 10, -Infinity)).toBe(-1000);
  });

  it('SPEC-023: maxZoom=null/undefined → unbounded on high side', () => {
    expect(clampZoom(1000, null, 0.5)).toBe(1000);
    expect(clampZoom(1000, undefined, 0.5)).toBe(1000);
  });

  it('minZoom=null/undefined → unbounded on low side', () => {
    expect(clampZoom(-1000, 10, null)).toBe(-1000);
    expect(clampZoom(-1000, 10, undefined)).toBe(-1000);
  });

  it('both bounds nullish returns z untouched', () => {
    expect(clampZoom(42, null, null)).toBe(42);
    expect(clampZoom(42, undefined, undefined)).toBe(42);
  });
});
