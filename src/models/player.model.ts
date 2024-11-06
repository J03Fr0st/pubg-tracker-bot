import { Schema, model, Document } from 'mongoose';

export interface IPlayer extends Document {
  pubgId: string;
  name: string;
  shardId: string;
  createdAt: Date;
  updatedAt: Date;
  patchVersion: string;
  titleId: string;
  lastMatchAt?: Date;
  matches: string[]; // Array of match IDs
}

const PlayerSchema = new Schema<IPlayer>({
  pubgId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  shardId: { type: String, required: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
  patchVersion: { type: String, required: true },
  titleId: { type: String, required: true },
  lastMatchAt: { type: Date },
  matches: [{ type: String }]
}, {
  timestamps: true // This will add createdAt and updatedAt fields
});

export const Player = model<IPlayer>('Player', PlayerSchema); 