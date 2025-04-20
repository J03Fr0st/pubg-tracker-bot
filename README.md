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

### Environment Variables

The application requires several environment variables. You can provide them in a `.env` file in the root directory or directly in your deployment configuration.

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CHANNEL_ID=your_discord_channel_id
PUBG_API_KEY=your_pubg_api_key
PUBG_API_URL=https://api.pubg.com/shards/
DEFAULT_SHARD=steam
MONGODB_URI=your_mongodb_connection_string
```

- **Never commit your `.env` file or sensitive credentials to version control.**
- For production, consider using Docker secrets or a secure environment variable management system.

#### Required Keys and Setup

- **Discord Bot Setup**:
  1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
  2. Create a new application and bot, copy the token and client ID
  3. Enable necessary bot permissions (Send Messages, Read Message History, etc.)
  4. Use the OAuth2 URL generator to invite the bot to your server
- **Discord Channel ID**:
  1. Enable Developer Mode in Discord (User Settings > Advanced)
  2. Right-click the desired channel and select "Copy ID"
- **PUBG API Key**:
  1. Visit [PUBG Developer Portal](https://developer.pubg.com/)
  2. Create an account and generate an API key
  3. Select the appropriate platform shard (e.g., 'steam')

## Running the Bot

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Docker Deployment (Recommended)

1. Build and start the container:
```bash
docker-compose up --build
```
2. To run in detached mode:
```bash
docker-compose up --build -d
```
3. To stop the container:
```bash
docker-compose down
```

#### Using Docker Directly

1. Build the Docker image:
```bash
docker build -t pubg-tracker-bot .
```
2. Run the container:
```bash
docker run -d --name pubg-tracker-bot \
  -e DISCORD_TOKEN=your_discord_bot_token \
  -e DISCORD_CLIENT_ID=your_discord_client_id \
  -e DISCORD_CHANNEL_ID=your_discord_channel_id \
  -e PUBG_API_KEY=your_pubg_api_key \
  -e PUBG_API_URL=https://api.pubg.com/shards/ \
  -e DEFAULT_SHARD=steam \
  -e MONGODB_URI=your_mongodb_connection_string \
  --restart unless-stopped \
  pubg-tracker-bot
```
3. To stop and remove the container:
```bash
docker stop pubg-tracker-bot
docker rm pubg-tracker-bot
```

### Viewing Logs

```bash
# Using Docker Compose
docker-compose logs
# Using Docker directly
docker logs pubg-tracker-bot
# To follow logs in real-time
docker-compose logs -f
docker logs -f pubg-tracker-bot
```

## Project Structure

```
pubg-tracker-bot/
├── src/
│   ├── commands/     # Discord bot commands
│   ├── constants/    # Application constants
│   ├── data/         # Data models and repositories
│   ├── errors/       # Error handling and custom errors
│   ├── modules/      # Core application modules
│   ├── services/     # Service layer (Discord, PUBG API, etc.)
│   ├── tests/        # Test files
│   ├── types/        # TypeScript type definitions
│   ├── utils/        # Utility functions
│   └── index.ts      # Main entry point
├── docker/           # Docker configuration files
├── .env              # Environment variables
├── docker-compose.yml # Docker Compose configuration
├── Dockerfile        # Docker build configuration
├── package.json      # Project dependencies
└── tsconfig.json     # TypeScript configuration
```

## Key Dependencies

- `discord.js` - Discord bot framework
- `axios` - HTTP client for API requests
- `mongoose` - MongoDB object modeling
- `typescript` - Programming language
- `jest` - Testing framework
- `eslint` - Code linting
- `nodemon` - Development auto-reload

## Testing

The project includes both unit and integration tests. Follow the Arrange-Act-Assert convention for unit tests and Given-When-Then for acceptance tests.

```bash
# Run unit tests
npm test
# Run integration tests
npm run test:integration
# Run tests in watch mode
npm run test:watch
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:
1. Check the existing issues in the GitHub repository
2. Create a new issue with a detailed description of your problem
3. Include relevant logs and environment details

## Security

- Never commit your `.env` file or any files containing sensitive information to version control.
- Use Docker secrets or a secure environment variable management system for production deployments.
- Regularly update the Docker image and dependencies to patch security vulnerabilities.
