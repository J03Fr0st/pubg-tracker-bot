import type { Player as PlayerData } from '@j03fr0st/pubg-ts';
import type { Player } from '../generated/prisma/client';
import { PlayerRepository } from '../data/repositories/player.repository';
import { ProcessedMatchRepository } from '../data/repositories/processed-match.repository';
import { MatchRepository } from '../data/repositories/match.repository';
import { TelemetryRepository } from '../data/repositories/telemetry.repository';

export class PubgStorageService {
  private playerRepository = new PlayerRepository();
  private processedMatchRepository = new ProcessedMatchRepository();
  private matchRepository = new MatchRepository();
  private telemetryRepository = new TelemetryRepository();

  //#region Player
  public async addPlayer(playerData: PlayerData): Promise<Player> {
    return this.playerRepository.savePlayer(playerData);
  }

  public async removePlayer(playerName: string): Promise<void> {
    await this.playerRepository.removePlayer(playerName);
  }

  public async getAllPlayers(): Promise<Player[]> {
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

  //#region Match

  public async saveMatch(matchDetails: any): Promise<void> {
    await this.matchRepository.saveMatch(matchDetails);
  }

  public async getMatch(matchId: string) {
    return this.matchRepository.findMatch(matchId);
  }

  //#endregion

  //#region Telemetry

  public async saveTelemetry(
    matchId: string,
    rawEvents: unknown[],
    playerAnalyses: Record<string, unknown>
  ): Promise<void> {
    await this.telemetryRepository.saveTelemetry(matchId, rawEvents, playerAnalyses);
  }

  public async getCachedTelemetryAnalyses(
    matchId: string
  ): Promise<Record<string, unknown> | null> {
    return this.telemetryRepository.getCachedAnalyses(matchId);
  }

  //#endregion
}
