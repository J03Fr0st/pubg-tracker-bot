import type { Player as PlayerData } from '@j03fr0st/pubg-ts';
import { type IPlayer, Player } from '../models/player.model';

export class PlayerRepository {
  /**
   * Saves or updates a player in the database
   */
  public async savePlayer(playerData: PlayerData): Promise<IPlayer> {
    const player = await Player.findOneAndUpdate(
      { pubgId: playerData.id },
      {
        pubgId: playerData.id,
        name: playerData.attributes.name,
        shardId: playerData.attributes.shardId,
        createdAt: new Date(playerData.attributes.createdAt),
        updatedAt: new Date(playerData.attributes.updatedAt),
        patchVersion: playerData.attributes.patchVersion,
        titleId: playerData.attributes.titleId,
        matches: playerData.relationships.matches.data.map((match) => match.id),
      },
      { upsert: true, new: true }
    );
    return player;
  }

  public async removePlayer(playerName: string): Promise<void> {
    await Player.deleteOne({ name: playerName });
  }

  public async updatePlayerLastMatch(playerName: string, matchId: string): Promise<void> {
    await Player.updateOne({ name: playerName }, { $set: { lastMatchId: matchId } });
  }

  public async findPlayerByPubgId(pubgId: string): Promise<IPlayer | null> {
    return Player.findOne({ pubgId });
  }

  public async getAllPlayers(): Promise<IPlayer[]> {
    return Player.find();
  }
}
