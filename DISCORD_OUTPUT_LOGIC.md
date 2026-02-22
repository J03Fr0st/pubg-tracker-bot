# Discord Output Logic & Calculation Reference

This document describes, in language-agnostic terms, exactly what the bot posts to Discord after each tracked PUBG match, and how every displayed value is calculated.

---

## Overview: What Gets Posted

For every match that contains a tracked player, the bot posts a sequence of **embeds** (rich message cards) to the configured Discord channel:

1. **Match Summary embed** — one card for the whole match
2. **Player embed(s)** — one card per player in the same roster (squad) as the tracked player
   - **Enhanced** version (uses telemetry data) when available
   - **Basic** version (uses API stats only) as fallback

---

## Embed 1 — Match Summary

### Header

| Field | Value |
|---|---|
| Title | `🎮 PUBG Match Summary` |
| Color | Consistent color derived from the Match ID (same match always has same color) |
| Timestamp | Match creation time (`createdAt` from the PUBG API match object) |
| Footer | `PUBG Match Tracker - <matchId>` |

### Body Text (in order)

```
⏰ <date/time in Africa/Johannesburg timezone, format: DD/MM/YYYY HH:MM>
🗺️ <Map Name> • <Game Mode>
(blank line)
Team Performance
🏆 Placement: #<teamRank>
👥 Squad Size: <N> players
(blank line)
Combat Summary
⚔️ Total Kills: <sum>
🔻 Total Knocks: <sum>
💥 Total Damage: <sum>
```

### Calculations

**Date/Time display:**
- Take the ISO timestamp (`createdAt`) from the PUBG API
- Convert to `Africa/Johannesburg` timezone (SAST, UTC+2)
- Format: `DD/MM/YYYY HH:MM` (24-hour)

**Team Rank (`#<N>`):**
- Read `winPlace` from each tracked player's stats
- If all tracked players share the same `winPlace`, show `#<winPlace>`
- If they differ (shouldn't happen in normal play), show `N/A`

**Squad Size:**
- Count the number of players in the tracked player's **roster** (not just tracked players — the whole squad)

**Total Kills / Knocks / Damage:**
- Sum across all players shown in the embed set (the full squad in the roster, not just tracked players)
- `totalKills` = sum of each player's `kills` stat
- `totalDBNOs` = sum of each player's `DBNOs` stat (knocks)
- `totalDamage` = sum of each player's `damageDealt` stat, rounded to nearest integer

**Map Name:**
- Look up the internal map code (e.g. `Baltic_Main`) in a name dictionary
- Fall back to the raw code if not found

**Game Mode:**
- Look up the internal game mode code (e.g. `squad-fpp`) in a mode dictionary
- Fall back to the raw code if not found

---

## Embed 2+ — Per-Player Cards

One embed is generated for each member of the tracked player's squad (roster), not just tracked players.

---

## Basic Player Embed (no telemetry)

Used when telemetry data is unavailable.

### Header

| Field | Value |
|---|---|
| Title | `Player: <playerName>` |
| Color | Same match color as summary embed |

### Body Text

```
⚔️ Kills: <kills> (<headshotKills> headshots)
🔻 Knocks: <DBNOs>
💥 Damage: <damageDealt rounded> (<assists> assists)
🎯 Headshot %: <X>%
⏰ Survival: <N>min
📏 Longest Kill: <N>m
👣 Distance: <X.X>km
🚑 Revives: <N>   (only shown if revives > 0)
🎯 [2D Replay](https://pubg.sh/<playerName>/steam/<matchId>)
```

### Calculations

| Displayed Value | Formula |
|---|---|
| Kills | `stats.kills` (direct from API) |
| Headshots | `stats.headshotKills` (direct from API) |
| Knocks | `stats.DBNOs` (direct from API) |
| Damage | `round(stats.damageDealt)` |
| Assists | `stats.assists` (direct from API) |
| Headshot % | `(headshotKills / kills) * 100`, shown to 1 decimal place; `0` if no kills |
| Survival minutes | `round(stats.timeSurvived / 60)` |
| Longest Kill | `round(stats.longestKill)` metres |
| Distance walked | `stats.walkDistance / 1000`, shown to 1 decimal place (km) |
| Revives | `stats.revives` (only shown if > 0) |

---

## Enhanced Player Embed (with telemetry)

Used when telemetry data is available. Replaces the basic embed. Organized into sections.

### Section 1 — COMBAT STATS

```
⚔️ COMBAT STATS
🎯 Kills: <N> (<HS> HS)
💀 K/D Ratio: <X.XX>
💥 Damage Dealt: <N>
🩸 Damage Taken: <N>
```

#### Calculations

| Value | Formula |
|---|---|
| Kills | Count of `LogPlayerKillV2` events where `killer.name` = this player |
| Headshots (HS) | Count of kills where `damageReason === "HeadShot"` |
| K/D Ratio | `killCount / deathCount`; if `deathCount = 0`, K/D = `killCount` (treated as kills with no deaths) |
| Damage Dealt | Sum of `damage` field across all `LogPlayerTakeDamage` events where `attacker.name` = this player |
| Damage Taken | Sum of `damage` field across all `LogPlayerTakeDamage` events where `victim.name` = this player |

---

### Section 2 — KILL CHAINS

Only shown if player has 2+ kills within a 30-second window.

```
KILL CHAINS
🔥 Best: <N> kills (<X.X>s)  •  ⚡ Doubles: <N>  •  💫 Triples: <N>  •  🌟 Quads+: <N>
```

#### How Kill Chains Are Detected

1. Sort all of the player's kills by timestamp (oldest first)
2. Iterate through kills; a "chain" starts with the first kill
3. Each subsequent kill is added to the current chain if the time since the **previous kill** is ≤ **30 seconds**
4. When a kill falls outside the 30-second window, the current chain ends
5. Only chains with **2 or more kills** are recorded

#### Chain Statistics

| Value | Formula |
|---|---|
| Best chain kills | The chain with the most kills; shown if ≥ 2 kills |
| Best chain duration | `lastKillTime - firstKillTime` in seconds |
| Doubles | Chains with exactly 2 kills |
| Triples | Chains with exactly 3 kills |
| Quads+ | Chains with 4 or more kills |

---

### Section 3 — CALCULATED ASSISTS

Only shown if the player has at least one calculated assist. These are **derived from telemetry**, not the API's `assists` field.

```
CALCULATED ASSISTS
🤝 Total: <N>  •  💥 Damage: <N>  •  🔻 Knockdown: <N>  •  ⭐ Combined: <N>
```

#### How Assists Are Calculated

An assist is credited when **someone else** gets the kill and the player contributed meaningfully:

1. Look at every kill in the match where the **killer is NOT this player**
2. For each such kill of victim `V` at time `T`:
   - Find all `LogPlayerTakeDamage` events where `attacker = this player`, `victim = V`, and the damage occurred within **10 seconds before** `T`
   - Find all `LogPlayerMakeGroggy` (knockdown) events where `attacker = this player`, `victim = V`, within **10 seconds before** `T`
   - Sum the damage from those events
3. An assist is counted if **either**:
   - Total damage to `V` within the window ≥ **20 damage**, OR
   - Player knocked down `V` within the window

#### Assist Types

| Type | Condition |
|---|---|
| `damage` | Dealt ≥ 20 damage but did NOT knock them |
| `knockdown` | Knocked them but dealt < 20 damage |
| `both` (Combined) | Dealt ≥ 20 damage AND knocked them |

---

### Section 4 — TIMELINE

Chronological log of significant events. Up to 100 events shown.

```
TIMELINE
`MM:SS` ⚔️ Killed [VictimName](pubg.op.gg link) (Weapon, Nm)
`MM:SS` 🔻 Knocked [VictimName](pubg.op.gg link) (Weapon, Nm)
`MM:SS` ☠️ Killed by [KillerName](pubg.op.gg link) (Weapon, Nm)
`MM:SS` 🔻 Knocked by [AttackerName](pubg.op.gg link) (Weapon, Nm)
`MM:SS` 🚑 Revived [PlayerName](pubg.op.gg link)
```

#### Event Types Included (sorted by time, oldest first)

| Icon | Event | Source Data |
|---|---|---|
| ⚔️ | Player killed someone | `LogPlayerKillV2` where `killer.name` = this player |
| 🔻 | Player knocked someone | `LogPlayerMakeGroggy` where `attacker.name` = this player |
| ☠️ | Player was killed | `LogPlayerKillV2` where `victim.name` = this player |
| 🔻 | Player was knocked | `LogPlayerMakeGroggy` where `victim.name` = this player |
| 🚑 | Player revived a teammate | `LogPlayerRevive` where `reviver.name` = this player |

#### Timestamp Format (`MM:SS`)

- `matchTime = eventTimestamp - matchStartTime` (in seconds)
- `minutes = floor(matchTime / 60)`, zero-padded to 2 digits
- `seconds = matchTime mod 60`, zero-padded to 2 digits
- Result: `MM:SS` (e.g. `07:42`)

**Match start time** is the `createdAt` from the PUBG API match object.

#### Distance Calculation

Raw distances in the telemetry are stored in **centimetres**.
- Displayed distance (metres) = `round(rawDistance / 100)`

Distance is read from `killerDamageInfo` (for kills/deaths) or `groggyDamage` (for knockdowns), falling back to the top-level `distance` field on the event.

#### Weapon Name

- Weapon codes (e.g. `WeapHK416_C`) are looked up in a human-readable name mapping
- If not found, the raw code is shown

---

### Section 5 — Survival / Link

```
⏰ Survival: <N>min • <X.X>km
🎯 [2D Replay](https://pubg.sh/<playerName>/steam/<matchId>)
```

| Value | Formula |
|---|---|
| Survival minutes | `round(stats.timeSurvived / 60)` |
| Distance km | `stats.walkDistance / 1000`, 1 decimal place |

---

## Data Sources Summary

| Data | Source |
|---|---|
| Kills, DBNOs, damageDealt, assists, timeSurvived, walkDistance, longestKill, revives, headshotKills, winPlace | PUBG Match API — `participant.attributes.stats` |
| Damage Dealt (telemetry) | `LogPlayerTakeDamage` events, summed by attacker |
| Damage Taken (telemetry) | `LogPlayerTakeDamage` events, summed by victim |
| K/D Ratio | `LogPlayerKillV2` events (killer vs victim) |
| Kill Chains | `LogPlayerKillV2` events, grouped by 30s window |
| Calculated Assists | `LogPlayerTakeDamage` + `LogPlayerMakeGroggy` events within 10s of kill |
| Timeline kills | `LogPlayerKillV2` where killer = player |
| Timeline knockdowns | `LogPlayerMakeGroggy` where attacker = player |
| Timeline deaths | `LogPlayerKillV2` where victim = player |
| Timeline knocked | `LogPlayerMakeGroggy` where victim = player |
| Timeline revives | `LogPlayerRevive` where reviver = player |
| Map/Mode names | Internal code-to-name dictionary |
| Match color | Deterministic hash of `matchId` |
| Player name match | Case-insensitive exact match |
