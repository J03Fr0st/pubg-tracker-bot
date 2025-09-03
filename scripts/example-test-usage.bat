@echo off
REM Example usage of the PUBG Match Flow Testing Script for Windows
REM
REM This file contains example commands for testing different scenarios
REM Copy and modify these examples for your own testing needs

echo PUBG Match Flow Testing Examples
echo ================================
echo.

REM Example 1: Basic test with dry run (recommended for first test)
echo Example 1: Dry run test (no Discord posting)
echo Command: npx ts-node scripts/test-match-flow.ts --matchId "your-match-id" --players "PlayerOne,PlayerTwo" --dryRun
echo.

REM Example 2: Full test with Discord posting
echo Example 2: Full test with Discord posting
echo Command: npx ts-node scripts/test-match-flow.ts --matchId "your-match-id" --players "PlayerOne,PlayerTwo"
echo.

REM Example 3: Single player test
echo Example 3: Single player test
echo Command: npm run test:match-flow -- --matchId "your-match-id" --players "PlayerOne"
echo.

REM Example 4: Different shard test
echo Example 4: Test with different shard
echo Command: npm run test:match-flow -- --matchId "your-match-id" --players "PlayerOne" --shard "pc-na"
echo.

REM Example 5: Custom Discord channel
echo Example 5: Test with custom Discord channel
echo Command: npm run test:match-flow -- --matchId "your-match-id" --players "PlayerOne" --channelId "123456789012345678"
echo.

echo To use these examples:
echo 1. Replace 'your-match-id' with an actual PUBG match ID
echo 2. Replace 'PlayerOne,PlayerTwo' with actual player names from that match
echo 3. Ensure your environment variables are properly configured
echo 4. Run the command in your terminal
echo.

echo Tips for getting match IDs:
echo - Use PUBG API to get recent matches for a player
echo - Check your MongoDB for previously processed matches
echo - Look at your bot logs for match IDs that have been processed
echo - Use PUBG tracking websites (they often show match IDs in URLs)

pause
