/**
 * Utility for generating consistent colors for Discord embeds based on match ID
 */
export class MatchColorUtil {
  /**
   * Generates a consistent color for a match based on its ID
   * @param matchId The match ID to generate a color for
   * @returns A color number suitable for Discord embeds
   */
  public static generateMatchColor(matchId: string): number {
    // Convert matchId to a number by summing char codes
    const seed = matchId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // List of vibrant colors that look good in Discord
    const colors = [
      0x3498db, // Blue
      0xe74c3c, // Red
      0x2ecc71, // Green
      0xf1c40f, // Yellow
      0x9b59b6, // Purple
      0xe67e22, // Orange
      0x1abc9c, // Turquoise
      0xd35400, // Pumpkin
      0x34495e, // Navy
      0x16a085, // Green Sea
      0x8e44ad, // Wisteria
      0x2980b9, // Belize Hole
      0xc0392b, // Pomegranate
      0x27ae60  // Nephritis
    ];

    // Use the seed to consistently select a color
    return colors[seed % colors.length];
  }

  /**
   * Gets placement-based color (for ranking displays)
   * @param rank Team placement rank
   * @returns A color number based on placement performance
   */
  public static getPlacementColor(rank?: number): number {
    if (!rank) return 0x36393F; // Discord dark theme color
    if (rank === 1) return 0xFFD700; // Gold
    if (rank <= 3) return 0xC0C0C0; // Silver
    if (rank <= 10) return 0xCD7F32; // Bronze
    return 0x36393F; // Default dark color
  }
} 