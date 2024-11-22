# PUBG Tracker Bot

A Discord bot that tracks PUBG (PlayerUnknown's Battlegrounds) players and provides real-time statistics and match updates. The bot monitors player matches and automatically posts updates to your Discord server.

## Features

- Real-time match tracking
- Player statistics monitoring
- Automatic match updates in Discord
- MongoDB integration for data persistence
- TypeScript-based codebase

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v16 or higher)
- npm (Node Package Manager)
- MongoDB database
- Discord account and application
- PUBG Developer API key

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

1. Create a `.env` file in the root directory with the following variables:
```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_discord_channel_id
PUBG_API_KEY=your_pubg_api_key
PUBG_API_URL=https://api.pubg.com/shards/
DEFAULT_SHARD=steam
MONGODB_URI=your_mongodb_connection_string
```

### Getting the Required Keys

- **Discord Bot Token**:
  1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
  2. Create a new application
  3. Go to the "Bot" section
  4. Click "Add Bot" and copy the token

- **Discord Channel ID**:
  1. Enable Developer Mode in Discord (User Settings > App Settings > Advanced)
  2. Right-click the channel and select "Copy ID"

- **PUBG API Key**:
  1. Visit [PUBG Developer Portal](https://developer.pubg.com/)
  2. Create an account and generate an API key

## Running the Bot

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Available Scripts

- `npm start` - Run the compiled bot
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run the bot in development mode with hot reload
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Run ESLint
- `npm run test:integration` - Run integration tests

## Project Structure

```
pubg-tracker-bot/
├── src/
│   ├── commands/     # Bot commands
│   ├── data/        # Data models
│   ├── errors/      # Error handling
│   ├── modules/     # Core modules
│   ├── services/    # Services (Discord, PUBG API, etc.)
│   ├── tests/       # Test files
│   ├── types/       # TypeScript type definitions
│   ├── utils/       # Utility functions
│   └── index.ts     # Main entry point
├── .env             # Environment variables
├── package.json     # Project dependencies
└── tsconfig.json    # TypeScript configuration
```

## Contributing

1. Fork the repository
2. Create a new branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions, please open an issue in the GitHub repository.
