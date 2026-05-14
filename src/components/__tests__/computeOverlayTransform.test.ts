import { computeOverlayTransform } from '../NonScalingOverlay';

describe('computeOverlayTransform', () => {
  it('EC-NSO-4: at zoom=1 with no pan, transform centres on wrapper', () => {
    const result = computeOverlayTransform({
      contentWidth: 400,
      contentHeight: 600,
      wrapperWidth: 400,
      wrapperHeight: 600,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    });
    expect(result.width).toBe(400);
    expect(result.height).toBe(600);
    expect(result.transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { rotate: '0rad' },
      { translateX: 0 },
      { translateY: 0 },
    ]);
  });

  it('EC-NSO-5: at zoom=2, width/height double and centring translate is -wrapper/2', () => {
    const result = computeOverlayTransform({
      contentWidth: 400,
      contentHeight: 600,
      wrapperWidth: 400,
      wrapperHeight: 600,
      zoom: 2,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    });
    expect(result.width).toBe(800);
    expect(result.height).toBe(1200);
    // wrapperW/2 - z*contentW/2 = 200 - 400 = -200
    // wrapperH/2 - z*contentH/2 = 300 - 600 = -300
    expect(result.transform[0]).toEqual({ translateX: -200 });
    expect(result.transform[1]).toEqual({ translateY: -300 });
  });

  it('EC-NSO-3: transform is always a 5-element array, with or without rotation', () => {
    const r0 = computeOverlayTransform({
      contentWidth: 100,
      contentHeight: 100,
      wrapperWidth: 100,
      wrapperHeight: 100,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    });
    const rPiOver2 = computeOverlayTransform({
      contentWidth: 100,
      contentHeight: 100,
      wrapperWidth: 100,
      wrapperHeight: 100,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: Math.PI / 2,
    });
    expect(r0.transform).toHaveLength(5);
    expect(rPiOver2.transform).toHaveLength(5);
    expect(rPiOver2.transform[2]).toEqual({ rotate: `${Math.PI / 2}rad` });
  });

  it('EC-NSO-6: pan offsets occupy transform[3..4], NOT folded into the centring translate', () => {
    const result = computeOverlayTransform({
      contentWidth: 100,
      contentHeight: 100,
      wrapperWidth: 100,
      wrapperHeight: 100,
      zoom: 1,
      offsetX: 10,
      offsetY: 20,
      rotation: Math.PI / 2,
    });
    // centring (index 0, 1) is unchanged by rotation+pan — it's wrapperW/2 - z*contentW/2
    expect(result.transform[0]).toEqual({ translateX: 0 });
    expect(result.transform[1]).toEqual({ translateY: 0 });
    // rotation at index 2
    expect(result.transform[2]).toEqual({ rotate: `${Math.PI / 2}rad` });
    // pan at index 3, 4 — applied IN the rotated frame
    expect(result.transform[3]).toEqual({ translateX: 10 });
    expect(result.transform[4]).toEqual({ translateY: 20 });
  });

  it('pan offsets are scaled by zoom', () => {
    const result = computeOverlayTransform({
      contentWidth: 100,
      contentHeight: 100,
      wrapperWidth: 100,
      wrapperHeight: 100,
      zoom: 3,
      offsetX: 10,
      offsetY: -5,
      rotation: 0,
    });
    expect(result.transform[3]).toEqual({ translateX: 30 });
    expect(result.transform[4]).toEqual({ translateY: -15 });
  });

  it('wrapper > content (letterbox): centring translates positive', () => {
    // wrapper 800x600, content 400x400, zoom=1 → centring tx=200, ty=100
    const result = computeOverlayTransform({
      contentWidth: 400,
      contentHeight: 400,
      wrapperWidth: 800,
      wrapperHeight: 600,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    });
    expect(result.transform[0]).toEqual({ translateX: 200 });
    expect(result.transform[1]).toEqual({ translateY: 100 });
  });

  it('zoom < 1 (zoomed out) with negative pan', () => {
    const result = computeOverlayTransform({
      contentWidth: 400,
      contentHeight: 400,
      wrapperWidth: 400,
      wrapperHeight: 400,
      zoom: 0.5,
      offsetX: -50,
      offsetY: -25,
      rotation: 0,
    });
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    // wrapperW/2 - z*contentW/2 = 200 - 100 = 100
    expect(result.transform[0]).toEqual({ translateX: 100 });
    expect(result.transform[1]).toEqual({ translateY: 100 });
    expect(result.transform[3]).toEqual({ translateX: -25 });
    expect(result.transform[4]).toEqual({ translateY: -12.5 });
  });

  it('contentWidth=0 returns width=0 (component is responsible for null-rendering)', () => {
    const result = computeOverlayTransform({
      contentWidth: 0,
      contentHeight: 100,
      wrapperWidth: 100,
      wrapperHeight: 100,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    });
    expect(result.width).toBe(0);
    expect(result.transform[0]).toEqual({ translateX: 50 });
  });

  it('large content and zoom produce finite results', () => {
    const result = computeOverlayTransform({
      contentWidth: 10000,
      contentHeight: 10000,
      wrapperWidth: 500,
      wrapperHeight: 500,
      zoom: 5,
      offsetX: 1000,
      offsetY: 1000,
      rotation: Math.PI,
    });
    expect(Number.isFinite(result.width)).toBe(true);
    expect(Number.isFinite(result.height)).toBe(true);
    result.transform.forEach((t) => {
      if (!('rotate' in t)) {
        const v = 'translateX' in t ? t.translateX : t.translateY;
        expect(Number.isFinite(v)).toBe(true);
      }
    });
    expect(result.transform[2]).toEqual({ rotate: `${Math.PI}rad` });
  });
});
