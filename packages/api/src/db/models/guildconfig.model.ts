import mongoose, { type Document, type Model } from 'mongoose';

export interface GuildConfigDocument extends Document {
  guildId: string;
  teacherRoleId: string | null;
  levelRoleIds: Record<string, string>;
  levelupChannelId: string | null;
}

const guildConfigSchema = new mongoose.Schema<GuildConfigDocument>(
  {
    guildId: { type: String, required: true, unique: true },
    teacherRoleId: { type: String, default: null },
    // Plain object (level -> role ID) instead of a Mongoose Map so toJSON
    // needs no flattening; shape is enforced by route-level zod validation.
    levelRoleIds: { type: mongoose.Schema.Types.Mixed, default: {} },
    levelupChannelId: { type: String, default: null },
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>): Record<string, unknown> {
        ret['id'] = (ret['_id'] as mongoose.Types.ObjectId).toString();
        delete ret['_id'];
        delete ret['__v'];
        delete ret['createdAt'];
        delete ret['updatedAt'];
        return ret;
      },
    },
  },
);

export const GuildConfigModel: Model<GuildConfigDocument> = mongoose.model<GuildConfigDocument>(
  'GuildConfig',
  guildConfigSchema,
);
