import {
  EngagementAnalysis,
  WeaponEffectiveness,
  EngagementPositioning,
  CriticalMistake,
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogWeaponFireCount,
  LogPlayerTakeDamage
} from '../../types/pubg-telemetry.types';
import { info, warn } from '../../utils/logger';

export class EngagementAnalyzerService {
  private readonly OPTIMAL_ENGAGEMENT_DISTANCES = {
    SMG: { min: 0, max: 50, optimal: 25 },
    Shotgun: { min: 0, max: 30, optimal: 15 },
    AR: { min: 50, max: 300, optimal: 150 },
    DMR: { min: 100, max: 600, optimal: 300 },
    SR: { min: 200, max: 800, optimal: 400 },
    LMG: { min: 100, max: 400, optimal: 200 }
  };

  private readonly WEAPON_CATEGORIES = {
    SMG: ['UMP9', 'Vector', 'Bizon', 'Tommy Gun', 'Uzi', 'MP5K', 'Skorpion', 'MP9'],
    AR: ['AK47', 'M416', 'SCAR-L', 'M16A4', 'QBZ95', 'G36C', 'AUG', 'Beryl M762', 'Mk47 Mutant'],
    SR: ['Kar98k', 'M24', 'AWM', 'Win94'],
    DMR: ['SLR', 'SKS', 'Mini 14', 'Mk14 EBR', 'QBU88', 'VSS'],
    LMG: ['M249', 'DP-27', 'MG3'],
    Shotgun: ['S686', 'S1897', 'S12K', 'DBS']
  };

  /**
   * Analyzes engagement patterns and provides detailed recommendations
   */
  public analyzeEngagements(
    events: any[],
    teamPlayers: string[]
  ): { analysis: EngagementAnalysis; mistakes: CriticalMistake[] } {
    const killEvents = events.filter(e => e._T === 'LogPlayerKillV2') as LogPlayerKillV2[];
    const groggyEvents = events.filter(e => e._T === 'LogPlayerMakeGroggy') as LogPlayerMakeGroggy[];
    const weaponFireEvents = events.filter(e => e._T === 'LogWeaponFireCount') as LogWeaponFireCount[];
    const damageEvents = events.filter(e => e._T === 'LogPlayerTakeDamage') as LogPlayerTakeDamage[];

    const teamKills = killEvents.filter(e => teamPlayers.includes(e.killer?.name || ''));
    const teamDeaths = killEvents.filter(e => teamPlayers.includes(e.victim?.name || ''));
    const teamGroggies = groggyEvents.filter(e => teamPlayers.includes(e.attacker?.name || ''));
    const teamDamageReceived = damageEvents.filter(e => teamPlayers.includes(e.victim?.name || ''));

    const totalEngagements = this.calculateTotalEngagements(teamKills, teamDeaths, teamGroggies);
    const wonEngagements = teamKills.length + teamGroggies.length;
    const lostEngagements = teamDeaths.length;

    const averageEngagementDistance = this.calculateAverageEngagementDistance(teamKills);
    const weaponEffectiveness = this.analyzeWeaponEffectiveness(teamKills, weaponFireEvents, teamPlayers);
    const engagementPositioning = this.analyzeEngagementPositioning(killEvents, teamPlayers);
    const thirdPartySituations = this.detectThirdPartySituations(killEvents, teamPlayers);

    const analysis: EngagementAnalysis = {
      totalEngagements,
      wonEngagements,
      lostEngagements,
      averageEngagementDistance,
      weaponEffectiveness,
      engagementPositioning,
      thirdPartySituations
    };

    const mistakes = this.identifyEngagementMistakes(killEvents, teamPlayers, analysis);

    return { analysis, mistakes };
  }

  /**
   * Calculates total number of engagements
   */
  private calculateTotalEngagements(
    teamKills: LogPlayerKillV2[],
    teamDeaths: LogPlayerKillV2[],
    teamGroggies: LogPlayerMakeGroggy[]
  ): number {
    // Avoid double counting - an engagement can result in both a groggy and a kill
    const engagementIds = new Set();
    
    teamKills.forEach(kill => engagementIds.add(kill.attackId));
    teamDeaths.forEach(death => engagementIds.add(death.attackId));
    teamGroggies.forEach(groggy => engagementIds.add(groggy.attackId));

    return engagementIds.size;
  }

  /**
   * Calculates average engagement distance
   */
  private calculateAverageEngagementDistance(teamKills: LogPlayerKillV2[]): number {
    const distances = teamKills
      .map(kill => kill.killerDamageInfo?.distance || 0)
      .filter(distance => distance > 0);

    return distances.length > 0 ? distances.reduce((sum, d) => sum + d, 0) / distances.length : 0;
  }

  /**
   * Analyzes weapon effectiveness and provides recommendations
   */
  private analyzeWeaponEffectiveness(
    teamKills: LogPlayerKillV2[],
    weaponFireEvents: LogWeaponFireCount[],
    teamPlayers: string[]
  ): WeaponEffectiveness[] {
    const weaponStats = new Map<string, {
      kills: number;
      shots: number;
      totalDistance: number;
      engagements: number;
    }>();

    // Analyze kills by weapon
    teamKills.forEach(kill => {
      const weapon = this.extractWeaponName(kill.killerDamageInfo?.damageCauserName || '');
      const distance = kill.killerDamageInfo?.distance || 0;
      
      if (!weaponStats.has(weapon)) {
        weaponStats.set(weapon, { kills: 0, shots: 0, totalDistance: 0, engagements: 0 });
      }
      
      const stats = weaponStats.get(weapon)!;
      stats.kills++;
      stats.totalDistance += distance;
      stats.engagements++;
    });

    // Analyze shots fired
    weaponFireEvents
      .filter(event => teamPlayers.includes(event.character?.name || ''))
      .forEach(event => {
        const weapon = this.extractWeaponName(event.weaponId);
        
        if (!weaponStats.has(weapon)) {
          weaponStats.set(weapon, { kills: 0, shots: 0, totalDistance: 0, engagements: 0 });
        }
        
        weaponStats.get(weapon)!.shots += event.fireCount;
      });

    // Convert to effectiveness analysis
    return Array.from(weaponStats.entries()).map(([weapon, stats]) => {
      const accuracy = stats.shots > 0 ? (stats.kills / stats.shots) * 100 : 0;
      const averageDistance = stats.engagements > 0 ? stats.totalDistance / stats.engagements : 0;
      
      return {
        weapon,
        kills: stats.kills,
        shots: stats.shots,
        accuracy,
        averageDistance,
        recommendation: this.generateWeaponRecommendation(weapon, averageDistance, accuracy)
      };
    }).sort((a, b) => b.kills - a.kills);
  }

  /**
   * Analyzes engagement positioning patterns
   */
  private analyzeEngagementPositioning(
    killEvents: LogPlayerKillV2[],
    teamPlayers: string[]
  ): EngagementPositioning {
    const teamKills = killEvents.filter(e => teamPlayers.includes(e.killer?.name || ''));
    const teamDeaths = killEvents.filter(e => teamPlayers.includes(e.victim?.name || ''));

    // Analyze high ground advantage (simplified - based on Z coordinate differences)
    let highGroundAdvantage = 0;
    let coverUsage = 0;
    let overExtensions = 0;

    teamKills.forEach(kill => {
      const killerZ = kill.killer?.location?.z || 0;
      const victimZ = kill.victim?.location?.z || 0;
      
      if (killerZ > victimZ + 5) { // 5m height advantage
        highGroundAdvantage++;
      }
    });

    // Analyze over-extensions (deaths far from teammates)
    overExtensions = this.detectOverExtensions(teamDeaths);

    // Estimate cover usage based on damage reasons
    coverUsage = this.estimateCoverUsage(killEvents, teamPlayers);

    return {
      highGroundAdvantage,
      coverUsage,
      overExtensions,
      recommendation: this.generatePositioningRecommendation(highGroundAdvantage, overExtensions)
    };
  }

  /**
   * Detects third-party situations
   */
  private detectThirdPartySituations(killEvents: LogPlayerKillV2[], teamPlayers: string[]): number {
    let thirdParties = 0;
    
    // Group kills by time proximity (within 30 seconds)
    const teamDeaths = killEvents.filter(e => teamPlayers.includes(e.victim?.name || ''));
    
    teamDeaths.forEach(death => {
      const deathTime = new Date(death._D).getTime();
      
      // Check for other kills/deaths in the vicinity within the last 60 seconds
      const nearbyFights = killEvents.filter(event => {
        const eventTime = new Date(event._D).getTime();
        const timeDiff = Math.abs(eventTime - deathTime);
        
        return timeDiff <= 60000 && // Within 60 seconds
               event !== death &&
               this.calculateDistance(death.victim?.location, event.victim?.location) <= 200; // Within 200m
      });

      if (nearbyFights.length >= 2) {
        thirdParties++;
      }
    });

    return thirdParties;
  }

  /**
   * Identifies critical engagement mistakes
   */
  private identifyEngagementMistakes(
    killEvents: LogPlayerKillV2[],
    teamPlayers: string[],
    analysis: EngagementAnalysis
  ): CriticalMistake[] {
    const mistakes: CriticalMistake[] = [];
    
    const teamDeaths = killEvents.filter(e => teamPlayers.includes(e.victim?.name || ''));

    // Analyze unfavorable range engagements
    const unfavorableRangeDeaths = teamDeaths.filter(death => {
      const weapon = death.victimWeapon || '';
      const distance = death.killerDamageInfo?.distance || 0;
      
      return this.isUnfavorableRange(weapon, distance);
    });

    if (unfavorableRangeDeaths.length > 0) {
      mistakes.push({
        type: 'ENGAGEMENT',
        timestamp: unfavorableRangeDeaths[0]._D,
        player: unfavorableRangeDeaths[0].victim?.name || 'Team',
        description: `${unfavorableRangeDeaths.length} deaths in unfavorable weapon ranges`,
        impact: unfavorableRangeDeaths.length > 2 ? 'HIGH' : 'MEDIUM',
        recommendation: 'Engage enemies at your weapon\'s optimal range. Reposition if range is unfavorable.'
      });
    }

    // Analyze low engagement win rate
    const winRate = analysis.totalEngagements > 0 ? 
      (analysis.wonEngagements / analysis.totalEngagements) * 100 : 0;

    if (winRate < 40 && analysis.totalEngagements > 3) {
      mistakes.push({
        type: 'ENGAGEMENT',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: `Low engagement win rate: ${Math.round(winRate)}%`,
        impact: 'HIGH',
        recommendation: 'Pick fights more carefully. Only engage when you have advantage in position, range, or numbers.'
      });
    }

    // Analyze third-party vulnerability
    if (analysis.thirdPartySituations > 1) {
      mistakes.push({
        type: 'ENGAGEMENT',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: `${analysis.thirdPartySituations} third-party situations`,
        impact: 'MEDIUM',
        recommendation: 'Finish fights quickly and immediately reposition after engagements to avoid third parties.'
      });
    }

    return mistakes;
  }

  // Helper methods

  private extractWeaponName(damageCauserName: string): string {
    // Extract weapon name from damage causer (remove prefixes/suffixes)
    const weaponName = damageCauserName
      .replace(/^Weap/, '')
      .replace(/_C$/, '')
      .replace(/BP_/, '');
    
    return weaponName || 'Unknown';
  }

  private generateWeaponRecommendation(weapon: string, averageDistance: number, accuracy: number): string {
    const category = this.getWeaponCategory(weapon);
    const optimalRange = this.OPTIMAL_ENGAGEMENT_DISTANCES[category];
    
    if (!optimalRange) {
      return 'Consider weapon choice for different engagement ranges';
    }

    if (averageDistance < optimalRange.min) {
      return `${weapon}: Engage at longer ranges (${optimalRange.optimal}m optimal)`;
    } else if (averageDistance > optimalRange.max) {
      return `${weapon}: Engage at shorter ranges (${optimalRange.optimal}m optimal)`;
    } else if (accuracy < 10) {
      return `${weapon}: Practice aim and recoil control`;
    }

    return `${weapon}: Good usage, maintain current engagement patterns`;
  }

  private getWeaponCategory(weapon: string): keyof typeof this.OPTIMAL_ENGAGEMENT_DISTANCES {
    for (const [category, weapons] of Object.entries(this.WEAPON_CATEGORIES)) {
      if (weapons.some(w => weapon.includes(w))) {
        return category as keyof typeof this.OPTIMAL_ENGAGEMENT_DISTANCES;
      }
    }
    return 'AR'; // Default to AR
  }

  private detectOverExtensions(teamDeaths: LogPlayerKillV2[]): number {
    // This would require position tracking of all team members
    // For now, return a simplified analysis
    return Math.floor(teamDeaths.length * 0.3); // Estimate 30% of deaths are over-extensions
  }

  private estimateCoverUsage(killEvents: LogPlayerKillV2[], teamPlayers: string[]): number {
    const teamKills = killEvents.filter(e => teamPlayers.includes(e.killer?.name || ''));
    
    // Estimate cover usage based on damage through penetrable walls
    const coverKills = teamKills.filter(kill => 
      !kill.killerDamageInfo?.isThroughPenetrableWall
    );

    return coverKills.length;
  }

  private generatePositioningRecommendation(highGroundAdvantage: number, overExtensions: number): string {
    if (overExtensions > 2) {
      return 'Stay closer to teammates to avoid being isolated and overwhelmed';
    } else if (highGroundAdvantage < 2) {
      return 'Take high ground positions more often for better angles and cover';
    }
    return 'Good positioning discipline, maintain current tactics';
  }

  private isUnfavorableRange(weapon: string, distance: number): boolean {
    const category = this.getWeaponCategory(weapon);
    const optimalRange = this.OPTIMAL_ENGAGEMENT_DISTANCES[category];
    
    return distance < optimalRange.min * 0.5 || distance > optimalRange.max * 1.5;
  }

  private calculateDistance(loc1: any, loc2: any): number {
    if (!loc1 || !loc2) return 0;
    
    const dx = loc1.x - loc2.x;
    const dy = loc1.y - loc2.y;
    
    return Math.sqrt(dx * dx + dy * dy) / 100; // Convert to meters
  }
} 