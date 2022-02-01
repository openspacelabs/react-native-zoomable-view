module.exports = {
  roots: ['.'],
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
  },
  globals: {
    'window': {},
    'navigator': {},
    '__DEV__': true,
    'ts-jest': {
      babelConfig: true,
    },
  },
  testRegex: '(\\.|/)(test|spec)\\.(js|ts|tsx)?$',
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  collectCoverage: false,
  clearMocks: true,
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-.*|react-.*|@fullstory|@sentry|jest-runtime)/)',
  ],
  modulePathIgnorePatterns: ['<rootDir>/lib'],
  preset: 'react-native',
  testTimeout: 30000,
  testEnvironment: 'jsdom',
};
