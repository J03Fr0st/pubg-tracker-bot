import { type Document, model, Schema } from 'mongoose';

/**
 * Interface representing a processed match document in MongoDB.
 */
export interface IProcessedMatch extends Document {
  matchId: string;
  processedAt: Date;
}

const ProcessedMatchSchema = new Schema<IProcessedMatch>(
  {
    matchId: { type: String, required: true, unique: true },
    processedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true, // This will add createdAt and updatedAt fields
  }
);

export const ProcessedMatch = model<IProcessedMatch>('ProcessedMatch', ProcessedMatchSchema);
