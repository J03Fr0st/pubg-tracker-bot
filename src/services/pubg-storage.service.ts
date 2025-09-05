import type { Player as PlayerData } from '@j03fr0st/pubg-ts';
import type { IPlayer } from '../data/models/player.model';
import { PlayerRepository } from '../data/repositories/player.repository';
import { ProcessedMatchRepository } from '../data/repositories/processed-match.repository';

export class PubgStorageService {
  private playerRepository = new PlayerRepository();
  private processedMatchRepository = new ProcessedMatchRepository();

  //#region Player
  public async addPlayer(playerData: PlayerData): Promise<IPlayer> {
    return this.playerRepository.savePlayer(playerData);
  }

  public async removePlayer(playerName: string): Promise<void> {
    await this.playerRepository.removePlayer(playerName);
  }

  public async getAllPlayers(): Promise<IPlayer[]> {
    return this.playerRepository.getAllPlayers();
  }

  public async updatePlayerLastMatch(playerName: string, matchId: string): Promise<void> {
    await this.playerRepository.updatePlayerLastMatch(playerName, matchId);
  }

  //#endregion

  //#region Processed Match
  public async getProcessedMatches(): Promise<string[]> {
    return this.processedMatchRepository.getProcessedMatches();
  }

  public async addProcessedMatch(matchId: string): Promise<void> {
    await this.processedMatchRepository.addProcessedMatch(matchId);
  }

  public async removeProcessedMatch(matchId: string): Promise<boolean> {
    return this.processedMatchRepository.removeProcessedMatch(matchId);
  }

  public async removeLastProcessedMatch(): Promise<string | null> {
    return this.processedMatchRepository.removeLastProcessedMatch();
  }

  public async getLastProcessedMatch(): Promise<{ matchId: string; processedAt: Date } | null> {
    return this.processedMatchRepository.getLastProcessedMatch();
  }
  //#endregion
}
