import { applyPinchSensitivity } from '../applyPinchSensitivity';

describe('applyPinchSensitivity', () => {
  it('SPEC-095: sensitivity=0 returns deltaGrowth unchanged (no resistance)', () => {
    expect(applyPinchSensitivity(0.5, 0)).toBe(0.5);
    expect(applyPinchSensitivity(-0.5, 0)).toBe(-0.5);
  });

  it('SPEC-095: sensitivity=1 scales deltaGrowth by 0.91 (1 - 9/100)', () => {
    expect(applyPinchSensitivity(1, 1)).toBeCloseTo(0.91, 10);
    expect(applyPinchSensitivity(0.2, 1)).toBeCloseTo(0.2 * 0.91, 10);
  });

  it('SPEC-095: sensitivity=10 scales deltaGrowth by 0.1 (90% resistance)', () => {
    expect(applyPinchSensitivity(1, 10)).toBeCloseTo(0.1, 10);
  });

  it('negative deltaGrowth scales by the same factor', () => {
    expect(applyPinchSensitivity(-0.5, 10)).toBeCloseTo(-0.05, 10);
  });

  it('sensitivity > 10 follows the same linear formula (no clamp in source)', () => {
    // Source does not clamp: sensitivity=20 → 1 - 180/100 = -0.8
    expect(applyPinchSensitivity(1, 20)).toBeCloseTo(-0.8, 10);
  });
});
