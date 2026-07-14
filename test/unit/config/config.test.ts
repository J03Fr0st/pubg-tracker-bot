const validEnv: NodeJS.ProcessEnv = {
  DISCORD_TOKEN: 'discord-token',
  DISCORD_CLIENT_ID: 'client-id',
  DISCORD_CHANNEL_ID: 'channel-id',
  PUBG_API_KEY: 'pubg-key',
  PUBG_SHARD: 'steam',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/pubg',
  CHECK_INTERVAL_MS: '90000',
  MAX_MATCHES_TO_PROCESS: '3',
  PUBG_MAX_REQUESTS_PER_MINUTE: '10',
  LLM_COACHING_ENABLED: 'false',
  LLM_TIMEOUT_MS: '8000',
};

const originalEnv = process.env;
process.env = { ...validEnv };
const importLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
const { loadConfig, validateConfig } =
  require('../../../src/config/config') as typeof import('../../../src/config/config');
importLog.mockRestore();
process.env = originalEnv;

function envWith(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...validEnv, ...overrides };
}

describe('configuration', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads and validates one typed configuration value', () => {
    expect(loadConfig(validEnv)).toEqual({
      discord: { token: 'discord-token', clientId: 'client-id', channelId: 'channel-id' },
      pubg: { apiKey: 'pubg-key', shard: 'steam', maxRequestsPerMinute: 10 },
      database: { url: 'postgresql://user:pass@localhost:5432/pubg' },
      monitoring: { checkIntervalMs: 90000, maxMatchesToProcess: 3 },
      llm: { coachingEnabled: false, provider: 'openrouter', timeoutMs: 8000 },
    });
  });

  it.each([
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CHANNEL_ID',
    'PUBG_API_KEY',
    'DATABASE_URL',
  ])('rejects a missing required %s value', (name) => {
    expect(() => loadConfig(envWith({ [name]: undefined }))).toThrow(
      `Required environment variable ${name} is not set`
    );
  });

  it('rejects an unsupported PUBG shard', () => {
    expect(() => loadConfig(envWith({ PUBG_SHARD: 'unsupported' }))).toThrow(
      'PUBG_SHARD is invalid: unsupported'
    );
  });

  it.each([
    ['PUBG_MAX_REQUESTS_PER_MINUTE', '0', 'PUBG max requests per minute must be greater than 0'],
    ['MAX_MATCHES_TO_PROCESS', '-1', 'Max matches to process must be greater than 0'],
    ['LLM_TIMEOUT_MS', '0', 'LLM timeout must be greater than 0'],
  ])('rejects a non-positive %s value', (name, value, message) => {
    expect(() => loadConfig(envWith({ [name]: value }))).toThrow(message);
  });

  it.each([
    ['CHECK_INTERVAL_MS', { monitoring: { checkIntervalMs: 90000 } }, 90000],
    ['MAX_MATCHES_TO_PROCESS', { monitoring: { maxMatchesToProcess: 3 } }, 3],
    ['PUBG_MAX_REQUESTS_PER_MINUTE', { pubg: { maxRequestsPerMinute: 10 } }, 10],
    ['LLM_TIMEOUT_MS', { llm: { timeoutMs: 8000 } }, 8000],
  ])('uses the numeric default when %s is invalid', (name, expectedConfig, expectedDefault) => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const config = loadConfig(envWith({ [name]: 'not-a-number' }));

    expect(config).toMatchObject(expectedConfig);
    expect(warning).toHaveBeenCalledWith(
      `Environment variable ${name} is not a valid number, using default: ${expectedDefault}`
    );
  });

  it.each([
    ['1', true],
    ['true', true],
    ['YES', true],
    ['On', true],
    ['0', false],
    ['false', false],
    ['no', false],
    ['off', false],
  ])('parses LLM_COACHING_ENABLED=%s as %s', (value, expected) => {
    expect(
      loadConfig(envWith({ LLM_COACHING_ENABLED: value, OPENROUTER_API_KEY: 'openrouter-key' })).llm
        .coachingEnabled
    ).toBe(expected);
  });

  it('uses numeric and boolean defaults when optional values are missing', () => {
    const config = loadConfig(
      envWith({
        CHECK_INTERVAL_MS: undefined,
        MAX_MATCHES_TO_PROCESS: undefined,
        PUBG_MAX_REQUESTS_PER_MINUTE: undefined,
        PUBG_SHARD: undefined,
        LLM_COACHING_ENABLED: undefined,
        LLM_TIMEOUT_MS: undefined,
      })
    );

    expect(config.monitoring).toEqual({ checkIntervalMs: 90000, maxMatchesToProcess: 3 });
    expect(config.pubg.shard).toBe('steam');
    expect(config.pubg.maxRequestsPerMinute).toBe(10);
    expect(config.llm).toMatchObject({ coachingEnabled: false, timeoutMs: 8000 });
  });

  it('warns when the check interval is very low', () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    loadConfig(envWith({ CHECK_INTERVAL_MS: '4999' }));

    expect(warning).toHaveBeenCalledWith(
      'Check interval is very low, this may cause rate limiting issues'
    );
  });

  it('validates and returns the supplied configuration value', () => {
    const config = loadConfig(validEnv);

    expect(validateConfig(config)).toBe(config);
  });
});
