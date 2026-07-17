import {
  DAMAGE_CAUSER_NAME,
  GAME_MODES,
  type LogPlayerKillV2,
  type LogPlayerMakeGroggy,
  type LogPlayerRevive,
  MAP_NAMES,
  type PubgClient,
  type TelemetryEvent,
} from '@j03fr0st/pubg-ts';
import { EmbedBuilder } from 'discord.js';
import type { TelemetryRepository } from '../data/repositories/telemetry.repository';
import type {
  AssistInfo,
  KillChain,
  MatchAnalysis,
  PlayerAnalysis,
} from '../types/analytics-results.types';
import type { CoachingNarration } from '../types/coaching.types';
import type {
  MatchParticipantStats,
  MatchSummary,
  MatchSummaryParticipant,
} from '../types/match.types';
import { DamageInfoUtils } from '../utils/damage-info.util';
import { debug, error, warn } from '../utils/logger';
import { MatchColorUtil } from '../utils/match-colors.util';
import {
  calculateLobbyDifficulty,
  calculateOpponentDifficulty,
  isBotAccountId,
  type LobbyDifficultyResult,
  type OpponentDifficultyResult,
} from '../utils/match-difficulty.util';
import type { CoachingPipelineService } from './coaching-pipeline.service';
import type { PlayerStatsService } from './player-stats.service';
import type { TelemetryProcessorService } from './telemetry-processor.service';

export interface MatchPresentationDependencies {
  pubgClient: PubgClient;
  telemetryRepository: TelemetryRepository;
  telemetryProcessor: TelemetryProcessorService;
  playerStatsService: PlayerStatsService;
  coachingPipeline: CoachingPipelineService;
}

export class MatchPresentationService {
  public constructor(private readonly deps: MatchPresentationDependencies) {}

  public async createEmbeds(summary: MatchSummary): Promise<EmbedBuilder[]> {
    const { mapName, gameMode, playedAt, rosterParticipants, matchId } = summary;
    const teamRankText = summary.teamRank ? `#${summary.teamRank}` : 'N/A';
    const matchColor = MatchColorUtil.generateMatchColor(matchId);
    const dateString = playedAt
      .toLocaleTimeString('en-ZA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Africa/Johannesburg',
      })
      .replace(',', '');
    const totalDamage = rosterParticipants.reduce(
      (acc, participant) => acc + participant.stats.damageDealt,
      0
    );
    const totalKills = rosterParticipants.reduce(
      (acc, participant) => acc + participant.stats.kills,
      0
    );
    const totalDBNOs = rosterParticipants.reduce(
      (acc, participant) => acc + participant.stats.DBNOs,
      0
    );
    const mainDescriptionLines = [
      `⏰ **${dateString}**`,
      `🗺️ **${this.formatMapName(mapName)}** • ${this.formatGameMode(gameMode)}`,
      '',
      '**Team Performance**',
      `🏆 Placement: **${teamRankText}**`,
      `👥 Squad Size: **${rosterParticipants.length} players**`,
      '',
      '**Combat Summary**',
      `⚔️ Total Kills: **${totalKills}**`,
      `🔻 Total Knocks: **${totalDBNOs}**`,
      `💥 Total Damage: **${Math.round(totalDamage)}**`,
    ];
    const mainEmbed = new EmbedBuilder()
      .setTitle('🎮 PUBG Match Summary')
      .setDescription(mainDescriptionLines.join('\n'))
      .setColor(matchColor)
      .setFooter({ text: `PUBG Match Tracker - ${matchId}` })
      .setTimestamp(playedAt);

    if (!summary.telemetryUrl) {
      debug('No telemetry URL available, using basic player embeds');
      return [mainEmbed, ...this.createBasicPlayerEmbeds(rosterParticipants, matchColor, matchId)];
    }

    try {
      const enhancedMainEmbed = new EmbedBuilder(mainEmbed.toJSON());
      const enhancedDescriptionLines = [...mainDescriptionLines];
      const { matchAnalysis, rawEvents } = await this.loadAnalysis(summary);
      let seasonStats = await this.applyOpponentDifficulty(
        enhancedMainEmbed,
        enhancedDescriptionLines,
        matchAnalysis,
        summary.monitoredPlayers,
        gameMode
      );
      seasonStats = await this.applyLobbyDifficulty(
        enhancedMainEmbed,
        enhancedDescriptionLines,
        summary.matchId,
        summary.lobbyParticipants,
        gameMode,
        seasonStats
      );
      const participantStats = this.buildParticipantStatsMap(summary.lobbyParticipants);
      const monitoredPubgIds = new Set(
        summary.monitoredPlayers.map((participant) => participant.pubgId)
      );
      const playerEmbeds = rosterParticipants.map((participant) => {
        const analysis = monitoredPubgIds.has(participant.pubgId)
          ? matchAnalysis.playerAnalyses.get(participant.pubgId)
          : undefined;
        return analysis
          ? this.createEnhancedPlayerEmbed(
              participant,
              analysis,
              matchColor,
              matchId,
              participantStats,
              seasonStats
            )
          : this.createBasicPlayerEmbed(participant, matchColor, matchId);
      });
      const coachingEmbeds = await this.createCoachingEmbeds(
        matchAnalysis,
        summary.monitoredPlayers,
        rawEvents,
        matchColor
      );
      return [enhancedMainEmbed, ...playerEmbeds, ...coachingEmbeds];
    } catch (err) {
      error(`Telemetry processing failed: ${(err as Error).message}`);
      return [mainEmbed, ...this.createBasicPlayerEmbeds(rosterParticipants, matchColor, matchId)];
    }
  }

  private async loadAnalysis(summary: MatchSummary): Promise<{
    matchAnalysis: MatchAnalysis;
    rawEvents: TelemetryEvent[];
  }> {
    let cached: Awaited<ReturnType<TelemetryRepository['getTelemetry']>>;
    try {
      cached = await this.deps.telemetryRepository.getTelemetry(summary.matchId);
    } catch (err) {
      warn(`Failed to read telemetry cache for ${summary.matchId}: ${err}`);
      cached = { kind: 'miss' };
    }
    let rawEvents: TelemetryEvent[];
    if (cached.kind === 'hit') {
      const hasAllMonitoredPlayers = summary.monitoredPlayers.every((player) =>
        cached.matchAnalysis.playerAnalyses.has(player.pubgId)
      );
      if (hasAllMonitoredPlayers) {
        return { matchAnalysis: cached.matchAnalysis, rawEvents: cached.rawEvents };
      }
      rawEvents = cached.rawEvents;
    } else {
      if (cached.kind === 'corrupt') {
        warn(`Ignoring corrupt telemetry cache for ${summary.matchId}: ${cached.reason}`);
      }
      rawEvents = await this.deps.pubgClient.matches.getTelemetry(summary.matchId);
    }

    const matchAnalysis = await this.deps.telemetryProcessor.processMatchTelemetry(
      rawEvents,
      summary.matchId,
      summary.playedAt,
      summary.monitoredPlayers
    );
    this.deps.telemetryRepository
      .saveTelemetry(rawEvents, matchAnalysis)
      .catch((err) => debug(`Failed to cache telemetry for ${summary.matchId}: ${err}`));
    return { matchAnalysis, rawEvents };
  }

  private formatMapName(mapCode: string): string {
    return MAP_NAMES?.[mapCode] || this.deps.pubgClient.assets.getMapName(mapCode) || mapCode;
  }

  private formatGameMode(gameModeCode: string): string {
    return (
      GAME_MODES?.[gameModeCode] ||
      this.deps.pubgClient.assets.getGameModeName(gameModeCode) ||
      gameModeCode
    );
  }

  private createBasicPlayerEmbeds(
    players: MatchSummaryParticipant[],
    matchColor: number,
    matchId: string
  ): EmbedBuilder[] {
    return players.map((player) => this.createBasicPlayerEmbed(player, matchColor, matchId));
  }

  private createBasicPlayerEmbed(
    player: MatchSummaryParticipant,
    matchColor: number,
    matchId: string
  ): EmbedBuilder {
    const { stats } = player;
    const survivalMinutes = Math.round(stats.timeSurvived / 60);
    const kmWalked = (stats.walkDistance / 1000).toFixed(1);
    const accuracy =
      stats.kills > 0 && stats.headshotKills > 0
        ? ((stats.headshotKills / stats.kills) * 100).toFixed(1)
        : '0';
    const basicStats = [
      `⚔️ Kills: ${stats.kills} (${stats.headshotKills} headshots)`,
      `🔻 Knocks: ${stats.DBNOs}`,
      `💥 Damage: ${Math.round(stats.damageDealt)} (${stats.assists} assists)`,
      `🎯 Headshot %: ${accuracy}%`,
      `⏰ Survival: ${survivalMinutes}min`,
      `📏 Longest Kill: ${Math.round(stats.longestKill)}m`,
      `👣 Distance: ${kmWalked}km`,
      stats.revives > 0 ? `🚑 Revives: ${stats.revives}` : '',
      `🎯 [2D Replay](https://pubg.sh/${player.name}/steam/${matchId})`,
    ]
      .filter(Boolean)
      .join('\n');

    return new EmbedBuilder()
      .setTitle(`Player: ${player.name}`)
      .setDescription(basicStats)
      .setColor(matchColor);
  }

  private createEnhancedPlayerEmbed(
    player: MatchSummaryParticipant,
    analysis: PlayerAnalysis,
    matchColor: number,
    matchId: string,
    participantStats: Map<
      string,
      Pick<MatchParticipantStats, 'kills' | 'damageDealt' | 'winPlace'>
    >,
    seasonStats?: Map<string, { kd: number; adr: number }>
  ): EmbedBuilder {
    const description = this.formatEnhancedStats(
      player,
      analysis,
      matchId,
      participantStats,
      seasonStats
    );

    return new EmbedBuilder()
      .setTitle(`Player: ${player.name}`)
      .setDescription(description)
      .setColor(matchColor);
  }

  private buildParticipantStatsMap(
    lobbyParticipants: MatchSummaryParticipant[]
  ): Map<string, Pick<MatchParticipantStats, 'kills' | 'damageDealt' | 'winPlace'>> {
    return new Map(
      lobbyParticipants.map((player) => [
        player.pubgId,
        {
          kills: player.stats.kills,
          damageDealt: player.stats.damageDealt,
          winPlace: player.stats.winPlace,
        },
      ])
    );
  }

  private formatEnhancedStats(
    player: MatchSummaryParticipant,
    analysis: PlayerAnalysis,
    matchId: string,
    participantStats: Map<
      string,
      Pick<MatchParticipantStats, 'kills' | 'damageDealt' | 'winPlace'>
    >,
    seasonStats?: Map<string, { kd: number; adr: number }>
  ): string {
    const { stats } = player;
    const leadingSections = [
      this.formatCombatStats(stats, analysis),
      this.formatKillChains(analysis.killChains),
      this.formatAssists(analysis.calculatedAssists),
    ].filter(Boolean);
    const trailingSections = [
      `⏰ Survival: ${Math.round(stats.timeSurvived / 60)}min • ${(stats.walkDistance / 1000).toFixed(1)}km`,
      `🎯 [2D Replay](https://pubg.sh/${player.name}/steam/${matchId})`,
    ];
    const fixedDescription = [...leadingSections, ...trailingSections].join('\n\n');
    const timelineBudget = 4096 - fixedDescription.length - 2;
    const timeline = this.fitTimelineToBudget(
      this.formatEnhancedTimeline(analysis, participantStats, seasonStats),
      timelineBudget
    );
    return [...leadingSections, timeline, ...trailingSections].filter(Boolean).join('\n\n');
  }

  private fitTimelineToBudget(timeline: string, budget: number): string {
    if (!timeline || budget <= 0) return '';
    if (timeline.length <= budget) return timeline;

    const [heading, ...eventLines] = timeline.split('\n');
    if (heading.length > budget) return '';

    const includedLines = [heading];
    for (const eventLine of eventLines) {
      const candidate = [...includedLines, eventLine, '…'].join('\n');
      if (candidate.length > budget) break;
      includedLines.push(eventLine);
    }

    if (includedLines.length <= eventLines.length) {
      includedLines.push('…');
    }
    return includedLines.join('\n');
  }

  private formatCombatStats(stats: MatchParticipantStats, analysis: PlayerAnalysis): string {
    return [
      '⚔️ **COMBAT STATS**',
      `🎯 Kills: **${stats.kills}** (${stats.headshotKills} HS)`,
      `💀 K/D Ratio: **${analysis.kdRatio.toFixed(2)}**`,
      `💥 Damage Dealt: **${analysis.totalDamageDealt.toFixed(0)}**`,
      `🩸 Damage Taken: **${analysis.totalDamageTaken.toFixed(0)}**`,
    ].join('\n');
  }

  private formatKillChains(chains: KillChain[]): string {
    if (!chains.length) return '';
    const bestChain = chains.reduce((best, current) =>
      current.kills.length > best.kills.length ? current : best
    );
    const multiKills = chains.reduce(
      (counts, chain) => {
        const killCount = chain.kills.length;
        if (killCount === 2) counts.doubles++;
        else if (killCount === 3) counts.triples++;
        else if (killCount >= 4) counts.quads++;
        return counts;
      },
      { doubles: 0, triples: 0, quads: 0 }
    );
    const elements: string[] = [];
    if (bestChain.kills.length >= 2) {
      elements.push(
        `🔥 Best: **${bestChain.kills.length} kills** (${bestChain.duration.toFixed(1)}s)`
      );
    }
    if (multiKills.doubles) elements.push(`⚡ Doubles: **${multiKills.doubles}**`);
    if (multiKills.triples) elements.push(`💫 Triples: **${multiKills.triples}**`);
    if (multiKills.quads) elements.push(`🌟 Quads+: **${multiKills.quads}**`);
    return elements.length > 0 ? `**KILL CHAINS**\n${elements.join(' • ')}` : '';
  }

  private formatAssists(assists: AssistInfo[]): string {
    if (!assists.length) return '';
    const assistTypes = assists.reduce(
      (counts, assist) => {
        counts[assist.assistType]++;
        return counts;
      },
      { damage: 0, knockdown: 0, both: 0 }
    );
    const elements = [`🤝 Total: **${assists.length}**`];
    if (assistTypes.damage) elements.push(`💥 Damage: **${assistTypes.damage}**`);
    if (assistTypes.knockdown) elements.push(`🔻 Knockdown: **${assistTypes.knockdown}**`);
    if (assistTypes.both) elements.push(`⭐ Combined: **${assistTypes.both}**`);
    return `**CALCULATED ASSISTS**\n${elements.join(' • ')}`;
  }

  private formatEnhancedTimeline(
    analysis: PlayerAnalysis,
    participantStats: Map<
      string,
      Pick<MatchParticipantStats, 'kills' | 'damageDealt' | 'winPlace'>
    >,
    seasonStats?: Map<string, { kd: number; adr: number }>
  ): string {
    const priorityEvents = [
      ...analysis.killEvents
        .filter((event) => event._D)
        .map((event) => ({
          type: 'kill',
          event,
          time: new Date(event._D!),
        })),
      ...analysis.knockdownEvents
        .filter((event) => event._D)
        .map((event) => ({
          type: 'knockdown',
          event,
          time: new Date(event._D!),
        })),
      ...analysis.deathEvents
        .filter((event) => event._D)
        .map((event) => ({
          type: 'death',
          event,
          time: new Date(event._D!),
        })),
      ...analysis.knockedDownEvents
        .filter((event) => event._D)
        .map((event) => ({
          type: 'knocked',
          event,
          time: new Date(event._D!),
        })),
      ...analysis.reviveEvents
        .filter((event) => event._D)
        .map((event) => ({
          type: 'revive',
          event,
          time: new Date(event._D!),
        })),
    ]
      .sort((left, right) => left.time.getTime() - right.time.getTime())
      .slice(0, 100);
    if (priorityEvents.length === 0) return '';

    const teamTag = (teamId?: number) => (teamId == null ? '' : ` [T${teamId}]`);
    const inlineStats = (accountId?: string) => {
      if (!accountId) return '';
      const match = participantStats.get(accountId);
      if (!match) return '';
      let text = ` — ${match.kills}K / ${Math.round(match.damageDealt)}dmg / #${match.winPlace}`;
      const season = seasonStats?.get(accountId);
      if (season) text += ` | ${season.kd} K/D, ${season.adr} ADR`;
      return text;
    };
    const timeline = priorityEvents.map(({ type, event }) => {
      const matchTime = this.formatMatchTime(event._D!, analysis.matchStartTime);
      if (type === 'kill') {
        const kill = event as LogPlayerKillV2;
        const victimName = kill.victim?.name || 'Unknown Player';
        const { weapon, distance } = this.describeKillDamage(
          kill.killerDamageInfo,
          kill.damageCauserName,
          kill.distance
        );
        return `\`${matchTime}\` ⚔️ Killed [${this.sanitizePlayerNameForDiscord(victimName)}](https://pubg.op.gg/user/${encodeURIComponent(victimName)})${teamTag(kill.victim?.teamId)} (${weapon}, ${distance}m)${inlineStats(kill.victim?.accountId)}`;
      }
      if (type === 'knockdown' || type === 'knocked') {
        const knock = event as LogPlayerMakeGroggy;
        const other = type === 'knockdown' ? knock.victim : knock.attacker;
        const otherName = other?.name || 'Unknown Player';
        const { weapon, distance } = this.describeDamage(
          knock.groggyDamage,
          knock.damageCauserName,
          knock.distance
        );
        const verb = type === 'knockdown' ? 'Knocked' : 'Knocked by';
        return `\`${matchTime}\` 🔻 ${verb} [${this.sanitizePlayerNameForDiscord(otherName)}](https://pubg.op.gg/user/${encodeURIComponent(otherName)})${teamTag(other?.teamId)} (${weapon}, ${distance}m)${inlineStats(other?.accountId)}`;
      }
      if (type === 'revive') {
        const revive = event as LogPlayerRevive;
        const victimName = revive.victim?.name || 'Unknown Player';
        return `\`${matchTime}\` 🚑 Revived [${this.sanitizePlayerNameForDiscord(victimName)}](https://pubg.op.gg/user/${encodeURIComponent(victimName)})`;
      }
      const death = event as LogPlayerKillV2;
      const killerName = death.killer?.name || 'Unknown Player';
      const { weapon, distance } = this.describeDamage(
        death.killerDamageInfo,
        death.damageCauserName,
        death.distance
      );
      return `\`${matchTime}\` ☠️ Killed by [${this.sanitizePlayerNameForDiscord(killerName)}](https://pubg.op.gg/user/${encodeURIComponent(killerName)})${teamTag(death.killer?.teamId)} (${weapon}, ${distance}m)${inlineStats(death.killer?.accountId)}`;
    });
    return `**TIMELINE**\n${timeline.join('\n')}`;
  }

  private describeDamage(
    damageInfo: Parameters<typeof DamageInfoUtils.getFirst>[0] | undefined,
    fallbackCauser?: string,
    fallbackDistance?: number
  ): { weapon: string; distance: number } {
    const primary = damageInfo ? DamageInfoUtils.getFirst(damageInfo) : null;
    if (primary?.damageCauserName) {
      return {
        weapon: this.getReadableDamageCauserName(primary.damageCauserName),
        distance:
          primary.distance && !Number.isNaN(primary.distance)
            ? Math.round(primary.distance / 100)
            : 0,
      };
    }
    return {
      weapon: fallbackCauser ? this.getReadableDamageCauserName(fallbackCauser) : 'Unknown Weapon',
      distance:
        fallbackDistance && !Number.isNaN(fallbackDistance)
          ? Math.round(fallbackDistance / 100)
          : 0,
    };
  }

  private describeKillDamage(
    damageInfo: Parameters<typeof DamageInfoUtils.getFirst>[0] | undefined,
    fallbackCauser?: string,
    fallbackDistance?: number
  ): { weapon: string; distance: number } {
    const primary = damageInfo ? DamageInfoUtils.getFirst(damageInfo) : null;
    const weaponCode = primary?.damageCauserName ?? fallbackCauser;
    const rawDistance = primary?.distance || fallbackDistance;
    return {
      weapon: weaponCode ? this.getReadableDamageCauserName(weaponCode) : 'Unknown Weapon',
      distance: rawDistance && !Number.isNaN(rawDistance) ? Math.round(rawDistance / 100) : 0,
    };
  }

  private getReadableDamageCauserName(weaponCode: string): string {
    const dictionaryName = DAMAGE_CAUSER_NAME?.[weaponCode];
    if (dictionaryName) return dictionaryName;
    const assetName = this.deps.pubgClient.assets.getDamageCauserName(weaponCode);
    if (assetName && assetName !== weaponCode) return assetName;
    const commonWeapons: Record<string, string> = {
      WeapMk12_C: 'Mk12',
      WeapMini14_C: 'Mini 14',
      WeapAK47_C: 'AKM',
      WeapM416_C: 'M416',
      WeapSCAR_C: 'SCAR-L',
      WeapM16A4_C: 'M16A4',
      WeapKar98k_C: 'Kar98k',
      WeapAWM_C: 'AWM',
      WeapM24_C: 'M24',
      WeapWin94_C: 'Winchester',
      WeapUMP_C: 'UMP45',
      WeapVector_C: 'Vector',
      WeapTommyGun_C: 'Tommy Gun',
      WeapP18C_C: 'P18C',
      WeapP92_C: 'P92',
      WeapP1911_C: 'P1911',
      WeapSawnoff_C: 'Sawed-off',
      WeapS12K_C: 'S12K',
      WeapS1897_C: 'S1897',
      WeapS686_C: 'S686',
      WeapDP27_C: 'DP-27',
      WeapM249_C: 'M249',
      WeapMG3_C: 'MG3',
    };
    const formatted = weaponCode
      .replace(/^Weap/, '')
      .replace(/_C$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
    return commonWeapons[weaponCode] ?? (formatted || 'Unknown Weapon');
  }

  private formatMatchTime(eventTime: string, matchStart: Date): string {
    const relativeSeconds = Math.round(
      (new Date(eventTime).getTime() - matchStart.getTime()) / 1000
    );
    const minutes = Math.floor(relativeSeconds / 60);
    const seconds = relativeSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private sanitizePlayerNameForDiscord(playerName: string): string {
    if (!playerName) return 'Unknown Player';
    return playerName
      .replace(/[[\]()]/g, '')
      .replace(/[*~`|]/g, '\\$&')
      .trim();
  }

  private async applyOpponentDifficulty(
    mainEmbed: EmbedBuilder,
    mainDescriptionLines: string[],
    matchAnalysis: MatchAnalysis,
    players: MatchSummaryParticipant[],
    gameMode: string
  ): Promise<Map<string, { kd: number; adr: number }> | undefined> {
    const opponentAccountIds = this.collectOpponentAccountIds(matchAnalysis, players);
    if (opponentAccountIds.length === 0) {
      return undefined;
    }

    let seasonStats: Map<string, { kd: number; adr: number }> | undefined;
    try {
      seasonStats = await this.deps.playerStatsService.getSeasonStats(opponentAccountIds, gameMode);
    } catch (err) {
      warn(`Opponent difficulty failed to fetch season stats: ${err}`);
    }

    if (seasonStats) {
      const difficulty = calculateOpponentDifficulty(opponentAccountIds, seasonStats);
      if (difficulty) {
        mainDescriptionLines.push(this.formatOpponentDifficulty(difficulty));
        mainEmbed.setDescription(mainDescriptionLines.join('\n'));
      }
    }
    return seasonStats;
  }

  private collectOpponentAccountIds(
    matchAnalysis: MatchAnalysis,
    monitoredPlayers: MatchSummaryParticipant[]
  ): string[] {
    const monitoredAccountIds = new Set(monitoredPlayers.map((participant) => participant.pubgId));
    const opponentAccountIds = new Set<string>();
    const addOpponent = (accountId?: string) => {
      if (!accountId || monitoredAccountIds.has(accountId) || isBotAccountId(accountId)) return;
      opponentAccountIds.add(accountId);
    };

    for (const player of monitoredPlayers) {
      const analysis = matchAnalysis.playerAnalyses.get(player.pubgId);
      if (!analysis) continue;
      for (const event of analysis.killEvents) addOpponent(event.victim?.accountId);
      for (const event of analysis.deathEvents) addOpponent(event.killer?.accountId);
      for (const event of analysis.knockdownEvents) addOpponent(event.victim?.accountId);
      for (const event of analysis.knockedDownEvents) addOpponent(event.attacker?.accountId);
    }

    return Array.from(opponentAccountIds);
  }

  private formatOpponentDifficulty(difficulty: OpponentDifficultyResult): string {
    const opponentWord = difficulty.opponentCount === 1 ? 'opponent' : 'opponents';
    return `⚔️ Opponent Difficulty: **${difficulty.label}** (${difficulty.score}/100, ${difficulty.opponentCount} ${opponentWord})`;
  }

  private async applyLobbyDifficulty(
    mainEmbed: EmbedBuilder,
    mainDescriptionLines: string[],
    matchId: string,
    lobbyParticipants: MatchSummaryParticipant[],
    gameMode: string,
    existingSeasonStats?: Map<string, { kd: number; adr: number }>
  ): Promise<Map<string, { kd: number; adr: number }> | undefined> {
    const lobbyAccountIds = Array.from(
      new Set(lobbyParticipants.map((player) => player.pubgId).filter(Boolean))
    );
    if (lobbyAccountIds.length === 0) {
      return existingSeasonStats;
    }

    const seasonStats = new Map(existingSeasonStats ?? []);
    const humanAccountIds = lobbyAccountIds.filter((id) => !isBotAccountId(id));
    const missingHumanAccountIds = humanAccountIds.filter((id) => !seasonStats.has(id));
    if (missingHumanAccountIds.length > 0) {
      try {
        const fetchedStats = await this.deps.playerStatsService.getSeasonStats(
          missingHumanAccountIds,
          gameMode
        );
        for (const [accountId, stats] of fetchedStats) {
          seasonStats.set(accountId, stats);
        }
      } catch (err) {
        warn(`Lobby difficulty failed to fetch season stats: ${err}`);
      }
    }

    const difficulty = calculateLobbyDifficulty(lobbyAccountIds, seasonStats);
    if (!difficulty) {
      return seasonStats;
    }
    this.upsertMainDescriptionLine(
      mainDescriptionLines,
      'Lobby Difficulty:',
      this.formatLobbyDifficulty(difficulty),
      'Opponent Difficulty:'
    );
    mainEmbed.setDescription(mainDescriptionLines.join('\n'));
    debug('Lobby difficulty rendered', { matchId, score: difficulty.score });
    return seasonStats;
  }

  private upsertMainDescriptionLine(
    mainDescriptionLines: string[],
    prefix: string,
    line: string,
    beforePrefix?: string
  ): void {
    const existingLineIndex = mainDescriptionLines.findIndex((existing) =>
      existing.includes(prefix)
    );
    if (existingLineIndex >= 0) {
      mainDescriptionLines[existingLineIndex] = line;
      return;
    }
    if (beforePrefix) {
      const beforeIndex = mainDescriptionLines.findIndex((existing) =>
        existing.includes(beforePrefix)
      );
      if (beforeIndex >= 0) {
        mainDescriptionLines.splice(beforeIndex, 0, line);
        return;
      }
    }
    mainDescriptionLines.push(line);
  }

  private formatLobbyDifficulty(difficulty: LobbyDifficultyResult): string {
    const playerWord = difficulty.playerCount === 1 ? 'player' : 'players';
    const humanWord = difficulty.humanCount === 1 ? 'human' : 'humans';
    const botWord = difficulty.botCount === 1 ? 'bot' : 'bots';
    return `🏟️ Lobby Difficulty: **${difficulty.label}** (${difficulty.score}/100, ${difficulty.playerCount} ${playerWord}: ${difficulty.humanCount} ${humanWord}, ${difficulty.botCount} ${botWord})`;
  }

  private async createCoachingEmbeds(
    matchAnalysis: MatchAnalysis,
    monitoredPlayers: readonly MatchSummaryParticipant[],
    rawEvents: readonly TelemetryEvent[],
    matchColor: number
  ): Promise<EmbedBuilder[]> {
    try {
      const result = await this.deps.coachingPipeline.run({
        matchAnalysis,
        monitoredPlayers,
        telemetryEvents: rawEvents,
      });
      if (result.kind === 'empty') {
        return [];
      }
      if (result.kind === 'failed') {
        error(`Coaching pipeline failed at ${result.stage}: ${result.reason}`);
        return [];
      }
      return this.buildCoachingEmbeds(result.narration, matchColor);
    } catch (err) {
      error(`Coaching pipeline failed: ${err}`);
      return [];
    }
  }

  private buildCoachingEmbeds(narration: CoachingNarration, matchColor: number): EmbedBuilder[] {
    if (narration.sections.length === 0) {
      return [];
    }

    const maxDescriptionLength = 3900;
    const sectionBlocks = narration.sections
      .map((section) => {
        const title = section.title
          ? `${section.playerName} - ${section.title}`
          : section.playerName;
        return [`**${title}**`, ...section.lines].join('\n');
      })
      .filter((section) => section.trim().length > 0);
    const descriptions: string[] = [];
    let currentDescription = '';

    for (const sectionBlock of sectionBlocks) {
      const nextDescription = currentDescription
        ? `${currentDescription}\n\n${sectionBlock}`
        : sectionBlock;
      if (nextDescription.length <= maxDescriptionLength) {
        currentDescription = nextDescription;
        continue;
      }
      if (currentDescription) {
        descriptions.push(currentDescription);
      }
      currentDescription =
        sectionBlock.length <= maxDescriptionLength
          ? sectionBlock
          : `${sectionBlock.slice(0, maxDescriptionLength - 3)}...`;
    }
    if (currentDescription) {
      descriptions.push(currentDescription);
    }

    return descriptions.map((description, index) =>
      new EmbedBuilder()
        .setTitle(index === 0 ? 'Coaching' : `Coaching (${index + 1})`)
        .setDescription(description)
        .setColor(matchColor)
    );
  }
}
