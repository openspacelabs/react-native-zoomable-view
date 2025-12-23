// Mock NativeModules to prevent native module errors
jest.mock('react-native/Libraries/Settings/NativeSettingsManager', () => ({
  getConstants: () => ({}),
  setValues: jest.fn(),
}));

// Mock requestAnimationFrame and setTimeout
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
