# PUBG Tracker Bot

A sophisticated Discord bot built with TypeScript that provides comprehensive PUBG (PlayerUnknown's Battlegrounds) match analysis, performance tracking, and AI-powered coaching recommendations. The bot automatically monitors player matches, performs detailed telemetry analysis, and delivers strategic insights to help players improve their gameplay.

## 🚀 Key Features

### 🎯 Advanced Match Analysis
- **Real-time Match Monitoring** - Automatic detection and processing of new matches
- **Comprehensive Telemetry Analysis** - Deep dive into match data with strategic insights
- **Performance Scoring** - 0-100 scoring system across multiple categories
- **Critical Mistake Identification** - Pinpoint high-impact errors with specific fixes
- **Strategic Recommendations** - Priority-based advice for immediate and long-term improvement

### 🧠 AI-Powered Coaching System
- **Personalized Coaching Tips** - Tailored recommendations based on individual performance
- **Categorized Improvement Plans** - Immediate, short-term, and long-term development paths
- **Difficulty-Based Learning** - Easy, medium, and hard skill development tracks
- **Role-Specific Analysis** - Individual player contribution assessment

### 📊 Detailed Performance Analytics
- **Engagement Analysis** - Combat effectiveness, weapon optimization, positioning strategies
- **Zone Management** - Rotation timing, blue zone damage analysis, path efficiency
- **Team Coordination** - Revive efficiency, spacing analysis, communication effectiveness
- **Weapon Effectiveness** - Kill/shot ratios, optimal range analysis, loadout recommendations

### 🎮 Discord Integration
- **Slash Commands** - Easy-to-use Discord commands for bot management
- **Rich Embeds** - Beautiful, detailed match summaries with color-coded performance
- **Automatic Analysis** - Seamless integration with match monitoring for instant insights
- **Multi-Category Reports** - Comprehensive breakdowns across all performance areas

## 🎯 Analysis Capabilities

### What the Bot Analyzes
- ✅ **Positioning Patterns** - Zone management, rotation efficiency, compound holding
- ✅ **Combat Effectiveness** - Engagement outcomes, weapon performance, range optimization
- ✅ **Team Coordination** - Revive success rates, spacing, communication indicators
- ✅ **Decision Making** - Timing patterns, strategic choices, risk assessment
- ✅ **Resource Management** - Looting efficiency, healing management, throwable usage
- ✅ **Third-Party Detection** - Multi-team encounter analysis and vulnerability assessment

### Performance Scoring System (0-100)
- **90-100**: Excellent performance - Minor optimizations only
- **80-89**: Good performance with minor improvement areas
- **70-79**: Average performance with clear development opportunities
- **60-69**: Below average - Requires focused attention
- **<60**: Poor performance - Significant improvement needed

## 🎮 Discord Commands

The bot supports the following slash commands:

- `/add playername:YourPlayerName` - Add a PUBG player to monitoring list
- `/remove playername:YourPlayerName` - Remove a player from monitoring
- `/list` - Display all currently monitored players
- `/removelastmatch` - Remove the last processed match from tracking

### How Automatic Analysis Works

1. **Add Players**: Use `/add` command to start monitoring players
2. **Automatic Detection**: Bot detects new matches for monitored players
3. **Telemetry Analysis**: Comprehensive analysis runs automatically on new matches
4. **Discord Results**: Detailed analysis embeds sent to Discord automatically

## 📋 Prerequisites

Before you begin, ensure you have the following:
- Node.js (v16 or higher)
- npm (Node Package Manager)
- MongoDB database
- Discord bot token and application
- PUBG Developer API key
- Docker and Docker Compose (optional, for containerized deployment)

## 🛠️ Installation

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

## ⚙️ Configuration

### Environment Variables

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

**⚠️ Security Note**: Never commit your `.env` file or sensitive credentials to version control.

#### Required Keys and Setup

- **Discord Bot Setup**:
  1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
  2. Create a new application and bot, copy the token and client ID
  3. Enable necessary bot permissions (Send Messages, Read Message History, Use Slash Commands)
  4. Use the OAuth2 URL generator to invite the bot to your server
- **Discord Channel ID**:
  1. Enable Developer Mode in Discord (User Settings > Advanced)
  2. Right-click the desired channel and select "Copy ID"
- **PUBG API Key**:
  1. Visit [PUBG Developer Portal](https://developer.pubg.com/)
  2. Create an account and generate an API key
  3. Select the appropriate platform shard (e.g., 'steam')

## 🚀 Running the Bot

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

2. Run in detached mode:
```bash
docker-compose up --build -d
```

3. Stop the container:
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

### Viewing Logs

```bash
# Using Docker Compose
docker-compose logs -f

# Using Docker directly
docker logs -f pubg-tracker-bot
```

## 📁 Project Structure

```
pubg-tracker-bot/
├── src/
│   ├── config/               # Configuration files
│   ├── constants/            # Application constants and mappings
│   ├── data/                 # Data models and repositories
│   │   ├── models/           # MongoDB data models
│   │   └── repositories/     # Data access layer
│   ├── services/             # Core business logic
│   │   ├── analyzers/        # Specialized analysis services
│   │   ├── coaching-tips.service.ts      # AI coaching system
│   │   ├── discord-bot.service.ts        # Discord integration
│   │   ├── match-monitor.service.ts      # Match monitoring
│   │   ├── pubg-api.service.ts          # PUBG API client
│   │   ├── pubg-storage.service.ts      # Database operations
│   │   └── telemetry-analyzer.service.ts # Match analysis engine
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Utility functions and helpers
│   └── index.ts              # Main entry point
├── test/                     # Test files
│   ├── integration/          # Integration tests
│   └── unit/                 # Unit tests
├── docker-compose.yml        # Docker Compose configuration
├── Dockerfile               # Docker build configuration
├── package.json             # Project dependencies and scripts
└── tsconfig.json            # TypeScript configuration
```

## 🔧 Key Dependencies

- **discord.js** (v14.16.3) - Discord bot framework with slash command support
- **typescript** (v5.6.3) - Programming language with strong typing
- **jest** (v29.7.0) - Testing framework for unit and integration tests
- **nodemon** (v3.1.7) - Development auto-reload for faster iteration

## 🧪 Testing

The project includes comprehensive testing with both unit and integration tests following best practices:

```bash
# Run unit tests
npm test

# Run integration tests  
npm run test:integration

# Run tests in watch mode
npm run test:watch

# Run formatting/import checks and typechecking
npm run check:all
```

### Testing Guidelines
- **Unit Tests**: Follow Arrange-Act-Assert convention
- **Integration Tests**: Use Given-When-Then approach
- **Coverage**: Aim for comprehensive test coverage of core functionality
- **Test Data**: Use realistic PUBG match data for accurate testing

## 📈 Analysis Output Examples

### Match Summary Response
When a new match is detected, the bot automatically sends detailed analysis including:

1. **Overview Embed** - Match details, team performance, combat summary
2. **Player Performance** - Individual stats with kill/knock details and 2D replay links
3. **Critical Mistakes** - High-impact errors with specific improvement recommendations
4. **Strategic Analysis** - Engagement, positioning, and team coordination breakdowns
5. **Coaching Tips** - Personalized improvement plans categorized by timeframe and difficulty

### Performance Categories Analyzed
- **Positioning Score** (0-100) - Zone management, rotation timing, compound holding
- **Engagement Score** (0-100) - Combat effectiveness, weapon choice, range optimization
- **Teamwork Score** (0-100) - Coordination, revives, communication indicators
- **Decision Making Score** (0-100) - Strategic choices, timing, risk assessment

## 🚀 Versioning and Releases

This project uses automated semantic versioning with GitHub Actions for CI/CD:

```bash
# Create patch release (bug fixes)
npm run release:patch

# Create minor release (new features)  
npm run release:minor

# Create major release (breaking changes)
npm run release:major
```

### Docker Images
Production-ready Docker images are automatically built and published:

```bash
# Latest stable release
docker pull your-username/pubg-tracker-bot:latest

# Specific version
docker pull your-username/pubg-tracker-bot:v1.2.0

# Development builds
docker pull your-username/pubg-tracker-bot:dev
```

For detailed release information, see [VERSIONING.md](VERSIONING.md).

## 📚 Additional Documentation

- **[Development Roadmap](DEVELOPMENT_ROADMAP.md)** - Planned features and implementation timeline
- **[Telemetry Analyzer Guide](TELEMETRY_ANALYZER_GUIDE.md)** - Detailed analysis system documentation
- **[Telemetry Analyzer Summary](TELEMETRY_ANALYZER_SUMMARY.md)** - Implementation overview and capabilities
- **[Docker Guide](DOCKER_GUIDE.md)** - Comprehensive Docker deployment instructions
- **[Versioning Guide](VERSIONING.md)** - Release process and version management

## 🎯 Usage Best Practices

### For Optimal Analysis Results
1. **Monitor Active Players** - Add players who play regularly for consistent data
2. **Analyze Recent Matches** - PUBG telemetry data expires after ~14 days
3. **Include Full Teams** - Add all squad members for accurate team coordination analysis
4. **Review Regularly** - Check analysis results weekly for consistent improvement tracking

### Interpreting Analysis Results
- **Prioritize HIGH Impact Recommendations** - Focus on these first for maximum improvement
- **Start with IMMEDIATE Category Tips** - Quick wins that can be applied in the next game
- **Track Progress Over Time** - Monitor improvement in specific categories across multiple matches
- **Address Consistent Weaknesses** - Focus on patterns that appear across multiple matches

## 🤝 Contributing

We welcome contributions to improve the PUBG Tracker Bot! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the TypeScript coding standards defined in `.cursorrules`
4. Write comprehensive tests for new features
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines
- Follow existing TypeScript patterns and naming conventions
- Implement unit tests for all new services and functions
- Add integration tests for new Discord commands or API endpoints
- Update documentation for new features
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Troubleshooting

### Common Issues
- **Bot Not Responding**: Check Discord token and permissions
- **No Match Data**: Verify PUBG API key and player names
- **Database Errors**: Ensure MongoDB connection string is correct
- **Analysis Not Working**: Check that telemetry URLs are accessible

### Getting Help
1. Check existing issues in the GitHub repository
2. Review the documentation files for detailed guides
3. Create a new issue with:
   - Detailed description of the problem
   - Relevant logs and error messages
   - Environment details (Node.js version, OS, etc.)
   - Steps to reproduce the issue

## 🔒 Security

- **Environment Variables**: Never commit `.env` files or sensitive credentials
- **Production Deployment**: Use Docker secrets or secure environment variable management
- **API Keys**: Regularly rotate PUBG API keys and Discord tokens
- **Updates**: Keep dependencies updated to patch security vulnerabilities
- **Access Control**: Limit Discord bot permissions to only what's necessary

---

**Transform your PUBG gameplay with AI-powered analysis and coaching!** 🎮🚀
