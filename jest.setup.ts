import 'react-native-gesture-handler/jestSetup';

// Reanimated 3 ships an official mock that runs animated styles synchronously.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
  return require('react-native-reanimated/mock');
});

// Reanimated mock recommends silencing the layout-animation warning.
// (See https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/)
jest.spyOn(global.console, 'warn').mockImplementation((msg: unknown) => {
  if (typeof msg === 'string' && msg.includes('Reanimated 2')) return;
  // fall through other warnings
});
