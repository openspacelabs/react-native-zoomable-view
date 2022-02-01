/* eslint-disable no-undef */
import '@testing-library/jest-native/extend-expect';
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => {
  const original = jest.requireActual('react-native-reanimated');
  return {
    ...original,
    useAnimatedStyle: (fn) => fn(),
  };
});

global.__reanimatedWorkletInit = jest.fn();

export {};
