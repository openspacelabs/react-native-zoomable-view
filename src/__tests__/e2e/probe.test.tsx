/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
/**
 * Phase E e2e probe — uses the REAL react-native-gesture-handler module
 * (no `jest.mock('react-native-gesture-handler', …)`), drives a single
 * tap through RNGH's actual builder + registry + Manual() handler chain,
 * and asserts `onSingleTap` fires after `doubleTapDelay`.
 *
 * Goal: prove that we can exercise RNZV's `Gesture.Manual()` callbacks
 * without rebuilding the gesture builder in a per-file mock.
 *
 * What's NOT mocked here:
 *   - react-native-gesture-handler (REAL — builder, registry, withTestId
 *     side effect via attachHandlers, Manual gesture class).
 *   - react-native (REAL via the `react-native` jest preset).
 *
 * What IS mocked (inherited from `jest.setup.ts`):
 *   - react-native-reanimated (official `react-native-reanimated/mock`).
 *   - RNGH's native module bridge (`react-native-gesture-handler/jestSetup`).
 *   - `react-native/Libraries/Renderer/shims/ReactNative` — minimum stub
 *     to bypass the `ReactNativeRenderer-dev` load crash (Phase A §7a).
 *     Hoisted to global setup per Phase E probe §6.1.
 */
import { jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// jest-utils is the subpath that exports test-only helpers
// (`fireGestureHandler`, `getByGestureTestId`). It's documented in RNGH
// 2.20.2 (verified at node_modules/react-native-gesture-handler/jest-utils/package.json).
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ReactNativeZoomableView } from '../../ReactNativeZoomableView';

const TAP_X = 50;
const TAP_Y = 50;

// Construct a GestureTouchEvent-shaped payload matching what RNGH would
// pass to a Manual() handler. Shape pulled from `phaseC1-findings.md §4`
// — same fields the existing mock-based suite uses, but here we feed it
// to the REAL gesture handler retrieved via getByGestureTestId.
const makeTouchEvent = (opts: {
  x: number;
  y: number;
  numberOfTouches?: number;
  eventType: number;
}) => {
  const x = opts.x;
  const y = opts.y;
  const numberOfTouches = opts.numberOfTouches ?? 1;
  const touches = [{ id: 0, x, y, absoluteX: x, absoluteY: y }];
  return {
    numberOfTouches,
    allTouches: touches,
    changedTouches: touches,
    eventType: opts.eventType,
    state: 4, // ACTIVE
    handlerTag: 1,
  };
};

const TOUCHES_DOWN = 1;
const TOUCHES_UP = 3;

// Minimal GestureStateManager stub. The real one is created internally
// by useAnimatedGesture / eventReceiver — we don't have access to that
// without driving via the native bridge. The stub is sufficient because
// RNZV's onTouchesDown/Up only call begin/activate/end on it, and RNGH's
// state machine isn't under test (we just need RNZV's worklet to run).
const makeStateManager = () => ({
  begin: jest.fn(),
  activate: jest.fn(),
  end: jest.fn(),
  fail: jest.fn(),
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Phase E e2e probe — real RNGH gesture chain', () => {
  it('single tap → onSingleTap fires after doubleTapDelay', () => {
    const onSingleTap = jest.fn();

    render(
      <GestureHandlerRootView>
        <ReactNativeZoomableView
          contentWidth={400}
          contentHeight={600}
          visualTouchFeedbackEnabled={false}
          onSingleTap={onSingleTap}
        />
      </GestureHandlerRootView>
    );

    // Grab the REAL gesture object out of RNGH's testID registry — this
    // is what attachHandlers put there when GestureDetector mounted.
    const gesture: any = getByGestureTestId('canvas-gesture');

    expect(gesture).toBeTruthy();
    expect(gesture.handlers).toBeTruthy();
    expect(gesture.handlers.onTouchesDown).toBeTruthy();
    expect(gesture.handlers.onTouchesUp).toBeTruthy();
    // Sanity: this is RNGH's REAL Manual gesture class instance, not a
    // mock builder. The constructor name comes from the actual RNGH
    // module — proves we didn't accidentally short-circuit the import.
    expect(gesture.constructor.name).toBe('ManualGesture');
    expect(gesture.handlerName).toBe('ManualGestureHandler');

    const sm = makeStateManager();

    // Touch down + touch up at the same position = single tap.
    gesture.handlers.onTouchesDown(
      makeTouchEvent({ x: TAP_X, y: TAP_Y, eventType: TOUCHES_DOWN }),
      sm
    );
    gesture.handlers.onTouchesUp(
      makeTouchEvent({
        x: TAP_X,
        y: TAP_Y,
        eventType: TOUCHES_UP,
        numberOfTouches: 0,
      }),
      sm
    );

    // Default doubleTapDelay is 300ms.
    // Before advancing timers, onSingleTap must NOT have fired — proves
    // the timer pipeline really is being driven (i.e. the assertion at
    // the end isn't satisfied by accidental synchronous firing).
    expect(onSingleTap).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);

    expect(onSingleTap).toHaveBeenCalledTimes(1);
  });
});
