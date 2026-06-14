# PUBG-TS Batch Season Stats Request

## Summary

Yes, `pubg-ts` can support a faster path for lobby difficulty. The PUBG API has a batch season-stats endpoint for up to 10 players at a time, but `@j03fr0st/pubg-ts` currently exposes only single-player season stats through `players.getPlayerSeasonStats(...)`.

Adding a typed wrapper around the batch endpoint would let consumers replace many single-player requests with chunks of 10, reducing cold-cache lobby difficulty from roughly one request per human player to one request per 10 human players.

## Evidence

Official PUBG docs say batch requests should be used when possible because season/lifetime stats and player lookups can be requested in batches of up to 10 players. The documented season-stats batch URL is:

```text
GET /shards/{platform}/seasons/{seasonId}/gameMode/{gameMode}/players?filter[playerIds]={id1},{id2}
```

The same docs also describe the lifetime equivalent:

```text
GET /shards/{platform}/seasons/lifetime/gameMode/{gameMode}/players?filter[playerIds]={id1},{id2}
```

The default PUBG API rate limit is 10 requests per minute for testing/development API keys, so batching can reduce the rate-limited request count by up to 10x.

Sources:
- https://documentation.pubg.com/en/getting-started.html#making-batch-requests
- https://documentation.pubg.com/en/rate-limits.html
- https://documentation.pubg.com/en/changelog/changelog.html

## Current `pubg-ts` Gap

Current SDK method:

```ts
client.players.getPlayerSeasonStats({
  playerId,
  seasonId,
  gameMode,
});
```

Current URL shape:

```text
/shards/{shard}/players/{playerId}/seasons/{seasonId}
```

That is correct for one player, but it cannot use the documented batch endpoint.

## Proposed API

Add these query types:

```ts
export interface PlayerSeasonStatsBatchQuery {
  seasonId: string;
  gameMode: GameMode;
  playerIds: string[];
}

export interface PlayerLifetimeStatsBatchQuery {
  gameMode: GameMode;
  playerIds: string[];
}
```

Add these methods on `PlayersService`:

```ts
async getPlayerSeasonStatsBatch(
  query: PlayerSeasonStatsBatchQuery
): Promise<PlayerSeasonStatsResponse>;

async getPlayerLifetimeStatsBatch(
  query: PlayerLifetimeStatsBatchQuery
): Promise<PlayerSeasonStatsResponse>;
```

The existing `PlayerSeasonStatsResponse` type should still work if `ApiResponse<T>` supports array data. If it does not, introduce:

```ts
export type PlayerSeasonStatsBatchResponse = ApiResponse<PlayerSeasonStats>;
```

and ensure `data` is typed as `PlayerSeasonStats[]`.

## URL Construction

Implementation should use the existing endpoint helpers:

```ts
const params = new URLSearchParams();
appendArrayFilter(params, 'filter[playerIds]', query.playerIds);

return this.httpClient.get<PlayerSeasonStatsResponse>(
  appendQuery(
    shardPath(this.shard, `/seasons/${query.seasonId}/gameMode/${query.gameMode}/players`),
    params
  )
);
```

Lifetime variant:

```ts
shardPath(this.shard, `/seasons/lifetime/gameMode/${query.gameMode}/players`)
```

## Validation

Recommended SDK behavior:

- Reject `playerIds.length === 0` with a clear error.
- Reject `playerIds.length > 10` because the PUBG endpoint limit is 10.
- Keep existing single-player methods unchanged for backward compatibility.
- Do not silently chunk inside the low-level method; let callers choose chunking so request counts stay visible.

## Tests

Add unit tests in `tests/unit/services/players.test.ts`:

- `getPlayerSeasonStatsBatch` calls:
  ```text
  /shards/pc-na/seasons/season-1/gameMode/squad-fpp/players?filter%5BplayerIds%5D=player-1%2Cplayer-2
  ```
- `getPlayerLifetimeStatsBatch` calls:
  ```text
  /shards/pc-na/seasons/lifetime/gameMode/squad-fpp/players?filter%5BplayerIds%5D=player-1%2Cplayer-2
  ```
- Empty `playerIds` rejects.
- More than 10 `playerIds` rejects.

## Consumer Impact

`pubg-tracker-bot` can then update `PlayerStatsService` to:

1. Dedupe human account IDs.
2. Load fresh cached stats.
3. Chunk missing IDs into groups of 10.
4. Call `client.players.getPlayerSeasonStatsBatch(...)` once per chunk.
5. Extract the requested `gameMode` stats per returned player.
6. Cache results exactly as it does today.

This keeps all PUBG API calls inside `pubg-ts` and should make full-lobby difficulty practical without direct `fetch` calls in the bot.
