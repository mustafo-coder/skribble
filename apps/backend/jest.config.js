/** Unit + integration tests (*.spec.ts under src). e2e lives in /test. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleNameMapper: {
    // Resolve to the BUILT shared package (real .js files). Run
    // `npm run build -w @skribble/shared` first (CI does this before tests).
    '^@skribble/shared$': '<rootDir>/../../../packages/shared/dist/index.js',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
