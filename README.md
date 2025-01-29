# PUBG Tracker Bot

A Discord bot built with TypeScript that tracks PUBG (PlayerUnknown's Battlegrounds) players and provides real-time statistics and match updates. The bot monitors player matches and automatically posts updates to your Discord server.

## Features

- Real-time match tracking and monitoring
- Player statistics and performance metrics
- Automatic match updates posted to Discord channels
- MongoDB integration for data persistence
- Docker support for easy deployment
- TypeScript-based codebase with strong typing
- Comprehensive error handling and logging
- Integration and unit testing support

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v16 or higher)
- npm (Node Package Manager)
- MongoDB database
- Discord bot token and application
- PUBG Developer API key
- Docker and Docker Compose (optional, for containerized deployment)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/pubg-tracker-bot.git
cd pubg-tracker-bot
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CHANNEL_ID=your_discord_channel_id
PUBG_API_KEY=your_pubg_api_key
PUBG_API_URL=https://api.pubg.com/shards/
DEFAULT_SHARD=steam
MONGODB_URI=your_mongodb_connection_string
```

### Required Keys and Setup

- **Discord Bot Setup**:
  1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
  2. Create a new application
  3. Go to the "Bot" section and create a bot
  4. Copy the bot token and client ID
  5. Enable necessary bot permissions (Send Messages, Read Message History, etc.)
  6. Use the OAuth2 URL generator to invite the bot to your server

- **Discord Channel ID**:
  1. Enable Developer Mode in Discord (User Settings > App Settings > Advanced)
  2. Right-click the desired channel and select "Copy ID"

- **PUBG API Key**:
  1. Visit [PUBG Developer Portal](https://developer.pubg.com/)
  2. Create an account and generate an API key
  3. Make sure to select the appropriate platform shard (e.g., 'steam')

## Running the Bot

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up --build
```

## Available Scripts

- `npm start` - Run the compiled bot
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run the bot in development mode with hot reload
- `npm test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:integration` - Run integration tests
- `npm run lint` - Run ESLint for code quality

## Project Structure

```
pubg-tracker-bot/
├── src/
│   ├── commands/     # Discord bot commands
│   ├── constants/    # Application constants
│   ├── data/        # Data models and repositories
│   ├── errors/      # Error handling and custom errors
│   ├── modules/     # Core application modules
│   ├── services/    # Service layer (Discord, PUBG API, etc.)
│   ├── tests/       # Test files
│   ├── types/       # TypeScript type definitions
│   ├── utils/       # Utility functions
│   └── index.ts     # Main entry point
├── docker/          # Docker configuration files
├── .env             # Environment variables
├── docker-compose.yml # Docker Compose configuration
├── Dockerfile       # Docker build configuration
├── package.json     # Project dependencies
└── tsconfig.json    # TypeScript configuration
```

## Key Dependencies

- `discord.js` - Discord bot framework
- `axios` - HTTP client for API requests
- `mongoose` - MongoDB object modeling
- `typescript` - Programming language
- `jest` - Testing framework
- `eslint` - Code linting
- `nodemon` - Development auto-reload

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Testing

The project includes both unit and integration tests:

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run tests in watch mode
npm run test:watch
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:
1. Check the existing issues in the GitHub repository
2. Create a new issue with a detailed description of your problem
3. Include relevant logs and environment details

## Security

Please do not commit your `.env` file or any sensitive credentials. The `.gitignore` file is configured to prevent this, but always double-check before committing.
