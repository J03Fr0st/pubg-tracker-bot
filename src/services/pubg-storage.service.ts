import { IPlayer, Player } from '../data/models/player.model';
import { IMatch, Match } from '../data/models/match.model';
import { MatchRepository } from '../data/repositories/match.repository';
import { PlayerRepository } from '../data/repositories/player.repository';
import { ProcessedMatchRepository } from '../data/repositories/processed-match.repository';

export class PubgStorageService {
  private matchRepository = new MatchRepository();
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


  //#region Match
  public async saveMatch(matchesResponse: MatchesResponse): Promise<IMatch | null> {
    return this.matchRepository.saveMatch(matchesResponse);
  }  

  public async getPlayerMatches(pubgId: string): Promise<IMatch[]> {
    return this.matchRepository.getPlayerMatches(pubgId);
  }

  //#endregion

  //#region Processed Match
  public async getProcessedMatches(): Promise<string[]> {
    return this.processedMatchRepository.getProcessedMatches();
  }

  public async addProcessedMatch(matchId: string): Promise<void> {
    await this.processedMatchRepository.addProcessedMatch(matchId);
  }
  //#endregion
} 