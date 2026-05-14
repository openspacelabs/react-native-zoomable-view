import 'react-native-gesture-handler/jestSetup';

// Reanimated 3 ships an official mock that runs animated styles synchronously.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
  return require('react-native-reanimated/mock');
});

// Stub RN's renderer shim so importing RNGH's utils.js doesn't crash on
// `ReactNativeRenderer-dev` evaluation. RNGH's `useViewRefHandler` calls
// `findNodeHandle(ref)` via `RendererImplementation.js`, which lazily
// requires `ReactNativeRenderer-dev.js` and crashes under jest with
// `Cannot read properties of undefined (reading 'S')` (the documented
// Phase A §7a crash). We hand back a stable fake nodeHandle (42) — the
// gesture isn't attached to a real native view, but `attachHandlers`
// still completes and registers the testID. This mock is additive: it
// only intercepts a render path that tests don't otherwise reach.
// Hoisted here per phase E probe §6.1 so real-RNGH tests across the
// suite inherit it without per-file repetition.
jest.mock(
  'react-native/Libraries/Renderer/shims/ReactNative',
  () => ({
    __esModule: true,
    default: {
      findHostInstance_DEPRECATED: (ref: unknown) => ref,
      findNodeHandle: () => 42,
      render: () => null,
      unmountComponentAtNodeAndRemoveContainer: () => null,
      unstable_batchedUpdates: (fn: () => void) => {
        fn();
      },
      dispatchCommand: () => null,
      sendAccessibilityEvent: () => null,
      isChildPublicInstance: () => false,
    },
  }),
  { virtual: false }
);

// Reanimated mock recommends silencing the layout-animation warning.
// (See https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/)
jest.spyOn(global.console, 'warn').mockImplementation((msg: unknown) => {
  if (typeof msg === 'string' && msg.includes('Reanimated 2')) return;
  // fall through other warnings
});
