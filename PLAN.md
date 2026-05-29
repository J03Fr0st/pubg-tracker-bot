# Project Plan: DINNR PUBG Analytics

DINNR aims to provide PUBG players with actionable insights similar to services like [PUBG Lookup](https://pubglookup.com). Below is a high-level plan for desired features and development steps.

## Core Features
- **Player Search & Profiles**: Search for players by name and view an overview of lifetime and season stats (rating, K/D, wins, accuracy).
- **Match History**: List recent matches with filters for game mode, map, and date. Each match should link to detailed stats.
- **Detailed Match Reports**: For every match show damage dealt/received, kills, survival time, teammates, and round timeline.
- **Weapon & Equipment Stats**: Break down performance by weapon type, including accuracy, damage, headshot %, and most-used weapons.
- **Map Heatmaps**: Visualize kill locations, death locations, landing spots, and loot routes on interactive maps.
- **Leaderboards**: Global and friends leaderboards for metrics like kills, damage, and win rate.
- **Season Tracking**: Track progress over current and past seasons with graphs for rank and performance trends.
- **Squad Analysis Tools**: Compare teammates, highlight synergy stats, and recommend optimal squad compositions.
- **Data Export/Share**: Allow users to export reports or share match links with friends.

## Technical Considerations
- Integrate with the official PUBG API for player and match data.
- Store telemetry and derived metrics in a database optimized for analytics queries.
- Frontend built with a modern JS framework for interactive charts and maps.
- Backend services for ingesting telemetry, caching data, and serving API requests.

## Next Steps
1. Research PUBG API endpoints and rate limits.
2. Design database schema for players, matches, and telemetry events.
3. Prototype player search and basic match history page.
4. Implement data ingestion pipeline for telemetry.
5. Add visualization components (charts, heatmaps).

This plan can evolve as we validate features with users and iterate on feedback.
