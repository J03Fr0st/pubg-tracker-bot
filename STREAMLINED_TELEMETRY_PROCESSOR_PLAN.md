# Streamlined Telemetry Processor Plan

## Overview

This revised plan leverages existing telemetry types from `@j03fr0st/pubg-ts` and focuses purely on processing logic and analytics calculation. We'll use the existing types directly and only create minimal analytics result interfaces.

## Smart Approach: Use Existing Types

### Available Telemetry Types (Already Defined)
```typescript
// From @j03fr0st/pubg-ts - USE THESE DIRECTLY
import {
  LogPlayerKillV2,        // ✅ Kill events with assists, damage info
  LogPlayerMakeGroggy,    // ✅ Knockdown events  
  LogPlayerTakeDamage,    // ✅ Individual damage events
  LogPlayerAttack,        // ✅ Weapon fire events
  LogPlayerRevive,        // ✅ Revival events
  LogWeaponFireCount,     // ✅ Total shots fired per weapon
  LogPlayerPosition,      // ✅ Player location tracking
  TelemetryEvent,         // ✅ Base event interface
  TelemetryData,          // ✅ Union of all event types
  DamageInfoUtils,        // ✅ Utility for damage info parsing
} from '@j03fr0st/pubg-ts';
```

### Minimal Analytics Types (Only What We Need)
Create `src/types/analytics-results.types.ts`:

```typescript
// ONLY create types for our calculated results - not raw events
export interface WeaponStats {
  weaponName: string;
  kills: number;
  knockdowns: number;
  damageDealt: number;
  shotsFired: number;
  hits: number;
  longestKill: number;
  averageDistance: number;
  accuracy: number;        // hits / shotsFired
  lethality: number;       // kills / hits
  efficiency: number;      // kills / shotsFired
}

export interface KillChain {
  startTime: Date;
  kills: LogPlayerKillV2[]; // Use existing type!
  duration: number;
  weaponsUsed: string[];
  averageTimeBetweenKills: number;
}

export interface AssistInfo {
  assistingPlayer: string;
  killedPlayer: string;
  damageDealt: number;
  damagePercentage: number;
  assistType: 'damage' | 'knockdown' | 'both';
  weapon: string;
}

export interface PlayerAnalysis {
  playerName: string;
  // Raw events (use existing types)
  killEvents: LogPlayerKillV2[];
  knockdownEvents: LogPlayerMakeGroggy[];
  damageEvents: LogPlayerTakeDamage[];
  reviveEvents: LogPlayerRevive[];
  // Calculated analytics
  weaponStats: WeaponStats[];
  killChains: KillChain[];
  calculatedAssists: AssistInfo[];
  totalDamageDealt: number;
  totalDamageTaken: number;
  kdRatio: number;
  avgKillDistance: number;
  headshotPercentage: number;
  killsPerMinute: number;
}

export interface MatchAnalysis {
  matchId: string;
  playerAnalyses: Map<string, PlayerAnalysis>;
  processingTimeMs: number;
  totalEventsProcessed: number;
}
```

## Implementation Plan

### Phase 1: TelemetryProcessor Service (45-60 minutes)
Create `src/services/telemetry-processor.service.ts`:

```typescript
import {
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogPlayerTakeDamage,
  LogPlayerAttack,
  LogPlayerRevive,
  LogWeaponFireCount,
  TelemetryEvent,
  DamageInfoUtils,
  DAMAGE_CAUSER_NAME
} from '@j03fr0st/pubg-ts';

import { 
  PlayerAnalysis, 
  MatchAnalysis, 
  WeaponStats, 
  KillChain, 
  AssistInfo 
} from '../types/analytics-results.types';

export class TelemetryProcessorService {
  
  /**
   * Main processing method - use existing telemetry types directly
   */
  public async processMatchTelemetry(
    telemetryData: TelemetryEvent[], // Use existing union type
    matchId: string,
    matchStartTime: Date,
    trackedPlayerNames: string[]
  ): Promise<MatchAnalysis> {
    
    const startTime = Date.now();
    
    // Filter events by type using existing interfaces
    const killEvents = telemetryData.filter(e => e._T === 'LogPlayerKillV2') as LogPlayerKillV2[];
    const knockdownEvents = telemetryData.filter(e => e._T === 'LogPlayerMakeGroggy') as LogPlayerMakeGroggy[];
    const damageEvents = telemetryData.filter(e => e._T === 'LogPlayerTakeDamage') as LogPlayerTakeDamage[];
    const attackEvents = telemetryData.filter(e => e._T === 'LogPlayerAttack') as LogPlayerAttack[];
    const reviveEvents = telemetryData.filter(e => e._T === 'LogPlayerRevive') as LogPlayerRevive[];
    const fireCountEvents = telemetryData.filter(e => e._T === 'LogWeaponFireCount') as LogWeaponFireCount[];

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
      totalEventsProcessed: telemetryData.length
    };
  }

  /**
   * Analyze individual player using existing telemetry types
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
    const playerKills = allKills.filter(k => k.killer?.name === playerName);
    const playerKnockdowns = allKnockdowns.filter(k => k.attacker?.name === playerName);
    const playerDamageDealt = allDamage.filter(d => d.attacker?.name === playerName);
    const playerDamageTaken = allDamage.filter(d => d.victim?.name === playerName);
    const playerAttacks = allAttacks.filter(a => a.attacker?.name === playerName);
    const playerRevives = allRevives.filter(r => r.reviver?.name === playerName);
    const playerFireCounts = allFireCounts.filter(f => f.character?.name === playerName);

    // Calculate weapon statistics
    const weaponStats = this.calculateWeaponStats(
      playerKills,
      playerKnockdowns,
      playerDamageDealt,
      playerAttacks,
      playerFireCounts
    );

    // Analyze kill chains
    const killChains = this.analyzeKillChains(playerKills, matchStartTime);

    // Calculate assists
    const calculatedAssists = this.calculateAssists(
      playerName,
      allKills,
      allDamage,
      allKnockdowns
    );

    // Calculate summary stats
    const totalDamageDealt = playerDamageDealt.reduce((sum, d) => sum + d.damage, 0);
    const totalDamageTaken = playerDamageTaken.reduce((sum, d) => sum + d.damage, 0);
    const playerDeaths = allKills.filter(k => k.victim?.name === playerName).length;
    const kdRatio = playerDeaths > 0 ? playerKills.length / playerDeaths : playerKills.length;
    
    const avgKillDistance = playerKills.length > 0 ? 
      playerKills.reduce((sum, k) => sum + k.distance, 0) / playerKills.length / 100 : 0;
    
    const headshotKills = playerKills.filter(k => k.damageReason === 'HeadShot').length;
    const headshotPercentage = playerKills.length > 0 ? (headshotKills / playerKills.length) * 100 : 0;

    return {
      playerName,
      // Store raw events (using existing types!)
      killEvents: playerKills,
      knockdownEvents: playerKnockdowns,
      damageEvents: playerDamageDealt,
      reviveEvents: playerRevives,
      // Calculated analytics
      weaponStats,
      killChains,
      calculatedAssists,
      totalDamageDealt,
      totalDamageTaken,
      kdRatio,
      avgKillDistance,
      headshotPercentage,
      killsPerMinute: 0 // Calculate based on match duration
    };
  }

  /**
   * Calculate weapon statistics using existing telemetry data
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
      const stats = weaponMap.get(weaponName) || { weaponName, kills: 0, knockdowns: 0, damageDealt: 0, shotsFired: 0, hits: 0, longestKill: 0 };
      
      stats.kills = (stats.kills || 0) + 1;
      stats.longestKill = Math.max(stats.longestKill || 0, kill.distance / 100);
      
      weaponMap.set(weaponName, stats);
    }

    // Process knockdowns  
    for (const knockdown of knockdowns) {
      const weaponName = this.getReadableWeaponName(knockdown.damageCauserName);
      const stats = weaponMap.get(weaponName) || { weaponName, kills: 0, knockdowns: 0, damageDealt: 0, shotsFired: 0, hits: 0, longestKill: 0 };
      
      stats.knockdowns = (stats.knockdowns || 0) + 1;
      
      weaponMap.set(weaponName, stats);
    }

    // Process damage events
    for (const dmg of damage) {
      const weaponName = this.getReadableWeaponName(dmg.damageCauserName);
      const stats = weaponMap.get(weaponName) || { weaponName, kills: 0, knockdowns: 0, damageDealt: 0, shotsFired: 0, hits: 0, longestKill: 0 };
      
      stats.damageDealt = (stats.damageDealt || 0) + dmg.damage;
      stats.hits = (stats.hits || 0) + 1;
      
      weaponMap.set(weaponName, stats);
    }

    // Process fire count events
    for (const fireCount of fireCounts) {
      if (fireCount.weaponId && fireCount.fireCount) {
        const weaponName = this.getReadableWeaponName(fireCount.weaponId);
        const stats = weaponMap.get(weaponName) || { weaponName, kills: 0, knockdowns: 0, damageDealt: 0, shotsFired: 0, hits: 0, longestKill: 0 };
        
        stats.shotsFired = (stats.shotsFired || 0) + fireCount.fireCount;
        
        weaponMap.set(weaponName, stats);
      }
    }

    // Calculate final metrics and convert to WeaponStats[]
    const weaponStats: WeaponStats[] = [];
    for (const [weaponName, stats] of weaponMap) {
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
        efficiency: shots > 0 ? (kills / shots) * 100 : 0
      });
    }

    return weaponStats.sort((a, b) => b.kills - a.kills);
  }

  /**
   * Analyze kill chains using existing LogPlayerKillV2 events
   */
  private analyzeKillChains(kills: LogPlayerKillV2[], matchStartTime: Date): KillChain[] {
    if (kills.length < 2) return [];

    const CHAIN_TIME_WINDOW = 30 * 1000; // 30 seconds
    const chains: KillChain[] = [];
    const sortedKills = [...kills].sort((a, b) => 
      new Date(a._D!).getTime() - new Date(b._D!).getTime()
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
        const timeSinceLastKill = killTime.getTime() - new Date(currentChain[currentChain.length - 1]._D!).getTime();
        
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
    const weaponsUsed = [...new Set(kills.map(k => this.getReadableWeaponName(k.damageCauserName)))];

    return {
      startTime,
      kills, // Store the actual LogPlayerKillV2 events!
      duration: duration / 1000, // Convert to seconds
      weaponsUsed,
      averageTimeBetweenKills: averageTimeBetweenKills / 1000 // Convert to seconds
    };
  }

  /**
   * Calculate assists using existing event types
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
      const playerDamageToVictim = allDamage.filter(d => 
        d.attacker?.name === playerName &&
        d.victim?.name === victim &&
        new Date(d._D!).getTime() < killTime &&
        (killTime - new Date(d._D!).getTime()) <= ASSIST_TIME_WINDOW
      );

      // Find knockdowns by this player on the victim
      const playerKnockdownsOfVictim = allKnockdowns.filter(k =>
        k.attacker?.name === playerName &&
        k.victim?.name === victim &&
        new Date(k._D!).getTime() < killTime &&
        (killTime - new Date(k._D!).getTime()) <= ASSIST_TIME_WINDOW
      );

      const totalDamage = playerDamageToVictim.reduce((sum, d) => sum + d.damage, 0);
      const hasKnockdown = playerKnockdownsOfVictim.length > 0;

      if (totalDamage >= MIN_DAMAGE_THRESHOLD || hasKnockdown) {
        // Calculate total damage to victim from all players for percentage
        const allDamageToVictim = allDamage.filter(d => 
          d.victim?.name === victim &&
          new Date(d._D!).getTime() < killTime
        ).reduce((sum, d) => sum + d.damage, 0);

        const assistType = totalDamage >= MIN_DAMAGE_THRESHOLD && hasKnockdown ? 'both' :
                          hasKnockdown ? 'knockdown' : 'damage';

        const weapon = playerDamageToVictim.length > 0 ? 
          this.getReadableWeaponName(playerDamageToVictim[0].damageCauserName) :
          playerKnockdownsOfVictim.length > 0 ?
          this.getReadableWeaponName(playerKnockdownsOfVictim[0].damageCauserName) :
          'Unknown';

        assists.push({
          assistingPlayer: playerName,
          killedPlayer: victim,
          damageDealt: totalDamage,
          damagePercentage: allDamageToVictim > 0 ? (totalDamage / allDamageToVictim) * 100 : 0,
          assistType,
          weapon
        });
      }
    }

    return assists;
  }

  /**
   * Get readable weapon name using existing DAMAGE_CAUSER_NAME dictionary
   */
  private getReadableWeaponName(weaponCode: string): string {
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
```

### Phase 2: Discord Bot Integration (30-45 minutes)
Update `src/services/discord-bot.service.ts`:

```typescript
import { TelemetryProcessorService } from './telemetry-processor.service';
import { MatchAnalysis, PlayerAnalysis } from '../types/analytics-results.types';

export class DiscordBotService {
  private readonly telemetryProcessor: TelemetryProcessorService;

  constructor(apiKey: string, shard: Shard = 'pc-na') {
    // ... existing constructor code ...
    this.telemetryProcessor = new TelemetryProcessorService();
  }

  private async createMatchSummaryEmbeds(
    summary: DiscordMatchGroupSummary
  ): Promise<EmbedBuilder[]> {
    // ... existing main embed creation code ...

    if (!summary.telemetryUrl) {
      return [mainEmbed, ...this.createBasicPlayerEmbeds(players, matchColor)];
    }

    try {
      // Fetch raw telemetry data
      const telemetryData = await this.pubgClient.telemetry.getTelemetryData(summary.telemetryUrl);
      const trackedPlayerNames = players.map(p => p.name);

      // Process using our new service
      const matchAnalysis = await this.telemetryProcessor.processMatchTelemetry(
        telemetryData, // Raw TelemetryEvent[] - no conversion needed!
        matchId,
        matchDate,
        trackedPlayerNames
      );

      // Create enhanced embeds
      const enhancedPlayerEmbeds = players.map(player => {
        const analysis = matchAnalysis.playerAnalyses.get(player.name);
        return analysis ? 
          this.createEnhancedPlayerEmbed(player, analysis, matchColor, matchId) :
          this.createBasicPlayerEmbed(player, matchColor, matchId);
      });

      return [mainEmbed, ...enhancedPlayerEmbeds];

    } catch (err) {
      error(`Telemetry processing failed: ${(err as Error).message}`);
      return [mainEmbed, ...this.createBasicPlayerEmbeds(players, matchColor)];
    }
  }

  private createEnhancedPlayerEmbed(
    player: DiscordPlayerMatchStats,
    analysis: PlayerAnalysis,
    matchColor: number,
    matchId: string
  ): EmbedBuilder {
    const statsDescription = this.formatEnhancedStats(player, analysis, matchId);

    return new EmbedBuilder()
      .setTitle(`Player: ${player.name}`)
      .setDescription(statsDescription)
      .setColor(matchColor);
  }

  private formatEnhancedStats(
    player: DiscordPlayerMatchStats,
    analysis: PlayerAnalysis,
    matchId: string
  ): string {
    const { stats } = player;
    if (!stats) return 'No stats available';

    const sections = [
      // Enhanced combat stats
      this.formatCombatStats(stats, analysis),
      
      // Weapon efficiency 
      this.formatWeaponStats(analysis.weaponStats),
      
      // Kill chains
      this.formatKillChains(analysis.killChains),
      
      // Assists
      this.formatAssists(analysis.calculatedAssists),
      
      // Enhanced timeline using raw telemetry events
      this.formatEnhancedTimeline(analysis),
      
      // Basic info
      `⏰ Survival: ${Math.round(stats.timeSurvived / 60)}min • ${(stats.walkDistance / 1000).toFixed(1)}km`,
      `🎯 [2D Replay](https://pubg.sh/${player.name}/steam/${matchId})`
    ];

    return sections.filter(Boolean).join('\n\n');
  }

  private formatCombatStats(stats: any, analysis: PlayerAnalysis): string {
    return [
      `⚔️ **ENHANCED COMBAT**`,
      `Kills: **${stats.kills}** (${stats.headshotKills} HS) • K/D: **${analysis.kdRatio.toFixed(2)}**`,
      `Damage: **${analysis.totalDamageDealt.toFixed(0)}** dealt / **${analysis.totalDamageTaken.toFixed(0)}** taken`,
      `Avg Distance: **${analysis.avgKillDistance.toFixed(0)}m** • HS Rate: **${analysis.headshotPercentage.toFixed(1)}%**`
    ].join('\n');
  }

  private formatWeaponStats(weapons: WeaponStats[]): string {
    if (!weapons.length) return '';
    
    const topWeapons = weapons.slice(0, 2);
    const weaponLines = topWeapons.map(w => 
      `🔫 **${w.weaponName}**: ${w.kills}K/${w.knockdowns}D • ${w.efficiency.toFixed(1)}% eff • ${w.accuracy.toFixed(1)}% acc`
    );
    
    return `**WEAPON MASTERY**\n${weaponLines.join('\n')}`;
  }

  private formatKillChains(chains: KillChain[]): string {
    if (!chains.length) return '';
    
    const bestChain = chains.reduce((best, current) => 
      current.kills.length > best.kills.length ? current : best
    );
    
    const multiKills = chains.reduce((counts, chain) => {
      const killCount = chain.kills.length;
      if (killCount === 2) counts.doubles++;
      else if (killCount === 3) counts.triples++;  
      else if (killCount >= 4) counts.quads++;
      return counts;
    }, { doubles: 0, triples: 0, quads: 0 });

    const elements = [];
    if (bestChain.kills.length >= 2) {
      elements.push(`🔥 Best: **${bestChain.kills.length} kills** (${bestChain.duration.toFixed(1)}s)`);
    }
    if (multiKills.doubles) elements.push(`⚡ Doubles: **${multiKills.doubles}**`);
    if (multiKills.triples) elements.push(`💫 Triples: **${multiKills.triples}**`);
    if (multiKills.quads) elements.push(`🌟 Quads+: **${multiKills.quads}**`);
    
    return elements.length > 0 ? `**KILL CHAINS**\n${elements.join(' • ')}` : '';
  }

  private formatAssists(assists: AssistInfo[]): string {
    if (!assists.length) return '';
    
    const assistTypes = assists.reduce((counts, assist) => {
      counts[assist.assistType]++;
      return counts;
    }, { damage: 0, knockdown: 0, both: 0 } as Record<string, number>);

    const elements = [`🤝 Total: **${assists.length}**`];
    if (assistTypes.damage) elements.push(`💥 Damage: **${assistTypes.damage}**`);
    if (assistTypes.knockdown) elements.push(`🔻 Knockdown: **${assistTypes.knockdown}**`);
    if (assistTypes.both) elements.push(`⭐ Combined: **${assistTypes.both}**`);
    
    return `**CALCULATED ASSISTS**\n${elements.join(' • ')}`;
  }

  private formatEnhancedTimeline(analysis: PlayerAnalysis): string {
    // Combine raw telemetry events for timeline
    const timelineEvents = [
      ...analysis.killEvents.map(k => ({ type: 'kill', event: k, time: new Date(k._D!) })),
      ...analysis.knockdownEvents.map(k => ({ type: 'knockdown', event: k, time: new Date(k._D!) })),
      ...analysis.reviveEvents.map(r => ({ type: 'revive', event: r, time: new Date(r._D!) }))
    ].sort((a, b) => a.time.getTime() - b.time.getTime()).slice(0, 10);

    if (!timelineEvents.length) return '';

    const timeline = timelineEvents.map(({ type, event }) => {
      const matchTime = this.formatMatchTime(event._D!, analysis.killEvents[0]?._D ? new Date(analysis.killEvents[0]._D) : new Date());
      
      if (type === 'kill') {
        const kill = event as LogPlayerKillV2; // Use the actual telemetry type!
        const weapon = this.getReadableDamageCauserName(kill.damageCauserName);
        const distance = Math.round(kill.distance / 100);
        return `\`${matchTime}\` ⚔️ Killed [${kill.victim?.name}](https://pubg.op.gg/user/${kill.victim?.name}) (${weapon}, ${distance}m)`;
      } else if (type === 'knockdown') {
        const knockdown = event as LogPlayerMakeGroggy; // Use the actual telemetry type!
        const weapon = this.getReadableDamageCauserName(knockdown.damageCauserName);
        const distance = Math.round(knockdown.distance / 100);
        return `\`${matchTime}\` 🔻 Knocked [${knockdown.victim?.name}](https://pubg.op.gg/user/${knockdown.victim?.name}) (${weapon}, ${distance}m)`;
      } else if (type === 'revive') {
        const revive = event as LogPlayerRevive; // Use the actual telemetry type!
        return `\`${matchTime}\` 🚑 Revived [${revive.victim?.name}](https://pubg.op.gg/user/${revive.victim?.name})`;
      }
      return '';
    }).filter(Boolean);

    return timeline.length > 0 ? `**ENHANCED TIMELINE**\n${timeline.join('\n')}` : '';
  }

  private formatMatchTime(eventTime: string, matchStart: Date): string {
    const eventDate = new Date(eventTime);
    const relativeSeconds = Math.round((eventDate.getTime() - matchStart.getTime()) / 1000);
    const minutes = Math.floor(relativeSeconds / 60);
    const seconds = relativeSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // ... existing methods remain unchanged ...
}
```

## Implementation Benefits

### ✅ What We Gain
- **Leverage Existing Types**: No duplicate type definitions
- **Use Proven Interfaces**: pubg-ts types are battle-tested
- **Minimal Code**: Focus on logic, not type definitions
- **Better Maintainability**: Changes to pubg-ts automatically benefit us
- **Rich Data Access**: Full access to all telemetry event properties

### ⚡ Streamlined Implementation
- **Phase 1**: TelemetryProcessor (45-60 min) - Pure processing logic
- **Phase 2**: Discord Integration (30-45 min) - Enhanced formatting
- **Total Time**: ~2 hours instead of 17-22 hours!

### 🎯 Smart Architecture
```
Discord Bot Service
├── Enhanced message formatting
└── Rich embed generation
    ↑
TelemetryProcessorService  
├── Use LogPlayerKillV2 directly
├── Use LogPlayerTakeDamage directly
├── Use existing DamageInfoUtils
├── Calculate weapon stats from raw events
├── Build kill chains from LogPlayerKillV2[]
└── Return minimal analytics interfaces
```

This approach is much smarter - we use the robust, tested telemetry types that already exist and focus our effort on the analytics calculations and Discord presentation logic!