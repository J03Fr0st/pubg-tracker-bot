import type { Player as PlayerData } from '@j03fr0st/pubg-ts';
import type { PrismaClient } from '../../../generated/prisma/client';
import defaultPrisma from '../prisma.client';

export class PlayerRepository {
  public constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  public async savePlayer(playerData: PlayerData) {
    return this.prisma.player.upsert({
      where: { pubgId: playerData.id },
      update: {
        name: playerData.attributes.name,
        shardId: playerData.attributes.shardId,
        updatedAt: playerData.attributes.updatedAt
          ? new Date(playerData.attributes.updatedAt)
          : new Date(),
        patchVersion: playerData.attributes.patchVersion,
        titleId: playerData.attributes.titleId,
      },
      create: {
        pubgId: playerData.id,
        name: playerData.attributes.name,
        shardId: playerData.attributes.shardId,
        createdAt: playerData.attributes.createdAt
          ? new Date(playerData.attributes.createdAt)
          : new Date(),
        updatedAt: playerData.attributes.updatedAt
          ? new Date(playerData.attributes.updatedAt)
          : new Date(),
        patchVersion: playerData.attributes.patchVersion,
        titleId: playerData.attributes.titleId,
      },
    });
  }

  public async removePlayer(playerName: string): Promise<void> {
    await this.prisma.player.delete({ where: { name: playerName } });
  }

  public async updatePlayerLastMatch(playerName: string, _matchId: string): Promise<void> {
    await this.prisma.player.update({
      where: { name: playerName },
      data: { lastMatchAt: new Date() },
    });
  }

  public async getAllPlayers() {
    return this.prisma.player.findMany();
  }
}
