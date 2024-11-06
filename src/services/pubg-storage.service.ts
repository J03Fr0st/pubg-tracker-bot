import { Player, IPlayer } from '../models/player.model';
import { Match, IMatch } from '../models/match.model';
export class PubgStorageService {
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
        matches: playerData.relationships.matches.data.map((match: MatchReference) => match.id)
      },
      { upsert: true, new: true }
    );
    return player;
  }

  /**
   * Saves a match in the database if it doesn't exist
   */
  public async saveMatch(matchData: MatchData, participants: Participant[]): Promise<IMatch | null> {
    // Check if match already exists
    const existingMatch = await Match.findOne({ matchId: matchData.id });
    if (existingMatch) {
      return null;
    }

    const match = new Match({
      matchId: matchData.id,
      gameMode: matchData.attributes.gameMode,
      mapName: matchData.attributes.mapName,
      duration: matchData.attributes.duration,
      createdAt: new Date(matchData.attributes.createdAt),
      isCustomMatch: matchData.attributes.isCustomMatch,
      seasonState: matchData.attributes.seasonState,
      shardId: matchData.attributes.shardId,
      participants: participants.map(participant => ({
        pubgId: participant.id,
        name: participant.attributes.stats.name,
        stats: {
          DBNOs: participant.attributes.stats.DBNOs,
          assists: participant.attributes.stats.assists,
          boosts: participant.attributes.stats.boosts,
          damageDealt: participant.attributes.stats.damageDealt,
          deathType: participant.attributes.stats.deathType,
          headshotKills: participant.attributes.stats.headshotKills,
          heals: participant.attributes.stats.heals,
          killPlace: participant.attributes.stats.killPlace,
          killStreaks: participant.attributes.stats.killStreaks,
          kills: participant.attributes.stats.kills,
          longestKill: participant.attributes.stats.longestKill,
          name: participant.attributes.stats.name,
          revives: participant.attributes.stats.revives,
          rideDistance: participant.attributes.stats.rideDistance,
          roadKills: participant.attributes.stats.roadKills,
          swimDistance: participant.attributes.stats.swimDistance,
          teamKills: participant.attributes.stats.teamKills,
          timeSurvived: participant.attributes.stats.timeSurvived,
          vehicleDestroys: participant.attributes.stats.vehicleDestroys,
          walkDistance: participant.attributes.stats.walkDistance,
          weaponsAcquired: participant.attributes.stats.weaponsAcquired,
          winPlace: participant.attributes.stats.winPlace
        }
      }))
    });

    return match.save();
  }

  /**
   * Gets a player's matches from the database
   */
  public async getPlayerMatches(pubgId: string): Promise<IMatch[]> {
    const player = await Player.findOne({ pubgId });
    if (!player) {
      return [];
    }

    return Match.find({
      'participants.pubgId': pubgId
    }).sort({ createdAt: -1 });
  }
} 