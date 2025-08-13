import {
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogPlayerTakeDamage,
  LogPlayerAttack,
  LogPlayerRevive,
  LogWeaponFireCount,
  TelemetryEvent,
  DAMAGE_CAUSER_NAME,
} from '@j03fr0st/pubg-ts';

import {
  PlayerAnalysis,
  MatchAnalysis,
  WeaponStats,
  KillChain,
  AssistInfo,
} from '../types/analytics-results.types';

export class TelemetryProcessorService {
  /**
   * Performs robust player name matching to handle potential inconsistencies in telemetry data.
   *
   * Handles cases like:
   * - Exact matches
   * - Case differences
   * - Leading/trailing whitespace
   * - Special character variations
   *
   * @param telemetryName - Name from telemetry event (may be null/undefined)
   * @param trackedName - Name we're tracking
   * @returns true if names match, false otherwise
   */
  private isPlayerNameMatch(telemetryName: string | undefined | null, trackedName: string): boolean {
    if (!telemetryName || !trackedName) return false;

    // Exact match first
    if (telemetryName === trackedName) return true;

    // Case-insensitive match
    if (telemetryName.toLowerCase() === trackedName.toLowerCase()) return true;

    // Trim whitespace and try again
    const trimmedTelemetry = telemetryName.trim();
    const trimmedTracked = trackedName.trim();
    if (trimmedTelemetry.toLowerCase() === trimmedTracked.toLowerCase()) return true;

    return false;
  }
  /**
   * Processes raw telemetry data for a match and returns enhanced analytics for tracked players.
   *
   * This method analyzes various telemetry events (kills, damage, knockdowns, etc.) to provide
   * detailed combat statistics, weapon performance metrics, kill chains, and assist calculations.
   *
   * @param telemetryData - Array of raw telemetry events from PUBG API
   * @param matchId - Unique identifier for the match
   * @param matchStartTime - Timestamp when the match started
   * @param trackedPlayerNames - List of player names to analyze (only these players will be processed)
   * @returns Promise resolving to MatchAnalysis containing detailed player analytics
   *
   * @example
   * ```typescript
   * const analysis = await processor.processMatchTelemetry(
   *   telemetryEvents,
   *   'match-123',
   *   new Date('2024-01-01T10:00:00Z'),
   *   ['PlayerName1', 'PlayerName2']
   * );
   *
   * const playerStats = analysis.playerAnalyses.get('PlayerName1');
   * console.log(`Player dealt ${playerStats.totalDamageDealt} damage`);
   * ```
   */
  public async processMatchTelemetry(
    telemetryData: TelemetryEvent[], // Use existing union type
    matchId: string,
    matchStartTime: Date,
    trackedPlayerNames: string[]
  ): Promise<MatchAnalysis> {
    const startTime = Date.now();

    // Filter events by type using existing interfaces
    const killEvents = telemetryData.filter((e) => e._T === 'LogPlayerKillV2') as LogPlayerKillV2[];
    const knockdownEvents = telemetryData.filter(
      (e) => e._T === 'LogPlayerMakeGroggy'
    ) as LogPlayerMakeGroggy[];
    const damageEvents = telemetryData.filter(
      (e) => e._T === 'LogPlayerTakeDamage'
    ) as LogPlayerTakeDamage[];
    const attackEvents = telemetryData.filter(
      (e) => e._T === 'LogPlayerAttack'
    ) as LogPlayerAttack[];
    const reviveEvents = telemetryData.filter(
      (e) => e._T === 'LogPlayerRevive'
    ) as LogPlayerRevive[];
    const fireCountEvents = telemetryData.filter(
      (e) => e._T === 'LogWeaponFireCount'
    ) as LogWeaponFireCount[];



    const playerAnalyses = new Map<string, PlayerAnalysis>();

    // Process each tracked player
    for (const playerName of trackedPlayerNames) {
      const analysis = this.analyzePlayer(
        playerName,
        killEvents,
        knockdownEvents,
        damageEvents,
        attackEvents,
        reviveEvents,
        fireCountEvents,
        matchStartTime
      );

      playerAnalyses.set(playerName, analysis);
    }

    return {
      matchId,
      playerAnalyses,
      processingTimeMs: Date.now() - startTime,
      totalEventsProcessed: telemetryData.length,
    };
  }

  /**
   * Analyzes telemetry events for a single player and calculates comprehensive combat statistics.
   *
   * This method processes all telemetry events related to the specified player, including:
   * - Kill and knockdown events
   * - Damage dealt and taken
   * - Weapon usage statistics
   * - Kill chain analysis
   * - Assist calculations
   *
   * @param playerName - Name of the player to analyze
   * @param allKills - All kill events from the match
   * @param allKnockdowns - All knockdown events from the match
   * @param allDamage - All damage events from the match
   * @param allAttacks - All attack events from the match
   * @param allRevives - All revive events from the match
   * @param allFireCounts - All weapon fire count events from the match
   * @param matchStartTime - Timestamp when the match started (used for timing calculations)
   * @returns PlayerAnalysis object with detailed statistics and raw event data
   */
  private analyzePlayer(
    playerName: string,
    allKills: LogPlayerKillV2[],
    allKnockdowns: LogPlayerMakeGroggy[],
    allDamage: LogPlayerTakeDamage[],
    allAttacks: LogPlayerAttack[],
    allRevives: LogPlayerRevive[],
    allFireCounts: LogWeaponFireCount[],
    matchStartTime: Date
  ): PlayerAnalysis {
    // Filter events for this player (using existing types directly)
    const playerKills = allKills.filter((k) => k.killer?.name === playerName);
    const playerKnockdowns = allKnockdowns.filter((k) => k.attacker?.name === playerName);
    const playerDamageDealt = allDamage.filter((d) => d.attacker?.name === playerName);
    const playerDamageTaken = allDamage.filter((d) => d.victim?.name === playerName);
    const playerAttacks = allAttacks.filter((a) => a.attacker?.name === playerName);
    const playerRevives = allRevives.filter((r) => r.reviver?.name === playerName);
    const playerFireCounts = allFireCounts.filter((f) => f.character?.name === playerName);
    // Events where player is the victim
    const playerDeaths = allKills.filter((k) => this.isPlayerNameMatch(k.victim?.name, playerName));
    const playerKnockedDown = allKnockdowns.filter((k) => this.isPlayerNameMatch(k.victim?.name, playerName));

    // Calculate weapon statistics
    const weaponStats = this.calculateWeaponStats(
      playerKills,
      playerKnockdowns,
      playerDamageDealt,
      playerAttacks,
      playerFireCounts
    );

    // Analyze kill chains
    const killChains = this.analyzeKillChains(playerKills);

    // Calculate assists
    const calculatedAssists = this.calculateAssists(playerName, allKills, allDamage, allKnockdowns);

    // Calculate summary stats
    const totalDamageDealt = playerDamageDealt.reduce((sum, d) => sum + d.damage, 0);
    const totalDamageTaken = playerDamageTaken.reduce((sum, d) => sum + d.damage, 0);
    const kdRatio =
      playerDeaths.length > 0 ? playerKills.length / playerDeaths.length : playerKills.length;

    // Calculate average kill distance, filtering out invalid distances
    const validKillDistances = playerKills
      .map(k => k.distance)
      .filter(distance => distance != null && !isNaN(distance) && distance > 0);

    const avgKillDistance = validKillDistances.length > 0
      ? validKillDistances.reduce((sum, distance) => sum + distance, 0) / validKillDistances.length / 100
      : 0;

    const headshotKills = playerKills.filter((k) => k.damageReason === 'HeadShot').length;
    const headshotPercentage =
      playerKills.length > 0 ? (headshotKills / playerKills.length) * 100 : 0;

    return {
      playerName,
      matchStartTime, // Include the actual match start time
      // Store raw events (using existing types!)
      killEvents: playerKills,
      knockdownEvents: playerKnockdowns,
      damageEvents: playerDamageDealt,
      reviveEvents: playerRevives,
      // Events where player is the victim
      deathEvents: playerDeaths,
      knockedDownEvents: playerKnockedDown,
      // Calculated analytics
      weaponStats,
      killChains,
      calculatedAssists,
      totalDamageDealt,
      totalDamageTaken,
      kdRatio,
      avgKillDistance,
      headshotPercentage,
      killsPerMinute: 0, // Calculate based on match duration
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
    attacks: LogPlayerAttack[],
    fireCounts: LogWeaponFireCount[]
  ): WeaponStats[] {
    const weaponMap = new Map<string, Partial<WeaponStats>>();

    // Process kills
    for (const kill of kills) {
      const weaponName = this.getReadableWeaponName(kill.damageCauserName);
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
      ...new Set(kills.map((k) => this.getReadableWeaponName(k.damageCauserName))),
    ];

    return {
      startTime,
      kills, // Store the actual LogPlayerKillV2 events!
      duration: duration / 1000, // Convert to seconds
      weaponsUsed,
      averageTimeBetweenKills: averageTimeBetweenKills / 1000, // Convert to seconds
    };
  }

  /**
   * Calculates assist contributions for kills performed by other players.
   *
   * An assist is awarded when a player:
   * - Deals at least 20 damage to a victim within 10 seconds of their death, OR
   * - Knocks down a victim within 10 seconds of their death
   *
   * Both damage and knockdown assists can be combined for a single kill.
   *
   * @param playerName - Name of the player to calculate assists for
   * @param allKills - All kill events from the match
   * @param allDamage - All damage events from the match
   * @param allKnockdowns - All knockdown events from the match
   * @returns Array of AssistInfo objects representing valid assist contributions
   */
  private calculateAssists(
    playerName: string,
    allKills: LogPlayerKillV2[],
    allDamage: LogPlayerTakeDamage[],
    allKnockdowns: LogPlayerMakeGroggy[]
  ): AssistInfo[] {
    const assists: AssistInfo[] = [];
    const ASSIST_TIME_WINDOW = 10 * 1000; // 10 seconds
    const MIN_DAMAGE_THRESHOLD = 20;

    for (const kill of allKills) {
      if (kill.killer?.name === playerName) continue; // Skip player's own kills

      const killTime = new Date(kill._D!).getTime();
      const victim = kill.victim?.name;
      if (!victim) continue;

      // Find damage dealt by this player to the victim before the kill
      const playerDamageToVictim = allDamage.filter(
        (d) =>
          d.attacker?.name === playerName &&
          d.victim?.name === victim &&
          new Date(d._D!).getTime() < killTime &&
          killTime - new Date(d._D!).getTime() <= ASSIST_TIME_WINDOW
      );

      // Find knockdowns by this player on the victim
      const playerKnockdownsOfVictim = allKnockdowns.filter(
        (k) =>
          k.attacker?.name === playerName &&
          k.victim?.name === victim &&
          new Date(k._D!).getTime() < killTime &&
          killTime - new Date(k._D!).getTime() <= ASSIST_TIME_WINDOW
      );

      const totalDamage = playerDamageToVictim.reduce((sum, d) => sum + d.damage, 0);
      const hasKnockdown = playerKnockdownsOfVictim.length > 0;

      if (totalDamage >= MIN_DAMAGE_THRESHOLD || hasKnockdown) {
        // Calculate total damage to victim from all players for percentage
        const allDamageToVictim = allDamage
          .filter((d) => d.victim?.name === victim && new Date(d._D!).getTime() < killTime)
          .reduce((sum, d) => sum + d.damage, 0);

        const assistType =
          totalDamage >= MIN_DAMAGE_THRESHOLD && hasKnockdown
            ? 'both'
            : hasKnockdown
              ? 'knockdown'
              : 'damage';

        const weapon =
          playerDamageToVictim.length > 0
            ? this.getReadableWeaponName(playerDamageToVictim[0].damageCauserName)
            : playerKnockdownsOfVictim.length > 0
              ? this.getReadableWeaponName(playerKnockdownsOfVictim[0].damageCauserName)
              : 'Unknown';

        assists.push({
          assistingPlayer: playerName,
          killedPlayer: victim,
          damageDealt: totalDamage,
          damagePercentage: allDamageToVictim > 0 ? (totalDamage / allDamageToVictim) * 100 : 0,
          assistType,
          weapon,
        });
      }
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
}
