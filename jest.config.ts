export default {
  displayName: { name: 'nodejs-streaming-etl', color: 'green' },
  testMatch: [ '<rootDir>/it/*.spec.ts' ],
  setupFiles: [ 'dotenv/config' ],
  globals: { 'ts-jest': { tsconfig: '<rootDir>/tsconfig.json' } },
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]s$': ['ts-jest'] },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testTimeout: 30000,
  reporters: [ 'default', [ 'jest-junit', { outputDirectory: 'test-reports' } ] ],
};