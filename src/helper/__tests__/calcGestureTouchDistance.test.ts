import { GestureTouchEvent } from 'react-native-gesture-handler';

import { calcGestureTouchDistance } from '../index';

function makeEvent(
  touches: Array<{ x: number; y: number }>
): GestureTouchEvent {
  return {
    numberOfTouches: touches.length,
    allTouches: touches.map((t, i) => ({
      id: i,
      x: t.x,
      y: t.y,
      absoluteX: t.x,
      absoluteY: t.y,
    })),
    changedTouches: [],
    state: 0,
  } as unknown as GestureTouchEvent;
}

describe('calcGestureTouchDistance', () => {
  it('horizontal-only touches: distance == |dx|', () => {
    expect(
      calcGestureTouchDistance(
        makeEvent([
          { x: 0, y: 50 },
          { x: 10, y: 50 },
        ])
      )
    ).toBeCloseTo(10);
  });

  it('vertical-only touches: distance == |dy| (PR #151 regression test for dy/dx swap)', () => {
    // Source line 45: const dy = Math.abs(touches[0].y - touches[1].y);
    // Previously this used .x in error, returning 0 here.
    expect(
      calcGestureTouchDistance(
        makeEvent([
          { x: 50, y: 0 },
          { x: 50, y: 10 },
        ])
      )
    ).toBeCloseTo(10);
  });

  it('3-4-5 right triangle distance', () => {
    expect(
      calcGestureTouchDistance(
        makeEvent([
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ])
      )
    ).toBeCloseTo(5);
  });

  it('negative coordinates → absolute distance', () => {
    expect(
      calcGestureTouchDistance(
        makeEvent([
          { x: -3, y: -4 },
          { x: 0, y: 0 },
        ])
      )
    ).toBeCloseTo(5);
  });

  it('numberOfTouches !== 2 returns null (1 touch)', () => {
    expect(calcGestureTouchDistance(makeEvent([{ x: 5, y: 5 }]))).toBeNull();
  });

  it('numberOfTouches !== 2 returns null (3 touches)', () => {
    expect(
      calcGestureTouchDistance(
        makeEvent([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ])
      )
    ).toBeNull();
  });
});
