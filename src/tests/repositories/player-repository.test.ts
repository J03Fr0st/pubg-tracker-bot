import { PlayerRepository } from '../../repositories/player-repository';
import { readFile, writeFile } from 'fs/promises';

jest.mock('fs/promises');

describe('PlayerRepository', () => {
  let repository: PlayerRepository;
  const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
  const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

  beforeEach(() => {
    repository = new PlayerRepository();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should load existing players from file', async () => {
      const mockPlayers = [
        { name: 'Player1', addedAt: '2024-03-10T00:00:00.000Z' }
      ];
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockPlayers));

      await repository.initialize();
      const players = await repository.getPlayers();

      expect(players).toEqual(['Player1']);
    });

    it('should create empty players list if file does not exist', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('File not found'));

      await repository.initialize();
      const players = await repository.getPlayers();

      expect(players).toEqual([]);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify([]),
        'utf-8'
      );
    });
  });

  describe('addPlayer', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should add new player', async () => {
      await repository.addPlayer('NewPlayer');
      const players = await repository.getPlayers();

      expect(players).toContain('NewPlayer');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should throw error if player already exists', async () => {
      await repository.addPlayer('ExistingPlayer');
      await expect(repository.addPlayer('ExistingPlayer'))
        .rejects
        .toThrow('Player already exists in monitoring list');
    });
  });
}); 