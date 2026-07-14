# Discord channel permission gotcha

Discord delivery can fail with API code `50001` (`Missing Access`) or `50013` (`Missing Permissions`) even when `DISCORD_CHANNEL_ID` resolves to an existing channel.

## Required channel shape

- The configured destination must be a normal `GuildText` channel. Text-capable thread channels are intentionally rejected.
- Resolve effective permissions with `channel.permissionsFor(client.user)`; role-level settings alone can be misleading because category and channel overrides apply.
- The bot requires `ViewChannel`, `SendMessages`, and `EmbedLinks`. Diagnostic output also reports `SendMessagesInThreads` and `ReadMessageHistory` to make permission inheritance easier to understand.

## Current behavior

- `DiscordBotService.validateChannelAccess()` delegates to the same channel-resolution path used by message delivery.
- `MatchMonitorService.startMonitoring()` validates access before entering the monitoring loop and fails startup when the destination is unusable.
- Send failures are rethrown with bot, channel, guild, Discord error, and resolved-permission context.
- Integration coverage lives in `test/integration/match-monitoring-with-analysis.test.ts`.

When this issue returns, inspect the actual target channel and its inherited category permissions first. The production fix is normally to grant `View Channel`, `Send Messages`, and `Embed Links` to the bot role on the resolved channel/category.
