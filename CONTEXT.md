# PUBG Match Monitoring and Coaching

This glossary defines the canonical language for monitoring selected PUBG players, analyzing their matches and telemetry, and delivering evidence-backed Discord summaries and coaching. Terms describe the product domain, not the code that implements it.

## Players and identity

**Player**: A PUBG account that can participate in a match.

**Monitored Player**: A player explicitly added to the bot's monitoring list. The bot searches for this player's new matches and includes this player in telemetry analysis.

_Avoid_: Tracked player, watched player.

**Participant**: A player's match-specific record, including the account identity, roster membership, and statistics for that match.

**Roster**: The PUBG grouping of participants who played together in one match. A roster may represent a solo player, duo, or squad depending on the game mode.

**Teammate**: Another participant on the same roster as the player being discussed.

_Avoid_: Squadmate when the definition must also cover solo and duo modes.

**Monitored Teammate**: A teammate who is also a monitored player and whose telemetry can therefore contribute to team-spacing and trade-pressure evidence.

**Opponent**: A participant outside the player's roster who was encountered in combat.

**Bot Player**: A PUBG-controlled participant identified by a bot account ID. Bot players count as participants but do not have human season performance.

**PUBG Account ID**: The stable PUBG identity used to join player, participant, telemetry, and season-stat records.

_Avoid_: Player name when identity must remain stable across renames.

**Player Name**: The current display name of a PUBG account. It is suitable for presentation but is not a stable identity.

**PUBG Shard**: The PUBG API platform partition in which accounts and matches are queried, such as Steam, Xbox, or PlayStation.

_Avoid_: Region; a shard identifies a platform partition, not necessarily a geographic server region.

## Match monitoring

**Match**: One completed PUBG game identified by a match ID and containing rosters, participants, assets, and match metadata.

**Match ID**: The stable PUBG identifier for a match.

**Game Mode**: The PUBG rule and perspective variant for a match, including team size and first- or third-person perspective.

**Placement**: The finishing rank of a roster in a match. Participants on the same roster share the same placement.

**Match Monitoring**: Repeatedly checking monitored players for new matches, analyzing eligible matches, and delivering summaries.

**New Match**: A match associated with a monitored player that has not yet been recorded as processed.

**Processed Match**: A match recorded after successful summary delivery so automatic monitoring does not publish it again.

_Avoid_: Cached match; processing state and cached data are different concerns.

**Manual Match Processing**: User-triggered analysis and delivery of a specific match ID outside normal automatic detection.

**Match Summary**: The Discord-ready account of one match, including match details, placement, player performance, difficulty, telemetry findings, and optional coaching.

**Monitoring Channel**: The configured Discord text channel that receives automatic match summaries.

## Match and season performance

**Match Stats**: A participant's top-level results for one match, such as kills, damage, assists, survival time, and movement distance.

**Season**: A PUBG statistical period used to group a player's longer-term performance.

**Season Stats**: A player's performance for one exact combination of PUBG account, shard, season, and game mode. Stats from different modes are not interchangeable.

**K/D**: Season kills divided by deaths or losses. When deaths are zero, kills are used as the value rather than dividing by zero.

**ADR**: Average damage per round, calculated as season damage dealt divided by rounds played.

**No Season Data**: The state in which an account has no usable rounds for the requested season and game mode, or its stats cannot be retrieved. Missing human data is omitted from difficulty calculations rather than treated as zero skill.

**Season Stats Cache**: A short-lived saved result for one account, shard, season, and game mode that avoids repeatedly requesting unchanged season performance.

**Opponent Difficulty**: A 0-100 score representing the season performance of unique opponents encountered by the monitored players, using opponents with usable K/D and ADR.

**Lobby Difficulty**: A 0-100 score representing the full lobby. It uses unique participants with usable human season stats and includes bot players at zero.

**Difficulty Label**: The human-readable band for a difficulty score: Easy for 0-34, Standard for 35-64, Hard for 65-84, and Brutal for 85-100.

## Telemetry and combat analysis

**Telemetry**: The chronological PUBG event stream that records what happened during a match.

**Telemetry Event**: A timestamped match occurrence such as damage, a knock, a kill, movement, healing, or zone damage.

**Match Analysis**: The derived telemetry analysis for all monitored players in one match.

**Player Analysis**: One monitored player's combat events and derived performance results for one match.

**Weapon Stats**: A player's derived per-weapon results, including kills, damage, hit locations, engagement ranges, and victim details.

**Kill Chain**: A chronologically related series of kills by one player, together with its duration and weapons used.

**Calculated Assist**: An assist inferred from telemetry evidence such as damage or a knock, rather than relying only on the participant's top-level match stats.

**Telemetry Cache**: Saved raw telemetry and derived player analysis for a match, used to avoid downloading and interpreting the same event stream again.

**Knock**: A decisive combat event in which a player puts an opponent into the down-but-not-out state.

**Death**: A decisive combat event in which the player is eliminated from the match.

**Decisive Event**: A monitored player's knock or death used as the anchor for reviewing a fight.

**Fight Context**: The evidence window around a decisive event, combining combat, position, teammate, recovery, and zone facts needed to explain the outcome.

**Reset**: A break in an engagement used to heal, recover, or otherwise stabilize after taking damage before fighting again.

**Bad Reset**: A fight pattern in which the player takes heavy damage, has time to reset, then re-engages the same enemy without a meaningful reposition.

**Trade Pressure**: A teammate's practical ability to damage the same enemy soon enough to punish a knock or death.

**Trade Range**: The player-to-teammate spacing used to judge whether immediate trade pressure was plausible.

**Stacked Angle**: A fight geometry in which the player and teammate attack from nearly the same direction instead of creating distinct lines of pressure.

_Avoid_: Crossfire; a stacked angle is specifically the absence of an effective crossfire.

**Reposition**: Meaningful movement between the first relevant damage and the decisive event that changes the fight's angle or location.

**Height Advantage**: A meaningful vertical-position advantage held by one side of a fight.

**Zone Pressure**: Blue-zone damage shortly before a decisive event that shows the rotation was already costing health or forcing the fight.

**Damage Conversion**: The degree to which damage dealt becomes a favorable combat outcome instead of being outweighed by return damage.

## Coaching

**Coaching Insight**: An evidence-backed lesson for one player, derived from one or more fight contexts and expressed with severity, confidence, and a recommendation.

**Claim**: A human-readable tactical statement supported by specific fight evidence and assigned a confidence level.

**Evidence**: Concrete telemetry facts that justify a coaching claim. Evidence must describe observed match data rather than speculation.

**Severity**: The low, medium, or high importance of the behavior described by a coaching insight.

**Confidence**: The low, medium, or high strength of the available evidence for a claim or insight. Confidence describes evidential support, not the severity of the mistake.

**Recommendation**: The concise corrective action attached to a coaching insight.

**Better Play**: The concrete, evidence-compatible actions the player could have taken in the reviewed situation. These actions bound narration so it does not invent unsupported advice.

**Decisive Mistake**: The highest-ranked supported mistake from a player's reviewed decisive fights.

**Pattern to Fix**: A harmful behavior supported by repetition across multiple reviewed fights rather than by a single event.

**Player Fingerprint**: The dominant recurring behavior profile found across a player's reviewed fights.

**Aggressive re-peeker**: A player fingerprint marked by repeatedly taking heavy damage and re-engaging the same enemy without first resetting or changing the angle.

**Late-rotate fighter**: A player fingerprint marked by entering decisive fights while meaningful blue-zone pressure is already costing health.

**Isolated entry**: A player fingerprint marked by starting fights where a monitored teammate cannot apply trade damage.

**Low-conversion trader**: A player fingerprint marked by repeatedly taking heavy return damage while dealing less than half as much damage back.

**Coaching Narration**: Discord-ready wording of validated coaching insights. Narration may improve presentation but must preserve the supplied facts, confidence, and recommended actions.

**Template Narration**: Deterministic coaching wording used without an external language model or when model-assisted narration is unavailable.

**Model-assisted Narration**: An optional rewrite of validated coaching insights by a language model, constrained to the supplied players, facts, and better-play actions.

_Avoid_: AI analysis; the model narrates existing analysis and does not create new match evidence.

**Coaching Guardrail**: A rule that rejects narration which invents players, numbers, locations, terrain, evidence, or advice outside the validated insight.

## Discord presentation

**Main Match Embed**: The Discord summary of match metadata, roster placement, team performance, and difficulty.

**Player Embed**: The Discord summary of one player's match stats and telemetry-derived performance.

**Coaching Embed**: The optional Discord section containing evidence-backed coaching for the analyzed players.
