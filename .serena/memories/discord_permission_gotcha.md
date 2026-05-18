# Discord permission gotcha

A prior production failure was `DiscordAPIError[50001]: Missing Access` during `channel.send()` even though `DISCORD_CHANNEL_ID` was correct.

Root cause: effective Discord channel/category permissions for the bot were missing `View Channel` on the target `#pubg` channel. `Send Messages`, `Embed Links`, or `Read Message History` alone are not enough if the bot cannot view the channel.

When this class of issue returns:
- Check route/runtime assumptions against the live process first.
- Inspect the bot's resolved permissions with `permissionsFor(this.client.user)`.
- Surface effective permissions in errors/logging.
- The production-side fix is to enable `View Channel` plus the expected send/embed/read permissions on the actual target channel or inherited category.
- Startup should fail fast when Discord channel validation fails instead of letting monitoring continue with a broken destination.