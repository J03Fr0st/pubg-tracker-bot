/**
 * Example test file to ensure Jest is working correctly
 */

describe('Example Test Suite', () => {
  test('should pass basic test', () => {
    expect(true).toBe(true);
  });

  test('should perform basic arithmetic', () => {
    const result = 2 + 2;
    expect(result).toBe(4);
  });

  test('should handle string operations', () => {
    const greeting = 'Hello';
    const name = 'World';
    const result = `${greeting} ${name}`;
    expect(result).toBe('Hello World');
  });
});
