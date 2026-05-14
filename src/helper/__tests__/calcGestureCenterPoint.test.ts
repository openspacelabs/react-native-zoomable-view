import { GestureTouchEvent } from 'react-native-gesture-handler';

import { calcGestureCenterPoint } from '../index';

function makeEvent(
  touches: Array<{ x: number; y: number }>
): GestureTouchEvent {
  // Cast: real type has additional fields the helper does not read.
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

describe('calcGestureCenterPoint', () => {
  it('1 touch → returns that touch position', () => {
    expect(calcGestureCenterPoint(makeEvent([{ x: 10, y: 20 }]))).toEqual({
      x: 10,
      y: 20,
    });
  });

  it('2 touches → midpoint', () => {
    expect(
      calcGestureCenterPoint(
        makeEvent([
          { x: 0, y: 0 },
          { x: 100, y: 200 },
        ])
      )
    ).toEqual({ x: 50, y: 100 });
  });

  it('3+ touches → returns null (only 1 and 2 are handled)', () => {
    // Source: numberOfTouches must be exactly 1 or 2 to produce a result.
    expect(
      calcGestureCenterPoint(
        makeEvent([
          { x: 0, y: 0 },
          { x: 100, y: 100 },
          { x: 50, y: 50 },
        ])
      )
    ).toBeNull();
  });

  it('zero touches → returns null', () => {
    expect(calcGestureCenterPoint(makeEvent([]))).toBeNull();
  });

  it('negative coordinates produce a negative midpoint', () => {
    expect(
      calcGestureCenterPoint(
        makeEvent([
          { x: -10, y: -20 },
          { x: 10, y: 20 },
        ])
      )
    ).toEqual({ x: 0, y: 0 });
  });
});
