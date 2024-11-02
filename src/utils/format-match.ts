import { EmbedBuilder } from 'discord.js';
import { Match } from '../models/match';

export function formatMatchEmbed(match: Match, playerName: string): EmbedBuilder {
  const playerStats = match.players[playerName];
  
  return new EmbedBuilder()
    .setTitle(`Match Results - ${match.gameMode}`)
    .setDescription(`Map: ${match.mapName}`)
    .addFields([
      { name: 'Player', value: playerName, inline: true },
      { name: 'Position', value: `#${playerStats.winPlace}`, inline: true },
      { name: 'Kills', value: playerStats.kills.toString(), inline: true },
      { name: 'Damage Dealt', value: playerStats.damageDealt.toFixed(0), inline: true },
      { name: 'Time Survived', value: formatTime(playerStats.timeSurvived), inline: true },
      { name: 'Match ID', value: match.id, inline: false }
    ])
    .setTimestamp(new Date(match.createdAt))
    .setColor(getPlacementColor(playerStats.winPlace));
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getPlacementColor(place: number): number {
  if (place === 1) return 0xFFD700; // Gold
  if (place <= 5) return 0xC0C0C0; // Silver
  if (place <= 10) return 0xCD7F32; // Bronze
  return 0x808080; // Gray
} 