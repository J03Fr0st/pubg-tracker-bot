module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  maxConcurrency: 1,
  // Look for test files in the test directory
  testMatch: [
    '**/test/**/*.test.ts',
    '**/test/**/*.spec.ts'
  ],
  // Allow tests to pass even if no test files are found
  passWithNoTests: true
}; 