import { Schema, model, Document } from 'mongoose';

export interface IParticipantStats {
  DBNOs: number;
  assists: number;
  boosts: number;
  damageDealt: number;
  deathType: string;
  headshotKills: number;
  heals: number;
  killPlace: number;
  killStreaks: number;
  kills: number;
  longestKill: number;
  name: string;
  revives: number;
  rideDistance: number;
  roadKills: number;
  swimDistance: number;
  teamKills: number;
  timeSurvived: number;
  vehicleDestroys: number;
  walkDistance: number;
  weaponsAcquired: number;
  winPlace: number;
}

export interface IParticipant {
  pubgId: string;
  name: string;
  stats: IParticipantStats;
}

export interface IRoster {
  rosterId: string;
  teamId: string;
  rank: number;
  participantNames: string[];
}

export interface IMatch extends Document {
  matchId: string;
  gameMode: string;
  mapName: string;
  duration: number;
  createdAt: Date;
  isCustomMatch: boolean;
  seasonState: string;
  shardId: string;
  participants: IParticipant[];
  rosters: IRoster[];
}

const ParticipantStatsSchema = new Schema<IParticipantStats>({
  DBNOs: { type: Number, required: true },
  assists: { type: Number, required: true },
  boosts: { type: Number, required: true },
  damageDealt: { type: Number, required: true },
  deathType: { type: String, required: true },
  headshotKills: { type: Number, required: true },
  heals: { type: Number, required: true },
  killPlace: { type: Number, required: true },
  killStreaks: { type: Number, required: true },
  kills: { type: Number, required: true },
  longestKill: { type: Number, required: true },
  name: { type: String, required: true },
  revives: { type: Number, required: true },
  rideDistance: { type: Number, required: true },
  roadKills: { type: Number, required: true },
  swimDistance: { type: Number, required: true },
  teamKills: { type: Number, required: true },
  timeSurvived: { type: Number, required: true },
  vehicleDestroys: { type: Number, required: true },
  walkDistance: { type: Number, required: true },
  weaponsAcquired: { type: Number, required: true },
  winPlace: { type: Number, required: true }
});

const ParticipantSchema = new Schema<IParticipant>({
  pubgId: { type: String, required: true },
  name: { type: String, required: true },
  stats: { type: ParticipantStatsSchema, required: true }
});

const RosterSchema = new Schema<IRoster>({
  rosterId: { type: String, required: true },
  teamId: { type: String, required: true },
  rank: { type: Number, required: true },
  participantNames: [{ type: String, required: true }]
});

const MatchSchema = new Schema<IMatch>({
  matchId: { type: String, required: true, unique: true },
  gameMode: { type: String, required: true },
  mapName: { type: String, required: true },
  duration: { type: Number, required: true },
  createdAt: { type: Date, required: true },
  isCustomMatch: { type: Boolean, required: true },
  seasonState: { type: String, required: true },
  shardId: { type: String, required: true },
  participants: [ParticipantSchema],
  rosters: [RosterSchema]
}, {
  timestamps: true
});

export const Match = model<IMatch>('Match', MatchSchema); 