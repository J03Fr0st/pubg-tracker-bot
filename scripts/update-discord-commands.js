const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

// Define the commands (same as in DiscordBotService)
const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a PUBG player to monitor')
    .addStringOption((option) =>
      option
        .setName('playername')
        .setDescription('The PUBG player name to monitor')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a PUBG player from monitoring')
    .addStringOption((option) =>
      option
        .setName('playername')
        .setDescription('The PUBG player name to stop monitoring')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('list').setDescription('List all monitored PUBG players'),
  new SlashCommandBuilder()
    .setName('removelastmatch')
    .setDescription('Remove the last processed match from tracking'),
  new SlashCommandBuilder()
    .setName('removematch')
    .setDescription('Remove a specific processed match by matchId')
    .addStringOption((option) =>
      option
        .setName('matchid')
        .setDescription('The matchId of the match to remove')
        .setRequired(true)
    ),
].map(command => command.toJSON());

async function updateCommands() {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Started refreshing application (/) commands...');

    // Register global commands
    const data = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ Successfully reloaded ${data.length} global application (/) commands:`);
    data.forEach(cmd => {
      console.log(`   - /${cmd.name}: ${cmd.description}`);
    });

    // Also register guild-specific commands if DISCORD_GUILD_ID is provided
    if (process.env.DISCORD_GUILD_ID) {
      console.log('\n🔄 Also registering guild-specific commands...');
      const guildData = await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: commands }
      );

      console.log(`✅ Successfully reloaded ${guildData.length} guild-specific commands for guild ${process.env.DISCORD_GUILD_ID}`);
    }

    console.log('\n🎉 Commands updated!');
    console.log('📝 Note: Global commands can take up to 1 hour to appear in Discord.');
    console.log('💡 For instant updates, set DISCORD_GUILD_ID in your .env file for guild-specific commands.');

  } catch (error) {
    console.error('❌ Error updating commands:', error);
    if (error.code === 50001) {
      console.error('💡 Missing Access: Make sure your bot has the "applications.commands" scope.');
    }
    process.exit(1);
  }
}

// Check for required environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable is required');
  process.exit(1);
}

if (!process.env.DISCORD_CLIENT_ID) {
  console.error('❌ DISCORD_CLIENT_ID environment variable is required');
  process.exit(1);
}

updateCommands();
