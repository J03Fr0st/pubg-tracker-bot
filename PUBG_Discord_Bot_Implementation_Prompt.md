# Complete Python PUBG Discord Bot Implementation Prompt

**TASK: Create a complete Python Discord bot that monitors PUBG players and posts detailed match summaries to Discord channels. The bot must replicate EXACTLY the functionality and message formatting of an existing TypeScript bot.**

## **CRITICAL REQUIREMENTS**

### **Discord Message Format - MUST BE IDENTICAL**
The Discord embeds must match this EXACT format:

**Main Embed:**
- Title: "🎮 PUBG Match Summary"
- Description format:
```
⏰ **YYYY/MM/DD HH:mm** (South African timezone)
🗺️ **Map Name** • Game Mode

**Team Performance**
🏆 Placement: **#X** (or N/A)
👥 Squad Size: **X players**

**Combat Summary**
⚔️ Total Kills: **X**
🔻 Total Knocks: **X**
💥 Total Damage: **X**
```
- Footer: "PUBG Match Tracker - {matchId}"
- Color: Generated using consistent algorithm based on match ID
- Timestamp: Match date

**Player Embeds (one per player):**
- Title: "Player: {playerName}"
- Description format:
```
⚔️ Kills: X (X headshots)
🔻 Knocks: X
💥 Damage: X (X assists)
🎯 Headshot %: X%
⏰ Survival: Xmin
📏 Longest Kill: Xm
👣 Distance: X.Xkm
🚑 Revives: X (only if > 0)
🎯 [2D Replay](https://pubg.sh/{playerName}/steam/{matchId})
*** KILLS & DBNOs *** (only if events exist)
`MM:SS` ⚔️ Killed - [PlayerName](https://pubg.op.gg/user/PlayerName) (Weapon, XYZm)
`MM:SS` 🔻 Knocked - [PlayerName](https://pubg.op.gg/user/PlayerName) (Weapon, XYZm)
```

### **Color Generation Algorithm**
```python
def generate_match_color(match_id: str) -> int:
    seed = sum(ord(char) for char in match_id)
    colors = [
        0x3498db, 0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22,
        0x1abc9c, 0xd35400, 0x34495e, 0x16a085, 0x8e44ad, 0x2980b9,
        0xc0392b, 0x27ae60
    ]
    return colors[seed % len(colors)]
```

## **PROJECT STRUCTURE**
```
pubg_discord_bot/
├── main.py
├── requirements.txt
├── .env.example
├── config/
│   └── settings.py
├── services/
│   ├── discord_bot_service.py
│   ├── pubg_api_service.py
│   ├── match_monitor_service.py
│   └── storage_service.py
├── models/
│   ├── player.py
│   ├── match.py
│   └── processed_match.py
├── utils/
│   ├── rate_limiter.py
│   └── mappings.py
└── types/
    ├── discord_types.py
    ├── pubg_types.py
    └── telemetry_types.py
```

## **DEPENDENCIES (requirements.txt)**
```
discord.py>=2.3.0
aiohttp>=3.8.0
motor>=3.3.0
python-dotenv>=1.0.0
pytz>=2023.3
pymongo>=4.5.0
```

## **ENVIRONMENT VARIABLES (.env.example)**
```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CHANNEL_ID=target_channel_id
PUBG_API_KEY=your_pubg_api_key
PUBG_SHARD=steam
PUBG_MAX_REQUESTS_PER_MINUTE=10
MONGODB_URI=mongodb://localhost:27017/pubg-tracker
CHECK_INTERVAL_MS=60000
MAX_MATCHES_TO_PROCESS=5
```

## **CORE FUNCTIONALITY REQUIREMENTS**

### **1. Discord Commands (Slash Commands)**
- `/add playername` - Add player to monitoring
- `/remove playername` - Remove player from monitoring  
- `/list` - List all monitored players

### **2. Match Monitoring Logic**
- Check every 60 seconds (configurable)
- Fetch recent matches for all monitored players
- Group matches by ID (handle multiple monitored players in same match)
- Filter out already processed matches
- Process matches chronologically (oldest first)
- Extract telemetry data for kill/knock timeline
- Send formatted Discord embeds
- Mark matches as processed

### **3. PUBG API Integration**
- Rate limiting (10 requests/minute by default)
- Retry logic with exponential backoff
- Handle 429 rate limit responses
- Fetch player data, match details, and telemetry
- Parse JSON-API format responses

### **4. Database Operations (MongoDB)**
- Store monitored players
- Track processed matches (prevent duplicates)
- Async operations using Motor

## **IMPLEMENTATION DETAILS**

### **mappings.py - EXACT CONSTANTS**
```python
MAP_NAMES = {
    "Baltic_Main": "Erangel (Remastered)",
    "Chimera_Main": "Paramo",
    "Desert_Main": "Miramar",
    "DihorOtok_Main": "Vikendi",
    "Erangel_Main": "Erangel",
    "Heaven_Main": "Haven",
    "Kiki_Main": "Deston",
    "Range_Main": "Camp Jackal",
    "Savage_Main": "Sanhok",
    "Summerland_Main": "Karakin",
    "Tiger_Main": "Taego",
    "Neon_Main": "Rondo",
}

GAME_MODES = {
    "duo": "Duo TPP",
    "duo-fpp": "Duo FPP",
    "solo": "Solo TPP",
    "solo-fpp": "Solo FPP",
    "squad": "Squad TPP",
    "squad-fpp": "Squad FPP",
    "conquest-duo": "Conquest Duo TPP",
    "conquest-duo-fpp": "Conquest Duo FPP",
    "conquest-solo": "Conquest Solo TPP",
    "conquest-solo-fpp": "Conquest Solo FPP",
    "conquest-squad": "Conquest Squad TPP",
    "conquest-squad-fpp": "Conquest Squad FPP",
    "esports-duo": "Esports Duo TPP",
    "esports-duo-fpp": "Esports Duo FPP",
    "esports-solo": "Esports Solo TPP",
    "esports-solo-fpp": "Esports Solo FPP",
    "esports-squad": "Esports Squad TPP",
    "esports-squad-fpp": "Esports Squad FPP",
    "normal-duo": "Duo TPP",
    "normal-duo-fpp": "Duo FPP",
    "normal-solo": "Solo TPP",
    "normal-solo-fpp": "Solo FPP",
    "normal-squad": "Squad TPP",
    "normal-squad-fpp": "Squad FPP",
    "war-duo": "War Duo TPP",
    "war-duo-fpp": "War Duo FPP",
    "war-solo": "War Solo TPP",
    "war-solo-fpp": "War Solo FPP",
    "war-squad": "Squad TPP",
    "war-squad-fpp": "War Squad FPP",
    "zombie-duo": "Zombie Duo TPP",
    "zombie-duo-fpp": "Zombie Duo FPP",
    "zombie-solo": "Zombie Solo TPP",
    "zombie-solo-fpp": "Zombie Solo FPP",
    "zombie-squad": "Zombie Squad TPP",
    "zombie-squad-fpp": "Zombie Squad FPP",
    "lab-tpp": "Lab TPP",
    "lab-fpp": "Lab FPP",
    "tdm": "Team Deathmatch",
}

DAMAGE_CAUSER_NAME = {
    "AIPawn_Base_Female_C": "AI Player",
    "AIPawn_Base_Male_C": "AI Player",
    "AirBoat_V2_C": "Airboat",
    "AquaRail_A_01_C": "Aquarail",
    "AquaRail_A_02_C": "Aquarail",
    "AquaRail_A_03_C": "Aquarail",
    "BP_ATV_C": "Quad",
    "BP_BearV2_C": "Bear",
    "BP_BRDM_C": "BRDM-2",
    "BP_Bicycle_C": "Mountain Bike",
    "BP_Blanc_C": "Coupe SUV",
    "BP_CoupeRB_C": "Coupe RB",
    "BP_DO_Circle_Train_Merged_C": "Train",
    "BP_DO_Line_Train_Dino_Merged_C": "Train",
    "BP_DO_Line_Train_Merged_C": "Train",
    "BP_Dirtbike_C": "Dirt Bike",
    "BP_DronePackage_Projectile_C": "Drone",
    "BP_Eragel_CargoShip01_C": "Ferry Damage",
    "BP_FakeLootProj_AmmoBox_C": "Loot Truck",
    "BP_FakeLootProj_MilitaryCrate_C": "Loot Truck",
    "BP_FireEffectController_C": "Molotov Fire",
    "BP_FireEffectController_JerryCan_C": "Jerrycan Fire",
    "BP_Food_Truck_C": "Food Truck",
    "BP_Helicopter_C": "Pillar Scout Helicopter",
    "BP_IncendiaryDebuff_C": "Burn",
    "BP_JerryCanFireDebuff_C": "Burn",
    "BP_JerryCan_FuelPuddle_C": "Burn",
    "BP_KillTruck_C": "Kill Truck",
    "BP_LootTruck_C": "Loot Truck",
    "BP_M_Rony_A_01_C": "Rony",
    "BP_M_Rony_A_02_C": "Rony",
    "BP_M_Rony_A_03_C": "Rony",
    "BP_Mirado_A_02_C": "Mirado",
    "BP_Mirado_A_03_C": "Mirado",
    "BP_Mirado_A_03_Esports_C": "Mirado",
    "BP_Mirado_Open_03_C": "Mirado (open top)",
    "BP_Mirado_Open_04_C": "Mirado (open top)",
    "BP_Mirado_Open_05_C": "Mirado (open top)",
    "BP_MolotovFireDebuff_C": "Molotov Fire Damage",
    "BP_Motorbike_04_C": "Motorcycle",
    "BP_Motorbike_04_Desert_C": "Motorcycle",
    "BP_Motorbike_04_SideCar_C": "Motorcycle (w/ Sidecar)",
    "BP_Motorbike_04_SideCar_Desert_C": "Motorcycle (w/ Sidecar)",
    "BP_Motorbike_Solitario_C": "Motorcycle",
    "BP_Motorglider_C": "Motor Glider",
    "BP_Motorglider_Green_C": "Motor Glider",
    "BP_Niva_01_C": "Zima",
    "BP_Niva_02_C": "Zima",
    "BP_Niva_03_C": "Zima",
    "BP_Niva_04_C": "Zima",
    "BP_Niva_05_C": "Zima",
    "BP_Niva_06_C": "Zima",
    "BP_Niva_07_C": "Zima",
    "BP_Niva_Esports_C": "Zima",
    "BP_PickupTruck_A_01_C": "Pickup Truck (closed top)",
    "BP_PickupTruck_A_02_C": "Pickup Truck (closed top)",
    "BP_PickupTruck_A_03_C": "Pickup Truck (closed top)",
    "BP_PickupTruck_A_04_C": "Pickup Truck (closed top)",
    "BP_PickupTruck_A_05_C": "Pickup Truck (closed top)",
    "BP_PickupTruck_A_esports_C": "Pickup Truck (closed top)",
    "BP_PickupTruck_B_01_C": "Pickup Truck (open top)",
    "BP_PickupTruck_B_02_C": "Pickup Truck (open top)",
    "BP_PickupTruck_B_03_C": "Pickup Truck (open top)",
    "BP_PickupTruck_B_04_C": "Pickup Truck (open top)",
    "BP_PickupTruck_B_05_C": "Pickup Truck (open top)",
    "BP_Pillar_Car_C": "Pillar Security Car",
    "BP_PonyCoupe_C": "Pony Coupe",
    "BP_Porter_C": "Porter",
    "BP_Scooter_01_A_C": "Scooter",
    "BP_Scooter_02_A_C": "Scooter",
    "BP_Scooter_03_A_C": "Scooter",
    "BP_Scooter_04_A_C": "Scooter",
    "BP_Snowbike_01_C": "Snowbike",
    "BP_Snowbike_02_C": "Snowbike",
    "BP_Snowmobile_01_C": "Snowmobile",
    "BP_Snowmobile_02_C": "Snowmobile",
    "BP_Snowmobile_03_C": "Snowmobile",
    "BP_Spiketrap_C": "Spike Trap",
    "BP_TslGasPump_C": "Gas Pump",
    "BP_TukTukTuk_A_01_C": "Tukshai",
    "BP_TukTukTuk_A_02_C": "Tukshai",
    "BP_TukTukTuk_A_03_C": "Tukshai",
    "BP_Van_A_01_C": "Van",
    "BP_Van_A_02_C": "Van",
    "BP_Van_A_03_C": "Van",
    "BattleRoyaleModeController_Chimera_C": "Bluezone",
    "BattleRoyaleModeController_Def_C": "Bluezone",
    "BattleRoyaleModeController_Desert_C": "Bluezone",
    "BattleRoyaleModeController_DihorOtok_C": "Bluezone",
    "BattleRoyaleModeController_Heaven_C": "Bluezone",
    "BattleRoyaleModeController_Kiki_C": "Bluezone",
    "BattleRoyaleModeController_Savage_C": "Bluezone",
    "BattleRoyaleModeController_Summerland_C": "Bluezone",
    "BattleRoyaleModeController_Tiger_C": "Bluezone",
    "BlackZoneController_Def_C": "Blackzone",
    "Bluezonebomb_EffectActor_C": "Bluezone Grenade",
    "Boat_PG117_C": "PG-117",
    "Buff_DecreaseBreathInApnea_C": "Drowning",
    "Buggy_A_01_C": "Buggy",
    "Buggy_A_02_C": "Buggy",
    "Buggy_A_03_C": "Buggy",
    "Buggy_A_04_C": "Buggy",
    "Buggy_A_05_C": "Buggy",
    "Buggy_A_06_C": "Buggy",
    "Carepackage_Container_C": "Care Package",
    "Dacia_A_01_v2_C": "Dacia",
    "Dacia_A_01_v2_snow_C": "Dacia",
    "Dacia_A_02_v2_C": "Dacia",
    "Dacia_A_03_v2_C": "Dacia",
    "Dacia_A_03_v2_Esports_C": "Dacia",
    "Dacia_A_04_v2_C": "Dacia",
    "DroppedItemGroup": "Object Fragments",
    "EmergencyAircraft_Tiger_C": "Emergency Aircraft",
    "Jerrycan": "Jerrycan",
    "JerrycanFire": "Jerrycan Fire",
    "Lava": "Lava",
    "Mortar_Projectile_C": "Mortar Projectile",
    "None": "None",
    "PG117_A_01_C": "PG-117",
    "PanzerFaust100M_Projectile_C": "Panzerfaust Projectile",
    "PlayerFemale_A_C": "Player",
    "PlayerMale_A_C": "Player",
    "ProjC4_C": "C4",
    "ProjGrenade_C": "Frag Grenade",
    "ProjIncendiary_C": "Incendiary Projectile",
    "ProjMolotov_C": "Molotov Cocktail",
    "ProjMolotov_DamageField_Direct_C": "Molotov Cocktail Fire Field",
    "ProjStickyGrenade_C": "Sticky Bomb",
    "RacingDestructiblePropaneTankActor_C": "Propane Tank",
    "RacingModeContorller_Desert_C": "Bluezone",
    "RedZoneBomb_C": "Redzone",
    "RedZoneBombingField": "Redzone",
    "RedZoneBombingField_Def_C": "Redzone",
    "SandStormBuff_BP_C": "Sandstorm",
    "TslDestructibleSurfaceManager": "Destructible Surface",
    "TslPainCausingVolume": "Lava",
    "Uaz_A_01_C": "UAZ (open top)",
    "Uaz_Armored_C": "UAZ (armored)",
    "Uaz_B_01_C": "UAZ (soft top)",
    "Uaz_B_01_esports_C": "UAZ (soft top)",
    "Uaz_C_01_C": "UAZ (hard top)",
    "UltAIPawn_Base_Female_C": "Player",
    "UltAIPawn_Base_Male_C": "Player",
    "WeapACE32_C": "ACE32",
    "WeapAK47_C": "AKM",
    "WeapAUG_C": "AUG A3",
    "WeapAWM_C": "AWM",
    "WeapBerreta686_C": "S686",
    "WeapBerylM762_C": "Beryl",
    "WeapBizonPP19_C": "Bizon",
    "WeapCowbarProjectile_C": "Crowbar Projectile",
    "WeapCowbar_C": "Crowbar",
    "WeapCrossbow_1_C": "Crossbow",
    "WeapDP12_C": "DBS",
    "WeapDP28_C": "DP-28",
    "WeapDesertEagle_C": "Deagle",
    "WeapDragunov_C": "Dragunov",
    "WeapDuncansHK416_C": "M416",
    "WeapFNFal_C": "SLR",
    "WeapG18_C": "P18C",
    "WeapG36C_C": "G36C",
    "WeapGroza_C": "Groza",
    "WeapHK416_C": "M416",
    "WeapJS9_C": "JS9",
    "WeapJuliesKar98k_C": "Kar98k",
    "WeapK2_C": "K2",
    "WeapKar98k_C": "Kar98k",
    "WeapL6_C": "Lynx AMR",
    "WeapLunchmeatsAK47_C": "AKM",
    "WeapM16A4_C": "M16A4",
    "WeapM1911_C": "P1911",
    "WeapM249_C": "M249",
    "WeapM24_C": "M24",
    "WeapM9_C": "P92",
    "WeapMG3_C": "MG3",
    "WeapMP5K_C": "MP5K",
    "WeapMP9_C": "MP9",
    "WeapMacheteProjectile_C": "Machete Projectile",
    "WeapMachete_C": "Machete",
    "WeapMadsQBU88_C": "QBU88",
    "WeapMini14_C": "Mini 14",
    "WeapMk12_C": "Mk12",
    "WeapMk14_C": "Mk14 EBR",
    "WeapMk47Mutant_C": "Mk47 Mutant",
    "WeapMosinNagant_C": "Mosin-Nagant",
    "WeapNagantM1895_C": "R1895",
    "WeapOriginS12_C": "O12",
    "WeapP90_C": "P90",
    "WeapPanProjectile_C": "Pan Projectile",
    "WeapPan_C": "Pan",
    "WeapPanzerFaust100M1_C": "Panzerfaust",
    "WeapQBU88_C": "QBU88",
    "WeapQBZ95_C": "QBZ95",
    "WeapRhino_C": "R45",
    "WeapSCAR-L_C": "SCAR-L",
    "WeapSKS_C": "SKS",
    "WeapSaiga12_C": "S12K",
    "WeapSawnoff_C": "Sawed-off",
    "WeapSickleProjectile_C": "Sickle Projectile",
    "WeapSickle_C": "Sickle",
    "WeapThompson_C": "Tommy Gun",
    "WeapTurret_KillTruck_Main_C": "Kill Truck Turret",
    "WeapUMP_C": "UMP9",
    "WeapUZI_C": "Micro Uzi",
    "WeapVSS_C": "VSS",
    "WeapVector_C": "Vector",
    "WeapWin94_C": "Win94",
    "WeapWinchester_C": "S1897",
    "Weapvz61Skorpion_C": "Skorpion",
}
```

### **Rate Limiter - Token Bucket Algorithm**
```python
import asyncio
import time

class RateLimiter:
    def __init__(self, max_requests: int):
        self.max_tokens = max_requests
        self.tokens = max_requests
        self.refill_rate = max_requests / 60  # tokens per second
        self.last_refill_timestamp = time.time()
    
    async def try_acquire(self) -> bool:
        self._refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        
        time_until_next_token = 1.0 / self.refill_rate
        await asyncio.sleep(time_until_next_token)
        return await self.try_acquire()
    
    def _refill(self) -> None:
        now = time.time()
        time_passed = now - self.last_refill_timestamp
        self.tokens = min(self.max_tokens, self.tokens + time_passed * self.refill_rate)
        self.last_refill_timestamp = now
```

### **Telemetry Processing**
- Fetch telemetry JSON from match asset URL
- Filter `LogPlayerKillV2` and `LogPlayerMakeGroggy` events
- Include events where monitored players are killer, victim, attacker, or knocked
- Sort events by timestamp
- Format timeline with relative match time (MM:SS)
- Extract weapon, distance, and player names
- Generate external links to pubg.op.gg profiles

### **Database Models**
```python
# Player document
{
    "pubg_id": "account.abc123",
    "name": "PlayerName",
    "shard_id": "steam",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "patch_version": "1.0.0",
    "title_id": "bluehole-pubg"
}

# Processed match document  
{
    "match_id": "match-id-string",
    "processed_at": "2024-01-01T00:00:00Z"
}
```

### **Error Handling**
- Graceful Discord command error responses with red embeds
- API timeout handling with retries
- Rate limit respect (429 responses)
- MongoDB connection error handling
- Telemetry fetch failures (continue without kill timeline)

### **Timezone Handling**
- Convert all timestamps to South African timezone (Africa/Johannesburg)
- Format as YYYY/MM/DD HH:mm (24-hour format)

### **Match Processing Logic**
1. Get all monitored players from database
2. Fetch recent matches for each player (up to 5 matches per player)
3. Group matches by match ID, collecting all monitored players in each match
4. Filter out already processed matches
5. Sort remaining matches chronologically (oldest first)
6. For each new match:
   - Fetch detailed match data
   - Extract participant stats for all squad members (not just monitored players)
   - Get telemetry URL from match assets
   - Fetch and parse telemetry events
   - Generate Discord embeds with exact formatting
   - Send to configured channel
   - Mark match as processed

### **Squad Detection Logic**
- Find roster containing monitored player
- Include ALL players in that roster in the Discord summary
- Calculate team placement from any roster member
- Show full squad stats even if only one player is monitored

## **SPECIFIC IMPLEMENTATION NOTES**

1. **Use async/await throughout** - All database and API operations must be asynchronous
2. **Implement proper logging** - Console output matching the pattern: `print(f"Found {len(players)} players to monitor")`
3. **Handle edge cases** - Missing stats, failed telemetry fetch, network errors
4. **Maintain exact embed formatting** - Colors, icons, field order, text formatting
5. **Use proper Discord.py patterns** - Slash commands, embed builders, error handling
6. **Implement graceful shutdown** - Handle SIGINT/SIGTERM signals
7. **Environment validation** - Check all required environment variables on startup
8. **MongoDB indexes** - Create indexes on player names and match IDs for performance

## **CRITICAL SUCCESS CRITERIA**
- Discord messages must be pixel-perfect matches to the original format
- All external links must work (pubg.sh replay, pubg.op.gg profiles)
- Kill timeline must show correct timestamps, weapons, and distances
- Colors must be consistent per match using the exact algorithm
- Rate limiting must prevent API violations
- No duplicate match processing
- Support for squad games (multiple monitored players in same match)
- Proper timezone conversion to South African time
- All weapon names must display correctly using the mappings
- Headshot percentage calculation: `(headshot_kills / max(kills, 1)) * 100` if kills > 0, else 0
- Distance formatting: `round(walk_distance / 1000, 1)` km
- Survival time: `round(time_survived / 60)` minutes
- Damage rounding: `round(damage_dealt)`

## **PUBG API SPECIFIC REQUIREMENTS**

### **API Endpoints Used:**
1. `GET /shards/{shard}/players?filter[playerNames]={names}` - Get player data
2. `GET /shards/{shard}/matches/{matchId}` - Get match details
3. Telemetry URL from match assets (no auth needed, gzip compressed)

### **JSON-API Response Structure:**
```json
{
  "data": [...],
  "included": [...],
  "links": {...},
  "meta": {...}
}
```

### **Telemetry Events to Filter:**
- `LogPlayerKillV2` - Final elimination events
- `LogPlayerMakeGroggy` - Knock events

### **Key Response Fields:**
- Player: `data[].id`, `data[].attributes.name`, `data[].relationships.matches.data[]`
- Match: `data.attributes.{mapName, gameMode, createdAt}`, `included[]` for participants/rosters/assets
- Participant: `type: "participant"`, `attributes.stats.*`
- Roster: `type: "roster"`, `relationships.participants.data[]`
- Asset: `type: "asset"`, `attributes.URL` (telemetry link)

**Generate the complete, production-ready Python codebase that implements all of the above requirements.** 