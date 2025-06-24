# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm run dev` - Start development server with auto-reload using nodemon
- `npm run build` - Compile TypeScript to JavaScript (outputs to `dist/`)
- `npm start` - Run the production build
- `npm run lint` - Run ESLint for code quality checks
- `npm test` - Run unit tests with Jest
- `npm run test:integration` - Run integration tests
- `npm run test:watch` - Run tests in watch mode for development

### Release Commands
- `npm run release:patch` - Create patch release (bug fixes)
- `npm run release:minor` - Create minor release (new features)  
- `npm run release:major` - Create major release (breaking changes)

## Architecture Overview

This is a Discord bot that monitors PUBG matches and posts real-time updates to Discord channels. The application follows a service-oriented architecture:

### Core Services
- **MatchMonitorService** (`src/services/match-monitor.service.ts`) - Main orchestrator that continuously polls for new matches
- **PubgApiService** (`src/services/pubg-api.service.ts`) - Handles all PUBG API interactions with rate limiting
- **DiscordBotService** (`src/services/discord-bot.service.ts`) - Manages Discord bot interactions and slash commands
- **PubgStorageService** (`src/services/pubg-storage.service.ts`) - Database operations for player and match data

### Data Layer
- **Models** (`src/data/models/`) - Mongoose schemas for MongoDB
  - `player.model.ts` - Tracked players
  - `match.model.ts` - Match data
  - `processed-match.model.ts` - Tracks processed matches to avoid duplicates
- **Repositories** (`src/data/repositories/`) - Data access layer abstractions

### Configuration & Types
- **Configuration** (`src/config/config.ts`) - Environment-based configuration with validation
- **Types** (`src/types/`) - TypeScript definitions for PUBG API responses and internal data structures
- **Constants** (`src/constants/pubg-mappings.ts`) - Maps PUBG codes to human-readable names

### Entry Point
The application starts in `src/index.ts` which:
1. Validates configuration
2. Connects to MongoDB
3. Initializes all services with dependency injection
4. Sets up graceful shutdown handlers
5. Starts the match monitoring loop

## Environment Configuration

Required environment variables:
```
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id  
DISCORD_CHANNEL_ID=your_discord_channel_id
PUBG_API_KEY=your_pubg_api_key
PUBG_SHARD=steam (default)
MONGODB_URI=your_mongodb_connection_string
```

Optional environment variables:
```
PUBG_MAX_REQUESTS_PER_MINUTE=10 (default)
CHECK_INTERVAL_MS=60000 (default)
MAX_MATCHES_TO_PROCESS=5 (default)
```

## Key Design Patterns

### Service Dependencies
Services are injected through constructor parameters, making testing easier:
- MatchMonitorService depends on PubgApiService, PubgStorageService, and DiscordBotService
- Each service handles its own domain concerns

### Rate Limiting
The RateLimiter utility (`src/utils/rate-limiter.ts`) prevents API rate limit violations using a token bucket algorithm.

### Error Handling
- Comprehensive error handling at service boundaries
- Structured logging with different log levels (startup, database, discord, monitor, error, shutdown)
- Graceful shutdown handling for cleanup

### Discord Integration
- Uses Discord.js v14 with slash commands
- Rich embeds for match summaries with color-coded messages
- Detailed match statistics including telemetry data for kills/knockdowns

## Testing Structure

- **Unit Tests** (`test/unit/`) - Test individual components in isolation
- **Integration Tests** (`test/integration/`) - Test service interactions
- Uses Jest with ts-jest for TypeScript support
- Tests follow Arrange-Act-Assert pattern for unit tests
- Integration tests use Given-When-Then convention

## Docker Support

The project includes Docker support with:
- Multi-stage Dockerfile for optimized production builds
- docker-compose.yml for local development with MongoDB
- Automated CI/CD pipeline for Docker image publishing

## Important Notes

- The application uses MongoDB for persistence - ensure database connectivity before startup
- PUBG API has rate limits - monitor the rate limiter logs if experiencing issues
- Match processing is throttled to prevent overwhelming the Discord API
- All sensitive data should be provided via environment variables, never hardcoded