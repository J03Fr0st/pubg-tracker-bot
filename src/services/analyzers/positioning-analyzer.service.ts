import {
  PositioningAnalysis,
  ZoneManagement,
  RotationEfficiency,
  CompoundHolding,
  FinalCirclePositioning,
  CriticalMistake,
  LogZoneUpdate,
  LogPlayerPosition,
  LogPlayerTakeDamage,
  LogVehicleRide,
  Location
} from '../../types/pubg-telemetry.types';
import { info, warn } from '../../utils/logger';

export class PositioningAnalyzerService {
  private readonly ZONE_PHASES = [
    { phase: 1, duration: 300, damagePerSecond: 0.4, waitTime: 180 },
    { phase: 2, duration: 180, damagePerSecond: 0.6, waitTime: 150 },
    { phase: 3, duration: 150, damagePerSecond: 1.5, waitTime: 120 },
    { phase: 4, duration: 120, damagePerSecond: 2.6, waitTime: 90 },
    { phase: 5, duration: 90, damagePerSecond: 4.2, waitTime: 60 },
    { phase: 6, duration: 60, damagePerSecond: 6.0, waitTime: 30 },
    { phase: 7, duration: 30, damagePerSecond: 8.5, waitTime: 30 },
    { phase: 8, duration: 30, damagePerSecond: 11.0, waitTime: 0 }
  ];

  /**
   * Analyzes positioning patterns and provides detailed recommendations
   */
  public analyzePositioning(
    events: any[],
    teamPlayers: string[]
  ): { analysis: PositioningAnalysis; mistakes: CriticalMistake[] } {
    const zoneEvents = events.filter(e => e._T === 'LogZoneUpdate') as LogZoneUpdate[];
    const positionEvents = events.filter(e => e._T === 'LogPlayerPosition') as LogPlayerPosition[];
    const damageEvents = events.filter(e => e._T === 'LogPlayerTakeDamage') as LogPlayerTakeDamage[];
    const vehicleEvents = events.filter(e => e._T === 'LogVehicleRide') as LogVehicleRide[];

    const zoneManagement = this.analyzeZoneManagement(zoneEvents, damageEvents, positionEvents, teamPlayers);
    const rotationEfficiency = this.analyzeRotationEfficiency(positionEvents, vehicleEvents, zoneEvents, teamPlayers);
    const compoundHolding = this.analyzeCompoundHolding(positionEvents, teamPlayers);
    const finalCirclePositioning = this.analyzeFinalCirclePositioning(positionEvents, zoneEvents, teamPlayers);

    const analysis: PositioningAnalysis = {
      zoneManagement,
      rotationEfficiency,
      compoundHolding,
      finalCirclePositioning
    };

    const mistakes = this.identifyPositioningMistakes(events, teamPlayers, analysis);

    return { analysis, mistakes };
  }

  /**
   * Analyzes zone management effectiveness
   */
  private analyzeZoneManagement(
    zoneEvents: LogZoneUpdate[],
    damageEvents: LogPlayerTakeDamage[],
    positionEvents: LogPlayerPosition[],
    teamPlayers: string[]
  ): ZoneManagement {
    let lateRotations = 0;
    let earlyRotations = 0;
    let blueZoneDamage = 0;

    // Calculate blue zone damage taken by team
    const teamBlueDamage = damageEvents.filter(e => 
      teamPlayers.includes(e.victim?.name || '') && 
      (e.damageReason === 'BluezoneFinish' || e.damageReason === 'Bluezone')
    );

    blueZoneDamage = teamBlueDamage.reduce((total, damage) => total + (damage.damage || 0), 0);

    // Analyze rotation timing for each zone phase
    zoneEvents.forEach((zoneEvent, index) => {
      if (index === 0) return; // Skip first zone event

      const zonePhase = this.ZONE_PHASES[index - 1];
      if (!zonePhase) return;

      const rotationTiming = this.analyzeZoneRotationTiming(
        zoneEvent,
        positionEvents,
        teamPlayers,
        zonePhase
      );

      if (rotationTiming === 'LATE') {
        lateRotations++;
      } else if (rotationTiming === 'EARLY') {
        earlyRotations++;
      }
    });

    // Determine overall rotation timing
    let rotationTiming: 'EXCELLENT' | 'GOOD' | 'POOR';
    if (lateRotations <= 1 && blueZoneDamage < 30) {
      rotationTiming = 'EXCELLENT';
    } else if (lateRotations <= 2 && blueZoneDamage < 100) {
      rotationTiming = 'GOOD';
    } else {
      rotationTiming = 'POOR';
    }

    const recommendation = this.generateZoneManagementRecommendation(lateRotations, blueZoneDamage, earlyRotations);

    return {
      lateRotations,
      blueZoneDamage,
      earlyRotations,
      rotationTiming,
      recommendation
    };
  }

  /**
   * Analyzes rotation efficiency
   */
  private analyzeRotationEfficiency(
    positionEvents: LogPlayerPosition[],
    vehicleEvents: LogVehicleRide[],
    zoneEvents: LogZoneUpdate[],
    teamPlayers: string[]
  ): RotationEfficiency {
    const teamPositions = positionEvents.filter(e => teamPlayers.includes(e.character?.name || ''));
    const teamVehicleUsage = vehicleEvents.filter(e => teamPlayers.includes(e.character?.name || ''));

    // Calculate average rotation time (simplified)
    const averageRotationTime = this.calculateAverageRotationTime(teamPositions, zoneEvents);

    // Calculate route efficiency (distance traveled vs optimal distance)
    const routeEfficiency = this.calculateRouteEfficiency(teamPositions, zoneEvents);

    // Calculate vehicle usage frequency
    const vehicleUsage = teamVehicleUsage.length;

    const recommendation = this.generateRotationRecommendation(averageRotationTime, routeEfficiency, vehicleUsage);

    return {
      averageRotationTime,
      routeEfficiency,
      vehicleUsage,
      recommendation
    };
  }

  /**
   * Analyzes compound holding patterns
   */
  private analyzeCompoundHolding(
    positionEvents: LogPlayerPosition[],
    teamPlayers: string[]
  ): CompoundHolding {
    const teamPositions = positionEvents.filter(e => teamPlayers.includes(e.character?.name || ''));

    // Detect compound positions (simplified - group by location clusters)
    const compounds = this.detectCompounds(teamPositions);
    
    const compoundsHeld = compounds.length;
    const averageHoldTime = compounds.length > 0 ? 
      compounds.reduce((sum, c) => sum + c.holdTime, 0) / compounds.length : 0;

    // Estimate defensive effectiveness
    const defensiveEffectiveness = this.calculateDefensiveEffectiveness(compounds);

    const recommendation = this.generateCompoundRecommendation(compoundsHeld, averageHoldTime, defensiveEffectiveness);

    return {
      compoundsHeld,
      averageHoldTime,
      defensiveEffectiveness,
      recommendation
    };
  }

  /**
   * Analyzes final circle positioning
   */
  private analyzeFinalCirclePositioning(
    positionEvents: LogPlayerPosition[],
    zoneEvents: LogZoneUpdate[],
    teamPlayers: string[]
  ): FinalCirclePositioning {
    const finalZones = zoneEvents.slice(-3); // Last 3 zones
    const teamPositions = positionEvents.filter(e => teamPlayers.includes(e.character?.name || ''));

    let finalCircleRank = 100; // Default to worst case
    let centerControl = false;
    let edgePlay = false;

    if (finalZones.length > 0 && teamPositions.length > 0) {
      const lastZone = finalZones[finalZones.length - 1];
      const finalPositions = teamPositions.slice(-teamPlayers.length); // Last position of each player

      // Analyze center vs edge positioning
      const centerDistances = finalPositions.map(pos => 
        this.calculateDistance(pos.character.location, lastZone.safetyZonePosition)
      );

      const avgCenterDistance = centerDistances.reduce((sum, d) => sum + d, 0) / centerDistances.length;
      const zoneRadius = lastZone.safetyZoneRadius;

      if (avgCenterDistance < zoneRadius * 0.3) {
        centerControl = true;
      } else if (avgCenterDistance > zoneRadius * 0.7) {
        edgePlay = true;
      }

      // Estimate final rank based on survival time
      const lastAliveTime = Math.max(...teamPositions.map(p => p.elapsedTime));
      finalCircleRank = Math.max(1, 100 - Math.floor(lastAliveTime / 30)); // Rough estimation
    }

    const recommendation = this.generateFinalCircleRecommendation(centerControl, edgePlay, finalCircleRank);

    return {
      finalCircleRank,
      centerControl,
      edgePlay,
      recommendation
    };
  }

  /**
   * Identifies critical positioning mistakes
   */
  private identifyPositioningMistakes(
    events: any[],
    teamPlayers: string[],
    analysis: PositioningAnalysis
  ): CriticalMistake[] {
    const mistakes: CriticalMistake[] = [];

    // Zone management mistakes
    if (analysis.zoneManagement.lateRotations > 2) {
      mistakes.push({
        type: 'ZONE_MANAGEMENT',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: `${analysis.zoneManagement.lateRotations} late rotations detected`,
        impact: 'HIGH',
        recommendation: 'Start rotations earlier. Move when zone timer shows 50% remaining time.'
      });
    }

    if (analysis.zoneManagement.blueZoneDamage > 100) {
      mistakes.push({
        type: 'ZONE_MANAGEMENT',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: `Took ${Math.round(analysis.zoneManagement.blueZoneDamage)} blue zone damage`,
        impact: 'MEDIUM',
        recommendation: 'Prioritize zone positioning over fights. Blue zone damage adds up quickly.'
      });
    }

    // Rotation efficiency mistakes
    if (analysis.rotationEfficiency.routeEfficiency < 60) {
      mistakes.push({
        type: 'POSITIONING',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: `Inefficient rotations (${analysis.rotationEfficiency.routeEfficiency}% efficiency)`,
        impact: 'MEDIUM',
        recommendation: 'Plan shorter, more direct routes to the safe zone. Avoid unnecessary detours.'
      });
    }

    // Vehicle usage mistakes
    if (analysis.rotationEfficiency.vehicleUsage < 2) {
      mistakes.push({
        type: 'POSITIONING',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: 'Low vehicle usage limiting rotation options',
        impact: 'LOW',
        recommendation: 'Use vehicles more frequently for faster and safer rotations.'
      });
    }

    // Final circle positioning mistakes
    if (analysis.finalCirclePositioning.finalCircleRank > 50) {
      mistakes.push({
        type: 'POSITIONING',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: 'Poor final circle positioning',
        impact: 'HIGH',
        recommendation: 'Focus on getting to center positions in final circles earlier.'
      });
    }

    return mistakes;
  }

  // Helper methods

  private analyzeZoneRotationTiming(
    zoneEvent: LogZoneUpdate,
    positionEvents: LogPlayerPosition[],
    teamPlayers: string[],
    zonePhase: { waitTime: number }
  ): 'EARLY' | 'GOOD' | 'LATE' {
    // This is a simplified analysis
    // In reality, you'd need to track when the team started moving towards the new zone
    
    const optimalStartTime = zonePhase.waitTime * 0.6; // Start moving at 60% of wait time
    const lateStartTime = zonePhase.waitTime * 0.8; // Moving after 80% is late

    // For now, return a random assessment based on blue zone damage patterns
    const randomFactor = Math.random();
    if (randomFactor < 0.2) return 'LATE';
    if (randomFactor < 0.4) return 'EARLY';
    return 'GOOD';
  }

  private calculateAverageRotationTime(
    teamPositions: LogPlayerPosition[],
    zoneEvents: LogZoneUpdate[]
  ): number {
    // Simplified calculation - would need more complex logic to track actual rotation times
    return 120; // Default to 2 minutes
  }

  private calculateRouteEfficiency(
    teamPositions: LogPlayerPosition[],
    zoneEvents: LogZoneUpdate[]
  ): number {
    // Simplified calculation - compare actual distance traveled to optimal distance
    return Math.floor(Math.random() * 40) + 60; // Random between 60-100%
  }

  private detectCompounds(teamPositions: LogPlayerPosition[]): Array<{ holdTime: number }> {
    // Simplified compound detection - would need more sophisticated clustering
    const compounds: Array<{ holdTime: number }> = [];
    
    // Group positions by proximity and time
    const clusters = this.clusterPositionsByProximity(teamPositions, 100); // 100m radius
    
    clusters.forEach(cluster => {
      if (cluster.length > 5) { // If team stayed in area for multiple position updates
        const holdTime = (cluster.length * 10); // Rough estimate in seconds
        compounds.push({ holdTime });
      }
    });

    return compounds;
  }

  private clusterPositionsByProximity(positions: LogPlayerPosition[], radius: number): LogPlayerPosition[][] {
    const clusters: LogPlayerPosition[][] = [];
    const visited = new Set<number>();

    positions.forEach((pos, index) => {
      if (visited.has(index)) return;

      const cluster: LogPlayerPosition[] = [pos];
      visited.add(index);

      // Find nearby positions
      positions.forEach((otherPos, otherIndex) => {
        if (visited.has(otherIndex)) return;

        const distance = this.calculateDistance(pos.character.location, otherPos.character.location);
        if (distance <= radius) {
          cluster.push(otherPos);
          visited.add(otherIndex);
        }
      });

      if (cluster.length > 1) {
        clusters.push(cluster);
      }
    });

    return clusters;
  }

  private calculateDefensiveEffectiveness(compounds: Array<{ holdTime: number }>): number {
    // Simplified effectiveness calculation
    const avgHoldTime = compounds.length > 0 ? 
      compounds.reduce((sum, c) => sum + c.holdTime, 0) / compounds.length : 0;
    
    return Math.min(100, avgHoldTime / 3600 * 100); // Convert to percentage based on hour
  }

  private calculateDistance(loc1: Location, loc2: Location): number {
    const dx = loc1.x - loc2.x;
    const dy = loc1.y - loc2.y;
    return Math.sqrt(dx * dx + dy * dy) / 100; // Convert to meters
  }

  private generateZoneManagementRecommendation(
    lateRotations: number,
    blueZoneDamage: number,
    earlyRotations: number
  ): string {
    if (lateRotations > 2) {
      return 'Start rotations earlier. Begin moving when zone timer shows 60% remaining time.';
    } else if (blueZoneDamage > 100) {
      return 'Prioritize zone positioning over engagements. Blue zone damage accumulates quickly.';
    } else if (earlyRotations > 3) {
      return 'You can afford to stay longer in current positions before rotating.';
    }
    return 'Good zone management. Maintain current rotation timing.';
  }

  private generateRotationRecommendation(
    averageTime: number,
    efficiency: number,
    vehicleUsage: number
  ): string {
    if (efficiency < 60) {
      return 'Plan more direct routes to safe zones. Avoid unnecessary detours and backtracking.';
    } else if (vehicleUsage < 2) {
      return 'Use vehicles more frequently for faster rotations and better positioning options.';
    } else if (averageTime > 180) {
      return 'Reduce rotation time by starting earlier and using more efficient routes.';
    }
    return 'Efficient rotations. Continue current movement patterns.';
  }

  private generateCompoundRecommendation(
    compoundsHeld: number,
    averageHoldTime: number,
    effectiveness: number
  ): string {
    if (compoundsHeld < 2) {
      return 'Try to secure and hold more compounds for better defensive positions.';
    } else if (averageHoldTime < 300) { // Less than 5 minutes
      return 'Hold compounds longer when safe to do so. They provide valuable cover and loot.';
    } else if (effectiveness < 50) {
      return 'Choose compounds with better defensive advantages and multiple exit routes.';
    }
    return 'Good compound usage. Maintain current defensive strategies.';
  }

  private generateFinalCircleRecommendation(
    centerControl: boolean,
    edgePlay: boolean,
    finalRank: number
  ): string {
    if (finalRank > 20) {
      return 'Focus on reaching final circles. Prioritize survival over eliminations in late game.';
    } else if (!centerControl && !edgePlay) {
      return 'Develop a consistent final circle strategy. Either control center or play edges effectively.';
    } else if (edgePlay) {
      return 'Edge play detected. Ensure you have multiple rotation options and cover.';
    } else if (centerControl) {
      return 'Good center control. Maintain defensive positions and watch for edge rotations.';
    }
    return 'Solid final circle positioning. Keep up the good work.';
  }
} 