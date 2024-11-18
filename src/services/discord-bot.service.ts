import { Client, Events, GatewayIntentBits, TextChannel, Message } from 'discord.js';
import { PubgApiService } from './pubg-api.service';
import { DiscordPlayerMatchStats, DiscordMatchGroupSummary } from '../types/discord-match-summary.types';
import { PubgStorageService } from './pubg-storage.service';
import { LogPlayerKillV2 } from '../types/pubg-telemetry.types';

export class DiscordBotService {
    private readonly client: Client;
    private readonly prefix = '!pubg';
    private readonly pubgStorageService: PubgStorageService;

    constructor(
        private readonly pubgApiService: PubgApiService,
    ) {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
        this.pubgStorageService = new PubgStorageService();
        this.setupEventHandlers();
    }

    public async initialize(): Promise<void> {
        console.log('Initializing Discord bot...');
        await this.client.login(process.env.DISCORD_TOKEN);
    }

    public async sendMatchSummary(channelId: string, summary: DiscordMatchGroupSummary): Promise<void> {
        const channel = await this.client.channels.fetch(channelId) as TextChannel;
        const message = await this.formatMatchSummary(summary);
        await channel.send(message);
    }

    private setupEventHandlers(): void {
        this.client.on(Events.MessageCreate, async (message) => {
            if (!message.content.startsWith(this.prefix) || message.author.bot) {
                return;
            }

            const args = message.content.slice(this.prefix.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            switch (command) {
                case 'add':
                    await this.handleAddPlayer(message, args);
                    break;
                case 'remove':
                    await this.handleRemovePlayer(message, args);
                    break;
                case 'list':
                    await this.handleListPlayers(message);
                    break;
            }
        });
    }

    private async handleAddPlayer(message: Message, args: string[]): Promise<void> {
        if (args.length < 1) {
            await message.reply('Please provide a PUBG player name');
            return;
        }

        const playerName = args[0];
        try {
            const player = await this.pubgApiService.getPlayer(playerName);
            // Save player data using storage service
            await this.pubgStorageService.addPlayer(player.data[0]);

            await message.reply(`Player ${playerName} added to monitoring list`);
        } catch (error) {
            const err = error as Error;
            await message.reply(`Failed to add player ${playerName}: ${err.message}`);
        }
    }

    private async handleRemovePlayer(message: Message, args: string[]): Promise<void> {
        if (args.length < 1) {
            await message.reply('Please provide a PUBG player name');
            return;
        }

        const playerName = args[0];
        try {
            await this.pubgStorageService.removePlayer(playerName);
            await message.reply(`Player ${playerName} removed from monitoring list`);
        } catch (error) {
            const err = error as Error;
            await message.reply(`Failed to remove player ${playerName}: ${err.message}`);
        }
    }

    private async handleListPlayers(message: Message): Promise<void> {
        const players = await this.pubgStorageService.getAllPlayers();
        if (players.length === 0) {
            await message.reply('No players are being monitored in this channel');
            return;
        }

        const playerList = players.map(p => p.name).join('\n');
        await message.reply(`Monitored players:\n${playerList}`);
    }

    private async formatMatchSummary(summary: DiscordMatchGroupSummary): Promise<string> {
        const { mapName, gameMode, playedAt, players, telemetryUrl } = summary;
        const teamRankText = summary.teamRank ? `🏆 Team Rank: #${summary.teamRank}` : '';

        // Format the date and time
        const matchDate = new Date(playedAt);
        const formattedDateTime = matchDate.toISOString().slice(0, 16).replace('T', ' ');

        // Calculate total damage and total kills
        const totalDamage = players.reduce((acc, player) => acc + (player.stats?.damageDealt || 0), 0);
        const totalKills = players.reduce((acc, player) => acc + (player.stats?.kills || 0), 0);

        // Fetch telemetry data for detailed kill events
        const killEvents = await this.pubgApiService.fetchAndFilterLogPlayerKillV2Events(telemetryUrl!, players.map(p => p.name));

        // Create the header with match info
        let message = `\`\`\`md
# 🎮 PUBG Match Summary - ${formattedDateTime}
----------------------------
📍 Map: ${this.formatMapName(mapName)}
🎯 Mode: ${this.formatGameMode(gameMode)}
⏰ Played: ${new Date(playedAt).toISOString().replace('T', ' ').substring(0, 16).replace(/-/g, '/')}
${teamRankText}
💥 Total Damage: ${Math.round(totalDamage)}
🔫 Total Kills: ${totalKills}
## 👥 Player Statistics
----------------------------

`;

        // Add individual player stats
        players.forEach(player => {
            message += this.formatPlayerStats(summary.matchId, player, killEvents) + '\n';
        });

        message += '```';
        return message;
    }

    private formatMapName(mapName: string): string {
        const mapNames: Record<string, string> = {
            'Baltic_Main': 'Erangel',
            'Desert_Main': 'Miramar',
            'Savage_Main': 'Sanhok',
            'DihorOtok_Main': 'Vikendi',
            'Range_Main': 'Camp Jackal',
            'Summerland_Main': 'Karakin',
            'Tiger_Main': 'Taego',
            'Kiki_Main': 'Deston',
        };
        return mapNames[mapName] || mapName;
    }

    private formatGameMode(mode: string): string {
        const modes: Record<string, string> = {
            'squad': 'Squad TPP',
            'squad-fpp': 'Squad FPP',
            'duo': 'Duo TPP',
            'duo-fpp': 'Duo FPP',
            'solo': 'Solo TPP',
            'solo-fpp': 'Solo FPP',
        };
        return modes[mode.toLowerCase()] || mode;
    }

    private formatPlayerStats(matchId: string, player: DiscordPlayerMatchStats, killEvents: LogPlayerKillV2[]): string {
        const { stats } = player;
        if (!stats) {
            return '';
        }
        const survivalMinutes = Math.round(stats.timeSurvived / 60);
        const kmWalked = (stats.walkDistance / 1000).toFixed(1);
        const accuracy = stats.kills > 0 && stats.headshotKills > 0 
            ? ((stats.headshotKills / stats.kills) * 100).toFixed(1) 
            : '0';

        const playerKills = killEvents.filter(event => event.killer?.name === player.name);
        const killDetails = this.formatKillDetails(playerKills);

        return [
            '',
            `### [${player.name}](https://pubg.op.gg/user/${player.name})`,
            `🏅 Position: #${stats.winPlace}`,
            `🔫 Kills: ${stats.kills} (${stats.headshotKills} headshots)`,
            `🔨 DBNOs: ${stats.DBNOs}`,
            `💥 Damage: ${Math.round(stats.damageDealt)} (${stats.assists} assists)`,
            `🎯 Headshot %: ${accuracy}%`,
            `⏱️ Survival: ${survivalMinutes}min`,
            '',
            `🎯 Longest Kill: ${Math.round(stats.longestKill)}m`,
            `🚶 Distance: ${kmWalked}km`,            
            stats.revives > 0 ? `🛡️ Revives: ${stats.revives}` : '',           
            `🎯 2D Replay: https://pubg.sh/${player.name}/steam/${matchId} `,
            '*** KILLS & KNOCKS ***',
            killDetails,
            '',
        ].filter(Boolean).join('\n');
    }

    private formatKillDetails(killEvents: LogPlayerKillV2[]): string {
        return killEvents.map(kill => {
            const weapon = this.getReadableWeaponName(kill.killerDamageInfo?.damageCauserName || '');
            const distance = kill.killerDamageInfo?.distance 
                ? `${Math.round(kill.killerDamageInfo.distance/100)}m`
                : 'N/A';
            const isKnock = !kill.finisher?.accountId || kill.finisher.accountId !== kill.killer?.accountId;
            const icon = isKnock ? '🔨' : '💀';
            const action = isKnock ? 'Knock' : 'Kill';            
            const matchDate = new Date(kill._D);
            const timestamp = matchDate.toISOString().slice(11, 16);
            return `${timestamp} ${icon} ${action}: ${kill.victim?.name} (${weapon}, ${distance})`;
        }).join('\n');
    }

    private getReadableWeaponName(weaponCode: string): string {
        const weaponNameMap: { [key: string]: string } = {
            // Assault Rifles
            "WeapAK47_C": "AKM",
            "WeapM416_C": "M416",
            "WeapSCARL_C": "SCAR-L",
            "WeapM16A4_C": "M16A4",
            "WeapG36C_C": "G36C",
            "WeapQBZ95_C": "QBZ-95",
            "WeapAUG_C": "AUG A3",
            "WeapGroza_C": "Groza",
            "WeapBerylM762_C": "Beryl M762",
            "WeapMk47Mutant_C": "Mk47 Mutant",
            "WeapK2_C": "K2",
            "WeapACE32_C": "ACE32",
            "WeapHK416_C": "M416",
          
            // Designated Marksman Rifles (DMRs)
            "WeapSKS_C": "SKS",
            "WeapSLR_C": "SLR",
            "WeapMini14_C": "Mini 14",
            "WeapMk14_C": "Mk14 EBR",
            "WeapVSS_C": "VSS Vintorez",
            "WeapQBU88_C": "QBU",
            "WeapM110_C": "M110",
            "WeapSVD_C": "Dragunov",
            "WeapMk12_C": "Mk12",
          
            // Sniper Rifles
            "WeapKar98k_C": "Karabiner 98 Kurz",
            "WeapM24_C": "M24",
            "WeapAWM_C": "AWM",
            "WeapWin94_C": "Winchester Model 1894",
            "WeapMosinNagant_C": "Mosin Nagant",
            "WeapLynxAMR_C": "Lynx AMR",
          
            // Submachine Guns (SMGs)
            "WeapUZI_C": "Micro UZI",
            "WeapUMP_C": "UMP45",
            "WeapVector_C": "Vector",
            "WeapTommyGun_C": "Tommy Gun",
            "WeapPP19Bizon_C": "PP-19 Bizon",
            "WeapMP5K_C": "MP5K",
            "WeapP90_C": "P90",
            "WeapJS9_C": "JS9",
            "WeapMP9_C": "MP9",
          
            // Light Machine Guns (LMGs)
            "WeapDP28_C": "DP-28",
            "WeapM249_C": "M249",
            "WeapMG3_C": "MG3",
          
            // Shotguns
            "WeapS686_C": "S686",
            "WeapS1897_C": "S1897",
            "WeapS12K_C": "S12K",
            "WeapDBS_C": "DBS",
            "WeapO12_C": "O12",
            "WeapSawedOff_C": "Sawed-off",
          
            // Pistols
            "WeapM1911_C": "P1911",
            "WeapM9_C": "P92",
            "WeapR1895_C": "R1895",
            "WeapRhino_C": "R45",
            "WeapP18C_C": "P18C",
            "WeapSkorpion_C": "Skorpion",
            "WeapDeagle_C": "Desert Eagle",
            "WeapFlareGun_C": "Flare Gun",
            "WeapStunGun_C": "Stun Gun",
          
            // Melee Weapons
            "WeapPan_C": "Pan",
            "WeapMachete_C": "Machete",
            "WeapCrowbar_C": "Crowbar",
            "WeapSickle_C": "Sickle",
          
            // Bows
            "WeapCrossbow_C": "Crossbow",
          
            // Miscellaneous
            "WeapMortar_C": "Mortar",
            "WeapBallisticShield_C": "Ballistic Shield",
            "WeapM79_C": "M79",
            "WeapPanzerFaust100M_C": "Panzerfaust",
            "WeapStickyBomb_C": "Sticky Bomb",
            "WeapC4_C": "C4",
            "WeapBlueZoneGrenade_C": "Blue Zone Grenade",
            "WeapDecoyGrenade_C": "Decoy Grenade",
            "WeapSmokeGrenade_C": "Smoke Grenade",
            "WeapFragGrenade_C": "Frag Grenade",
            "WeapMolotov_C": "Molotov Cocktail",
            "WeapStunGrenade_C": "Stun Grenade"
          };
          

        return weaponNameMap[weaponCode] || weaponCode
        .replace(/^Weap/, "") // Remove "Weap" prefix
        .replace(/_C$/, "") // Remove "_C" suffix
        .replace(/([a-z])([A-Z])/g, "$1 $2") // Add space between camel case words
        .trim(); // Trim any extra whitespace;
        }

    
} 