import { MatchInterpreter } from '../../../src/services/match-interpreter.service';
import { makeMatchResponse } from '../../fixtures/match-response.fixture';

describe('MatchInterpreter', () => {
  const interpreter = new MatchInterpreter();

  it('normalizes metadata, participants, rosters, and telemetry once', () => {
    const match = interpreter.interpret(makeMatchResponse());

    expect(match).toMatchObject({
      matchId: 'match-xyz',
      mapName: 'Baltic_Main',
      gameMode: 'squad-fpp',
      telemetryUrl: 'https://telemetry.example.com/match.json',
    });
    expect(match.playedAt).toEqual(new Date('2026-07-14T08:00:00.000Z'));
    expect(match.rosters[0].participantIds).toEqual(['participant-1', 'participant-2']);
    expect(match.participants.map((player) => player.name)).toEqual([
      'Player1',
      'TeamMate',
      'Opponent',
    ]);
  });

  it('omits telemetry when the match has no telemetry asset', () => {
    const response = makeMatchResponse();
    response.included = response.included.filter((item) => item.type !== 'asset');

    const match = interpreter.interpret(response);

    expect(match).not.toHaveProperty('telemetryUrl');
  });

  it('separates monitored, roster, and lobby participants by PUBG account ID', () => {
    const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'account.1',
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.monitoredPlayers).toEqual([
      expect.objectContaining({
        pubgId: 'account.1',
        name: 'Player1',
        rosterId: 'roster-1',
      }),
    ]);
    expect(
      summary?.rosterParticipants.map(({ pubgId, rosterId }) => ({ pubgId, rosterId }))
    ).toEqual([
      { pubgId: 'account.1', rosterId: 'roster-1' },
      { pubgId: 'account.2', rosterId: 'roster-1' },
    ]);
    expect(summary?.lobbyParticipants.map((participant) => participant.pubgId)).toEqual([
      'account.1',
      'account.2',
      'account.3',
    ]);
    expect(summary?.teamRank).toBe(3);
    expect(summary).not.toHaveProperty('players');
    expect(summary).not.toHaveProperty('lobbyPlayers');
  });

  it('returns null when no monitored PUBG account participated', () => {
    const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'account.absent',
    ]);

    expect(summary).toBeNull();
  });

  it('keeps a monitored participant without a roster and records rosterId null', () => {
    const response = makeMatchResponse();
    const roster = response.included.find(
      (item) => item.type === 'roster' && item.id === 'roster-1'
    );
    if (roster?.type === 'roster') {
      roster.relationships.participants.data = roster.relationships.participants.data.filter(
        (participant) => participant.id !== 'participant-1'
      );
    }

    const summary = interpreter.createSummary(interpreter.interpret(response), ['account.1']);

    expect(summary?.monitoredPlayers).toEqual([
      expect.objectContaining({ pubgId: 'account.1', rosterId: null }),
    ]);
    expect(summary?.rosterParticipants).toEqual([
      expect.objectContaining({ pubgId: 'account.1', rosterId: null }),
    ]);
    expect(summary?.teamRank).toBe(3);
  });

  it('deduplicates monitored account IDs while selecting every monitored roster', () => {
    const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'account.1',
      'account.1',
      'account.3',
    ]);

    expect(summary?.monitoredPlayers.map((participant) => participant.pubgId)).toEqual([
      'account.1',
      'account.3',
    ]);
    expect(summary?.rosterParticipants.map((participant) => participant.pubgId)).toEqual([
      'account.1',
      'account.2',
      'account.3',
    ]);
  });

  it('does not select a renamed account by its old display name', () => {
    const match = interpreter.interpret(makeMatchResponse());
    match.participants[0].name = 'RenamedPlayer';

    const summary = interpreter.createSummary(match, ['account.1']);

    expect(summary?.monitoredPlayers).toEqual([
      expect.objectContaining({ pubgId: 'account.1', name: 'RenamedPlayer' }),
    ]);
  });

  it('omits team rank when monitored players have different placements', () => {
    const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'account.1',
      'account.3',
    ]);

    expect(summary?.teamRank).toBeUndefined();
  });
});
