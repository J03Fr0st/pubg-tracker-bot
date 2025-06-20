import { ProcessedMatchRepository } from '../../../src/data/repositories/processed-match.repository';

// Mock the ProcessedMatch model
jest.mock('../../../src/data/models/processed-match.model', () => ({
  ProcessedMatch: {
    findOne: jest.fn(),
    findByIdAndDelete: jest.fn(),
    create: jest.fn(),
    find: jest.fn()
  }
}));

import { ProcessedMatch } from '../../../src/data/models/processed-match.model';

describe('ProcessedMatchRepository', () => {
  let repository: ProcessedMatchRepository;
  const mockProcessedMatch = ProcessedMatch as jest.Mocked<typeof ProcessedMatch>;

  beforeEach(() => {
    repository = new ProcessedMatchRepository();
    jest.clearAllMocks();
  });

  describe('removeLastProcessedMatch', () => {
    test('should return null when no matches exist', async () => {
      // Arrange
      mockProcessedMatch.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(null)
        })
      } as any);

      // Act
      const result = await repository.removeLastProcessedMatch();

      // Assert
      expect(result).toBeNull();
      expect(mockProcessedMatch.findByIdAndDelete).not.toHaveBeenCalled();
    });

    test('should remove and return the last match ID when matches exist', async () => {
      // Arrange
      const mockMatch = {
        _id: 'some-id',
        matchId: 'match-123'
      };

      mockProcessedMatch.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(mockMatch)
        })
      } as any);

      mockProcessedMatch.findByIdAndDelete.mockResolvedValue(mockMatch as any);

      // Act
      const result = await repository.removeLastProcessedMatch();

      // Assert
      expect(result).toBe('match-123');
      expect(mockProcessedMatch.findOne().sort).toHaveBeenCalledWith({ processedAt: -1 });
      expect(mockProcessedMatch.findByIdAndDelete).toHaveBeenCalledWith('some-id');
    });
  });

  describe('getLastProcessedMatch', () => {
    test('should return null when no matches exist', async () => {
      // Arrange
      mockProcessedMatch.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(null)
        })
      } as any);

      // Act
      const result = await repository.getLastProcessedMatch();

      // Assert
      expect(result).toBeNull();
    });

    test('should return match details when matches exist', async () => {
      // Arrange
      const mockMatch = {
        matchId: 'match-123',
        processedAt: new Date('2023-01-01T12:00:00Z')
      };

      mockProcessedMatch.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(mockMatch)
        })
      } as any);

      // Act
      const result = await repository.getLastProcessedMatch();

      // Assert
      expect(result).toEqual({
        matchId: 'match-123',
        processedAt: new Date('2023-01-01T12:00:00Z')
      });
      expect(mockProcessedMatch.findOne().sort).toHaveBeenCalledWith({ processedAt: -1 });
    });
  });
}); 