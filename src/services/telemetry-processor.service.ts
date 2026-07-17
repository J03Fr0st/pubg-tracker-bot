import {
  DAMAGE_CAUSER_NAME,
  DamageInfoUtils,
  type LogPlayerKillV2,
  type LogPlayerMakeGroggy,
  type LogPlayerRevive,
  type LogPlayerTakeDamage,
  type LogWeaponFireCount,
  type TelemetryEvent,
} from '@j03fr0st/pubg-ts';

import type {
  AssistInfo,
  KillChain,
  MatchAnalysis,
  PlayerAnalysis,
  WeaponStats,
} from '../types/analytics-results.types';
import type { MatchPlayerIdentity } from '../types/match.types';

export class TelemetryProcessorService {
  public async processMatchTelemetry(
    telemetryData: TelemetryEvent[],
    matchId: string,
    matchStartTime: Date,
    monitoredPlayers: readonly MatchPlayerIdentity[]
  ): Promise<MatchAnalysis> {
    const startTime = Date.now();
    const killEvents = telemetryData.filter(
      (event) => event._T === 'LogPlayerKillV2'
    ) as LogPlayerKillV2[];
    const knockdownEvents = telemetryData.filter(
      (event) => event._T === 'LogPlayerMakeGroggy'
    ) as LogPlayerMakeGroggy[];
    const damageEvents = telemetryData.filter(
      (event) => event._T === 'LogPlayerTakeDamage'
    ) as LogPlayerTakeDamage[];
    const reviveEvents = telemetryData.filter(
      (event) => event._T === 'LogPlayerRevive'
    ) as LogPlayerRevive[];
    const fireCountEvents = telemetryData.filter(
      (event) => event._T === 'LogWeaponFireCount'
    ) as LogWeaponFireCount[];
    const playerAnalyses = new Map<string, PlayerAnalysis>();

    for (const player of monitoredPlayers) {
      playerAnalyses.set(
        player.pubgId,
        this.analyzePlayer(
          player,
          killEvents,
          knockdownEvents,
          damageEvents,
          reviveEvents,
          fireCountEvents,
          matchStartTime
        )
      );
    }

    return {
      matchId,
      playerAnalyses,
      processingTimeMs: Date.now() - startTime,
      totalEventsProcessed: telemetryData.length,
    };
  }

  private analyzePlayer(
    player: MatchPlayerIdentity,
    allKills: LogPlayerKillV2[],
    allKnockdowns: LogPlayerMakeGroggy[],
    allDamage: LogPlayerTakeDamage[],
    allRevives: LogPlayerRevive[],
    allFireCounts: LogWeaponFireCount[],
    matchStartTime: Date
  ): PlayerAnalysis {
    const playerKills = allKills.filter((event) => event.killer?.accountId === player.pubgId);
    const playerKnockdowns = allKnockdowns.filter(
      (event) => event.attacker?.accountId === player.pubgId
    );
    const playerDamageDealt = allDamage.filter(
      (event) => event.attacker?.accountId === player.pubgId
    );
    const playerDamageTaken = allDamage.filter(
      (event) => event.victim?.accountId === player.pubgId
    );
    const playerRevives = allRevives.filter((event) => event.reviver?.accountId === player.pubgId);
    const playerFireCounts = allFireCounts.filter(
      (event) => event.character?.accountId === player.pubgId
    );
    const playerDeaths = allKills.filter((event) => event.victim?.accountId === player.pubgId);
    const playerKnockedDown = allKnockdowns.filter(
      (event) => event.victim?.accountId === player.pubgId
    );
    const weaponStats = this.calculateWeaponStats(
      playerKills,
      playerKnockdowns,
      playerDamageDealt,
      playerFireCounts
    );
    const killChains = this.analyzeKillChains(playerKills);
    const calculatedAssists = this.calculateAssists(player, allKills, allDamage, allKnockdowns);
    const totalDamageDealt = playerDamageDealt.reduce((sum, event) => sum + event.damage, 0);
    const totalDamageTaken = playerDamageTaken.reduce((sum, event) => sum + event.damage, 0);
    const kdRatio =
      playerDeaths.length > 0 ? playerKills.length / playerDeaths.length : playerKills.length;
    const validKillDistances = playerKills
      .map((event) => event.distance)
      .filter((distance) => distance != null && !Number.isNaN(distance) && distance > 0);
    const avgKillDistance =
      validKillDistances.length > 0
        ? validKillDistances.reduce((sum, distance) => sum + distance, 0) /
          validKillDistances.length /
          100
        : 0;
    const headshotKills = playerKills.filter((event) => event.damageReason === 'HeadShot').length;
    const headshotPercentage =
      playerKills.length > 0 ? (headshotKills / playerKills.length) * 100 : 0;

    return {
      pubgId: player.pubgId,
      playerName: player.name,
      matchStartTime,
      killEvents: playerKills,
      knockdownEvents: playerKnockdowns,
      damageEvents: playerDamageDealt,
      reviveEvents: playerRevives,
      deathEvents: playerDeaths,
      knockedDownEvents: playerKnockedDown,
      weaponStats,
      killChains,
      calculatedAssists,
      totalDamageDealt,
      totalDamageTaken,
      kdRatio,
      avgKillDistance,
      headshotPercentage,
      killsPerMinute: 0,
    };
  }

  /**
   * Calculates comprehensive weapon performance statistics from multiple telemetry event types.
   *
   * Combines data from kills, knockdowns, damage events, attacks, and fire counts to provide
   * detailed weapon analytics including accuracy, lethality, efficiency, and damage metrics.
   *
   * @param kills - Kill events performed by the player
   * @param knockdowns - Knockdown events performed by the player
   * @param damage - Damage events caused by the player
   * @param attacks - Attack events performed by the player
   * @param fireCounts - Weapon fire count events for the player
   * @returns Array of WeaponStats sorted by kill count (most kills first)
   */
  private calculateWeaponStats(
    kills: LogPlayerKillV2[],
    knockdowns: LogPlayerMakeGroggy[],
    damage: LogPlayerTakeDamage[],
    fireCounts: LogWeaponFireCount[]
  ): WeaponStats[] {
    const weaponMap = new Map<string, Partial<WeaponStats>>();

    // Process kills
    for (const kill of kills) {
      const weaponName = this.getReadableWeaponName(this.getKillDamageCauserName(kill));
      const stats = weaponMap.get(weaponName) || {
        weaponName,
        kills: 0,
        knockdowns: 0,
        damageDealt: 0,
        shotsFired: 0,
        hits: 0,
        longestKill: 0,
      };

      stats.kills = (stats.kills || 0) + 1;
      stats.longestKill = Math.max(stats.longestKill || 0, kill.distance / 100);

      weaponMap.set(weaponName, stats);
    }

    // Process knockdowns
    for (const knockdown of knockdowns) {
      const weaponName = this.getReadableWeaponName(knockdown.damageCauserName);
      const stats = weaponMap.get(weaponName) || {
        weaponName,
        kills: 0,
        knockdowns: 0,
        damageDealt: 0,
        shotsFired: 0,
        hits: 0,
        longestKill: 0,
      };

      stats.knockdowns = (stats.knockdowns || 0) + 1;

      weaponMap.set(weaponName, stats);
    }

    // Process damage events
    for (const dmg of damage) {
      const weaponName = this.getReadableWeaponName(dmg.damageCauserName);
      const stats = weaponMap.get(weaponName) || {
        weaponName,
        kills: 0,
        knockdowns: 0,
        damageDealt: 0,
        shotsFired: 0,
        hits: 0,
        longestKill: 0,
      };

      stats.damageDealt = (stats.damageDealt || 0) + dmg.damage;
      stats.hits = (stats.hits || 0) + 1;

      weaponMap.set(weaponName, stats);
    }

    // Process fire count events
    for (const fireCount of fireCounts) {
      if (fireCount.weaponId && fireCount.fireCount) {
        const weaponName = this.getReadableWeaponName(fireCount.weaponId);
        const stats = weaponMap.get(weaponName) || {
          weaponName,
          kills: 0,
          knockdowns: 0,
          damageDealt: 0,
          shotsFired: 0,
          hits: 0,
          longestKill: 0,
        };

        stats.shotsFired = (stats.shotsFired || 0) + fireCount.fireCount;

        weaponMap.set(weaponName, stats);
      }
    }

    // Calculate final metrics and convert to WeaponStats[]
    const weaponStats: WeaponStats[] = [];
    for (const [weaponName, stats] of weaponMap) {
      // Skip "Unknown Weapon" entries to avoid showing placeholder stats
      if (weaponName === 'Unknown Weapon') {
        continue;
      }

      const shots = stats.shotsFired || 0;
      const hits = stats.hits || 0;
      const kills = stats.kills || 0;

      weaponStats.push({
        weaponName,
        kills,
        knockdowns: stats.knockdowns || 0,
        damageDealt: stats.damageDealt || 0,
        shotsFired: shots,
        hits,
        longestKill: stats.longestKill || 0,
        averageDistance: 0, // Calculate from damage events
        accuracy: shots > 0 ? (hits / shots) * 100 : 0,
        lethality: hits > 0 ? (kills / hits) * 100 : 0,
        efficiency: shots > 0 ? (kills / shots) * 100 : 0,
      });
    }

    return weaponStats.sort((a, b) => b.kills - a.kills);
  }

  /**
   * Identifies and analyzes kill chains (multiple kills within a short time window).
   *
   * A kill chain is defined as 2 or more kills within 30 seconds of each other.
   * This method tracks consecutive kills and calculates timing statistics for each chain.
   *
   * @param kills - Array of kill events performed by the player, sorted chronologically
   * @returns Array of KillChain objects representing multi-kill sequences
   */
  private analyzeKillChains(kills: LogPlayerKillV2[]): KillChain[] {
    if (kills.length < 2) return [];

    const CHAIN_TIME_WINDOW = 30 * 1000; // 30 seconds
    const chains: KillChain[] = [];
    const sortedKills = [...kills].sort(
      (a, b) => new Date(a._D!).getTime() - new Date(b._D!).getTime()
    );

    let currentChain: LogPlayerKillV2[] = [];
    let chainStartTime: Date | null = null;

    for (let i = 0; i < sortedKills.length; i++) {
      const kill = sortedKills[i];
      const killTime = new Date(kill._D!);

      if (currentChain.length === 0) {
        currentChain = [kill];
        chainStartTime = killTime;
      } else {
        const timeSinceLastKill =
          killTime.getTime() - new Date(currentChain[currentChain.length - 1]._D!).getTime();

        if (timeSinceLastKill <= CHAIN_TIME_WINDOW) {
          currentChain.push(kill);
        } else {
          // End current chain if it has 2+ kills
          if (currentChain.length >= 2) {
            chains.push(this.createKillChain(currentChain, chainStartTime!));
          }
          currentChain = [kill];
          chainStartTime = killTime;
        }
      }
    }

    // Add final chain
    if (currentChain.length >= 2) {
      chains.push(this.createKillChain(currentChain, chainStartTime!));
    }

    return chains;
  }

  private createKillChain(kills: LogPlayerKillV2[], startTime: Date): KillChain {
    const endTime = new Date(kills[kills.length - 1]._D!);
    const duration = endTime.getTime() - startTime.getTime();
    const averageTimeBetweenKills = duration / (kills.length - 1);
    const weaponsUsed = [
      ...new Set(kills.map((k) => this.getReadableWeaponName(this.getKillDamageCauserName(k)))),
    ];

    return {
      startTime,
      kills, // Store the actual LogPlayerKillV2 events!
      duration: duration / 1000, // Convert to seconds
      weaponsUsed,
      averageTimeBetweenKills: averageTimeBetweenKills / 1000, // Convert to seconds
    };
  }

  private calculateAssists(
    player: MatchPlayerIdentity,
    allKills: LogPlayerKillV2[],
    allDamage: LogPlayerTakeDamage[],
    allKnockdowns: LogPlayerMakeGroggy[]
  ): AssistInfo[] {
    const assists: AssistInfo[] = [];
    const assistTimeWindowMs = 10_000;
    const minimumDamage = 20;

    for (const kill of allKills) {
      if (kill.killer?.accountId === player.pubgId) continue;
      const victimPubgId = kill.victim?.accountId;
      const victimName = kill.victim?.name;
      if (!victimPubgId || !victimName || !kill._D) continue;
      const killTime = new Date(kill._D).getTime();
      const playerDamageToVictim = allDamage.filter(
        (event) =>
          event.attacker?.accountId === player.pubgId &&
          event.victim?.accountId === victimPubgId &&
          Boolean(event._D) &&
          new Date(event._D!).getTime() < killTime &&
          killTime - new Date(event._D!).getTime() <= assistTimeWindowMs
      );
      const playerKnockdownsOfVictim = allKnockdowns.filter(
        (event) =>
          event.attacker?.accountId === player.pubgId &&
          event.victim?.accountId === victimPubgId &&
          Boolean(event._D) &&
          new Date(event._D!).getTime() < killTime &&
          killTime - new Date(event._D!).getTime() <= assistTimeWindowMs
      );
      const totalDamage = playerDamageToVictim.reduce((sum, event) => sum + event.damage, 0);
      const hasKnockdown = playerKnockdownsOfVictim.length > 0;
      if (totalDamage < minimumDamage && !hasKnockdown) continue;
      const allDamageToVictim = allDamage
        .filter(
          (event) =>
            event.victim?.accountId === victimPubgId &&
            Boolean(event._D) &&
            new Date(event._D!).getTime() < killTime
        )
        .reduce((sum, event) => sum + event.damage, 0);
      const assistType =
        totalDamage >= minimumDamage && hasKnockdown
          ? 'both'
          : hasKnockdown
            ? 'knockdown'
            : 'damage';
      const damageCauser =
        playerDamageToVictim[0]?.damageCauserName ?? playerKnockdownsOfVictim[0]?.damageCauserName;

      assists.push({
        assistingPlayer: player.name,
        killedPlayer: victimName,
        damageDealt: totalDamage,
        damagePercentage: allDamageToVictim > 0 ? (totalDamage / allDamageToVictim) * 100 : 0,
        assistType,
        weapon: damageCauser ? this.getReadableWeaponName(damageCauser) : 'Unknown',
      });
    }

    return assists;
  }

  /**
   * Converts internal weapon codes to human-readable weapon names.
   *
   * Uses the DAMAGE_CAUSER_NAME dictionary from @j03fr0st/pubg-ts for accurate mappings,
   * with fallback formatting for unknown weapon codes.
   *
   * @param weaponCode - Internal weapon identifier (e.g., 'WeapAK47_C')
   * @returns Human-readable weapon name (e.g., 'AKM')
   *
   * @example
   * ```typescript
   * getReadableWeaponName('WeapAK47_C') // Returns 'AKM'
   * getReadableWeaponName('WeapM416_C') // Returns 'M416'
   * getReadableWeaponName('UnknownWeap_C') // Returns 'Unknown Weap'
   * ```
   */
  private getReadableWeaponName(weaponCode: string): string {
    // Handle null/undefined weapon codes
    if (!weaponCode) {
      return 'Unknown Weapon';
    }

    // Use existing pubg-ts dictionary
    const pubgDictionaryName = DAMAGE_CAUSER_NAME?.[weaponCode];
    if (pubgDictionaryName) {
      return pubgDictionaryName;
    }

    // Fallback formatting
    return weaponCode
      .replace(/^Weap/, '')
      .replace(/_C$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
  }

  private getKillDamageCauserName(kill: LogPlayerKillV2): string {
    const finishDamage = DamageInfoUtils.getFirst(kill.finishDamageInfo)?.damageCauserName;
    if (finishDamage && finishDamage !== 'None') {
      return finishDamage;
    }

    const killerDamage = DamageInfoUtils.getFirst(kill.killerDamageInfo)?.damageCauserName;
    if (killerDamage && killerDamage !== 'None') {
      return killerDamage;
    }

    return (kill as LogPlayerKillV2 & { damageCauserName?: string }).damageCauserName ?? '';
  }
}
