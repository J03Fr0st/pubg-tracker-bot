# PUBG Match Flow Testing Script

This script allows you to test the complete flow from player names and match ID to Discord posting, including telemetry analysis and enhanced embeds.

## Features

- 🎯 **Complete Flow Testing**: Tests the entire pipeline from match ID to Discord posting
- 🔍 **Telemetry Analysis**: Processes telemetry data for detailed match analysis
- 💬 **Discord Integration**: Sends enhanced embeds to Discord channels
- 🛡️ **Error Handling**: Graceful fallback when telemetry or other services fail
- 🔍 **Dry Run Mode**: Test processing without actually sending to Discord
- 📊 **Detailed Logging**: Comprehensive output showing all processing steps

## Prerequisites

1. **Environment Setup**: Ensure all required environment variables are set:
   ```bash
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_CHANNEL_ID=your_test_channel_id
   PUBG_API_KEY=your_pubg_api_key
   PUBG_SHARD=steam
   MONGODB_URI=your_mongodb_connection_string
   ```

2. **Dependencies**: Install all project dependencies:
   ```bash
   npm install
   ```

3. **MongoDB**: Ensure MongoDB is running and accessible

4. **Discord Bot**: Your Discord bot should be properly configured and have permissions to send messages to the target channel

## Usage

### Method 1: Direct TypeScript execution (Recommended)
```bash
npx ts-node scripts/test-match-flow.ts --matchId "your-match-id" --players "player1,player2"
```

### Method 2: Using npm script (may have argument parsing issues on some systems)
```bash
npm run test:match-flow -- --matchId "your-match-id" --players "player1,player2"
```

### Method 3: Using Node.js wrapper
```bash
node scripts/test-match-flow.js --matchId "your-match-id" --players "player1,player2"
```

## Command Line Options

| Option | Required | Description | Example |
|--------|----------|-------------|---------|
| `--matchId` | ✅ | PUBG match ID to analyze | `--matchId "12345678-1234-1234-1234-123456789012"` |
| `--players` | ✅ | Comma-separated list of player names | `--players "PlayerOne,PlayerTwo,PlayerThree"` |
| `--channelId` | ❌ | Discord channel ID (uses env default if not specified) | `--channelId "123456789012345678"` |
| `--shard` | ❌ | PUBG shard (defaults to 'steam') | `--shard "pc-na"` |
| `--dryRun` | ❌ | Process without sending to Discord | `--dryRun` |

## Examples

### Basic Test
```bash
npx ts-node scripts/test-match-flow.ts --matchId "12345678-1234-1234-1234-123456789012" --players "PlayerOne,PlayerTwo"
```

### Dry Run (No Discord Posting)
```bash
npx ts-node scripts/test-match-flow.ts --matchId "12345678-1234-1234-1234-123456789012" --players "PlayerOne" --dryRun
```

### Different Shard
```bash
npx ts-node scripts/test-match-flow.ts --matchId "12345678-1234-1234-1234-123456789012" --players "PlayerOne" --shard "pc-na"
```

### Custom Discord Channel
```bash
npx ts-node scripts/test-match-flow.ts --matchId "12345678-1234-1234-1234-123456789012" --players "PlayerOne" --channelId "987654321098765432"
```

## What the Script Does

1. **🔧 Initialization**
   - Validates environment configuration
   - Connects to MongoDB
   - Initializes Discord bot (unless in dry-run mode)

2. **🎮 Match Processing**
   - Fetches match details from PUBG API using the provided match ID
   - Extracts player statistics for all specified players
   - Identifies team composition and rankings

3. **📊 Telemetry Analysis** (if available)
   - Downloads telemetry data from PUBG
   - Processes events for tracked players
   - Calculates advanced statistics:
     - Kill chains and streaks
     - Damage dealt/taken analysis
     - Weapon usage patterns
     - Assist calculations
     - Timeline analysis

4. **💬 Discord Posting**
   - Creates enhanced Discord embeds with:
     - Match summary (map, mode, team rank)
     - Individual player statistics
     - Advanced telemetry insights (if available)
     - Fallback to basic stats if telemetry fails
   - Sends embeds to specified Discord channel

## Output Example

```
🚀 PUBG Match Flow Tester
==================================================
Match ID: 12345678-1234-1234-1234-123456789012
Players: PlayerOne, PlayerTwo
Shard: steam
Channel ID: 123456789012345678
Dry Run: No
==================================================

⚡ Initializing test environment...
ℹ️  Connecting to MongoDB...
✅ Connected to MongoDB
ℹ️  Initializing Discord bot...
✅ Discord bot initialized

ℹ️  Testing match processing for match ID: 12345678-1234-1234-1234-123456789012
ℹ️  Tracking players: PlayerOne, PlayerTwo

ℹ️  Fetching match details from PUBG API...
✅ Match summary created successfully!

📊 Match Summary:
   Match ID: 12345678-1234-1234-1234-123456789012
   Map: Erangel
   Game Mode: squad
   Played At: 2024-01-01T15:30:00.000Z
   Team Rank: 5
   Telemetry URL: Available
   Players Found: 2

   Player 1: PlayerOne
     Kills: 3
     Assists: 1
     DBNOs: 4
     Damage: 450
     Survival Time: 22m 15s
     Win Place: 5

   Player 2: PlayerTwo
     Kills: 1
     Assists: 2
     DBNOs: 2
     Damage: 280
     Survival Time: 22m 15s
     Win Place: 5

🎯 Telemetry Analysis:
   Total Events Processed: 1247
   Players Analyzed: 2

   🎮 PlayerOne:
     Kills: 3
     Knockdowns: 4
     Damage Dealt: 450
     Damage Taken: 120
     Weapons Used: 3
     Kill Chains: 1
       Chain 1: 2 kills in 45s
     Assists: 1

   🎮 PlayerTwo:
     Kills: 1
     Knockdowns: 2
     Damage Dealt: 280
     Damage Taken: 95
     Weapons Used: 2
     Assists: 2

ℹ️  Sending match summary to Discord channel: 123456789012345678
✅ Match summary sent to Discord successfully!

✅ Test completed successfully!
```

## Error Handling

The script includes comprehensive error handling:

- **Invalid Match ID**: Clear error message if match doesn't exist
- **Player Not Found**: Continues with found players, warns about missing ones
- **Telemetry Failure**: Falls back to basic match statistics
- **Discord Errors**: Reports posting failures without crashing
- **Network Issues**: Retries and graceful degradation

## Troubleshooting

### Common Issues

1. **"Required environment variable X is not set"**
   - Ensure all required environment variables are configured
   - Check your `.env` file exists and is properly formatted

2. **"Failed to create match summary - match may not exist or players not found"**
   - Verify the match ID is correct and recent
   - Ensure player names match exactly (case-sensitive)
   - Check if the match is from the correct shard

3. **"MongoDB connection failed"**
   - Ensure MongoDB is running
   - Check the `MONGODB_URI` environment variable
   - Verify network connectivity to your MongoDB instance

4. **"Discord initialization failed"**
   - Check `DISCORD_TOKEN` is valid
   - Ensure bot has proper permissions in the target channel
   - Verify `DISCORD_CLIENT_ID` matches your bot

### Getting Match IDs

You can get match IDs by:
1. Using the PUBG API to fetch recent matches for a player
2. Looking at existing processed matches in your MongoDB
3. Using PUBG third-party sites that show match IDs
4. Running your main bot and checking the logs for processed match IDs

### Testing with Real Data

For best results, use recent matches (within the last 14 days) as older matches may not have telemetry data available.

## Integration with Main Bot

This script uses the same services and logic as your main bot, so successful tests here indicate your production flow will work correctly. The script is particularly useful for:

- Testing new telemetry analysis features
- Debugging Discord embed formatting
- Validating match processing logic
- Performance testing with large telemetry datasets
