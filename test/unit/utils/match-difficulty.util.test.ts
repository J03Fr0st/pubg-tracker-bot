import {
  type LobbyDifficultyResult,
  type OpponentDifficultyResult,
  type OpponentSeasonStats,
  calculateLobbyDifficulty,
  calculateOpponentDifficulty,
} from '../../../src/utils/match-difficulty.util';

describe('calculateOpponentDifficulty', () => {
  const stats = (kd: number, adr: number): OpponentSeasonStats => ({ kd, adr });

  describe('baseline scoring', () => {
    it('scores a 1.0 K/D, 150 ADR opponent as 50 Standard', () => {
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(1.0, 150)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 50,
        label: 'Standard',
        opponentCount: 1,
      });
    });

    it('scores a 0.5 K/D, 75 ADR opponent as 25 Easy', () => {
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(0.5, 75)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 25,
        label: 'Easy',
        opponentCount: 1,
      });
    });

    it('scores a 0 K/D, 0 ADR opponent as 0 Easy', () => {
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(0, 0)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 0,
        label: 'Easy',
        opponentCount: 1,
      });
    });
  });

  describe('hard opponents', () => {
    it('scores a 1.5 K/D, 225 ADR opponent as 75 Hard', () => {
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(1.5, 225)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 75,
        label: 'Hard',
        opponentCount: 1,
      });
    });
  });

  describe('brutal opponents', () => {
    it('scores a 2.0 K/D, 300 ADR opponent as 100 Brutal', () => {
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(2.0, 300)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 100,
        label: 'Brutal',
        opponentCount: 1,
      });
    });

    it('clamps extreme K/D and ADR to 100 Brutal', () => {
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(10, 1500)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 100,
        label: 'Brutal',
        opponentCount: 1,
      });
    });
  });

  describe('label thresholds', () => {
    it('labels a score of 34 as Easy', () => {
      // 0.34 K/D + 51 ADR => ((0.34) + (0.34))/2 * 50 = 17 ; need score 34
      // Use kd=0.68, adr=102 => ((0.68)+(0.68))/2*50 = 34
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(0.68, 102)]])
      );
      expect(result?.label).toBe('Easy');
      expect(result?.score).toBe(34);
    });

    it('labels a score of 35 as Standard', () => {
      // kd=0.7, adr=105 => ((0.7)+(0.7))/2*50 = 35
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(0.7, 105)]])
      );
      expect(result?.label).toBe('Standard');
      expect(result?.score).toBe(35);
    });

    it('labels a score of 64 as Standard', () => {
      // kd=1.28, adr=192 => ((1.28)+(1.28))/2*50 = 64
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(1.28, 192)]])
      );
      expect(result?.label).toBe('Standard');
      expect(result?.score).toBe(64);
    });

    it('labels a score of 65 as Hard', () => {
      // kd=1.3, adr=195 => ((1.3)+(1.3))/2*50 = 65
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(1.3, 195)]])
      );
      expect(result?.label).toBe('Hard');
      expect(result?.score).toBe(65);
    });

    it('labels a score of 84 as Hard', () => {
      // kd=1.68, adr=252 => ((1.68)+(1.68))/2*50 = 84
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(1.68, 252)]])
      );
      expect(result?.label).toBe('Hard');
      expect(result?.score).toBe(84);
    });

    it('labels a score of 85 as Brutal', () => {
      // kd=1.7, adr=255 => ((1.7)+(1.7))/2*50 = 85
      const result = calculateOpponentDifficulty(
        ['account.1'],
        new Map([['account.1', stats(1.7, 255)]])
      );
      expect(result?.label).toBe('Brutal');
      expect(result?.score).toBe(85);
    });
  });

  describe('multiple opponents', () => {
    it('averages per-opponent scores with Math.round', () => {
      // 1.0/150 => 50, 2.0/300 => 100, average 75 => Hard
      const seasonStats = new Map<string, OpponentSeasonStats>([
        ['account.1', stats(1.0, 150)],
        ['account.2', stats(2.0, 300)],
      ]);
      const result = calculateOpponentDifficulty(['account.1', 'account.2'], seasonStats);
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 75,
        label: 'Hard',
        opponentCount: 2,
      });
    });

    it('rounds the averaged score to the nearest integer', () => {
      // 50 and 75 average to 62.5 => rounds to 63 => Standard
      const seasonStats = new Map<string, OpponentSeasonStats>([
        ['account.1', stats(1.0, 150)],
        ['account.2', stats(1.5, 225)],
      ]);
      const result = calculateOpponentDifficulty(['account.1', 'account.2'], seasonStats);
      expect(result?.score).toBe(63);
      expect(result?.label).toBe('Standard');
      expect(result?.opponentCount).toBe(2);
    });
  });

  describe('dedupe and validation', () => {
    it('counts duplicate account IDs only once', () => {
      const result = calculateOpponentDifficulty(
        ['account.1', 'account.1', 'account.1'],
        new Map([['account.1', stats(1.0, 150)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 50,
        label: 'Standard',
        opponentCount: 1,
      });
    });

    it('ignores empty account IDs', () => {
      const result = calculateOpponentDifficulty(
        ['', 'account.1', ''],
        new Map([
          ['', stats(2.0, 300)],
          ['account.1', stats(1.0, 150)],
        ])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 50,
        label: 'Standard',
        opponentCount: 1,
      });
    });

    it('ignores opponents missing from the season stats map', () => {
      const result = calculateOpponentDifficulty(
        ['account.1', 'account.missing'],
        new Map([['account.1', stats(1.0, 150)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 50,
        label: 'Standard',
        opponentCount: 1,
      });
    });

    it('ignores stats with negative K/D', () => {
      const result = calculateOpponentDifficulty(
        ['account.1', 'account.2'],
        new Map([
          ['account.1', stats(-1, 100)],
          ['account.2', stats(1.0, 150)],
        ])
      );
      expect(result?.score).toBe(50);
      expect(result?.opponentCount).toBe(1);
    });

    it('ignores stats with negative ADR', () => {
      const result = calculateOpponentDifficulty(
        ['account.1', 'account.2'],
        new Map([
          ['account.1', stats(1.0, -10)],
          ['account.2', stats(1.0, 150)],
        ])
      );
      expect(result?.score).toBe(50);
      expect(result?.opponentCount).toBe(1);
    });

    it('ignores stats with NaN K/D', () => {
      const result = calculateOpponentDifficulty(
        ['account.1', 'account.2'],
        new Map([
          ['account.1', stats(Number.NaN, 100)],
          ['account.2', stats(1.0, 150)],
        ])
      );
      expect(result?.score).toBe(50);
      expect(result?.opponentCount).toBe(1);
    });

    it('ignores stats with NaN ADR', () => {
      const result = calculateOpponentDifficulty(
        ['account.1', 'account.2'],
        new Map([
          ['account.1', stats(1.0, Number.NaN)],
          ['account.2', stats(1.0, 150)],
        ])
      );
      expect(result?.score).toBe(50);
      expect(result?.opponentCount).toBe(1);
    });

    it('ignores stats with Infinity K/D', () => {
      const result = calculateOpponentDifficulty(
        ['account.1', 'account.2'],
        new Map([
          ['account.1', stats(Number.POSITIVE_INFINITY, 100)],
          ['account.2', stats(1.0, 150)],
        ])
      );
      expect(result?.score).toBe(50);
      expect(result?.opponentCount).toBe(1);
    });

    it('ignores stats with Infinity ADR', () => {
      const result = calculateOpponentDifficulty(
        ['account.1', 'account.2'],
        new Map([
          ['account.1', stats(1.0, Number.POSITIVE_INFINITY)],
          ['account.2', stats(1.0, 150)],
        ])
      );
      expect(result?.score).toBe(50);
      expect(result?.opponentCount).toBe(1);
    });
  });

  describe('no usable opponents', () => {
    it('returns null when the input is empty', () => {
      const result = calculateOpponentDifficulty([], new Map());
      expect(result).toBeNull();
    });

    it('returns null when all opponents are missing from the map', () => {
      const result = calculateOpponentDifficulty(['account.1'], new Map());
      expect(result).toBeNull();
    });

    it('returns null when all stats are invalid', () => {
      const seasonStats = new Map<string, OpponentSeasonStats>([
        ['account.1', stats(-1, 100)],
        ['account.2', stats(1.0, Number.NaN)],
      ]);
      const result = calculateOpponentDifficulty(['account.1', 'account.2'], seasonStats);
      expect(result).toBeNull();
    });

    it('returns null when only empty account IDs are provided', () => {
      const result = calculateOpponentDifficulty(['', ''], new Map([['', stats(1.0, 150)]]));
      expect(result).toBeNull();
    });
  });

  describe('iterable inputs', () => {
    it('accepts a Set of account IDs', () => {
      const result = calculateOpponentDifficulty(
        new Set(['account.1']),
        new Map([['account.1', stats(1.0, 150)]])
      );
      expect(result).toEqual<OpponentDifficultyResult>({
        score: 50,
        label: 'Standard',
        opponentCount: 1,
      });
    });
  });
});

describe('calculateLobbyDifficulty', () => {
  const stats = (kd: number, adr: number): OpponentSeasonStats => ({ kd, adr });

  it('scores humans and bots together, counting bots as zero-score players', () => {
    const result = calculateLobbyDifficulty(
      ['account.1', 'account.2', 'ai.1', 'ai.2'],
      new Map([
        ['account.1', stats(1.0, 150)],
        ['account.2', stats(2.0, 300)],
      ])
    );

    expect(result).toEqual<LobbyDifficultyResult>({
      score: 38,
      label: 'Standard',
      playerCount: 4,
      humanCount: 2,
      botCount: 2,
    });
  });

  it('dedupes duplicate human and bot account IDs', () => {
    const result = calculateLobbyDifficulty(
      ['account.1', 'account.1', 'ai.1', 'ai.1'],
      new Map([['account.1', stats(1.0, 150)]])
    );

    expect(result).toEqual<LobbyDifficultyResult>({
      score: 25,
      label: 'Easy',
      playerCount: 2,
      humanCount: 1,
      botCount: 1,
    });
  });

  it('can score a bot-only lobby as Easy', () => {
    const result = calculateLobbyDifficulty(['ai.1', 'ai.2'], new Map());

    expect(result).toEqual<LobbyDifficultyResult>({
      score: 0,
      label: 'Easy',
      playerCount: 2,
      humanCount: 0,
      botCount: 2,
    });
  });

  it('returns null when only human participants are missing stats', () => {
    const result = calculateLobbyDifficulty(['account.1'], new Map());

    expect(result).toBeNull();
  });
});
