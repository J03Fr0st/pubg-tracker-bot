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

  it('builds a summary containing the monitored roster and full lobby', () => {
    const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'Player1',
    ]);

    expect(summary?.players.map((player) => player.name)).toEqual(['Player1', 'TeamMate']);
    expect(summary?.lobbyPlayers).toHaveLength(3);
    expect(summary?.teamRank).toBe(3);
  });

  it('returns null when no monitored player participated', () => {
    const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'Absent',
    ]);

    expect(summary).toBeNull();
  });

  it('includes a monitored participant without a roster', () => {
    const response = makeMatchResponse();
    const roster = response.included.find(
      (item) => item.type === 'roster' && item.id === 'roster-1'
    );
    if (roster?.type === 'roster') {
      roster.relationships.participants.data = roster.relationships.participants.data.filter(
        (participant) => participant.id !== 'participant-1'
      );
    }

    const summary = interpreter.createSummary(interpreter.interpret(response), ['Player1']);

    expect(summary?.players.map((player) => player.name)).toEqual(['Player1']);
    expect(summary?.teamRank).toBe(3);
  });

  it('deduplicates monitored names while selecting every monitored roster', () => {
    const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'Player1',
      'Player1',
      'Opponent',
    ]);

    expect(summary?.players.map((player) => player.name)).toEqual([
      'Player1',
      'TeamMate',
      'Opponent',
    ]);
  });

  it('omits team rank when monitored players have different placements', () => {
    const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'Player1',
      'Opponent',
    ]);

    expect(summary?.teamRank).toBeUndefined();
  });
});
