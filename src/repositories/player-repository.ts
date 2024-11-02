import { readFile, writeFile } from "fs/promises";
import { join } from "path";

interface StoredPlayer {
  readonly name: string;
  lastMatchId?: string;
  readonly addedAt: string;
}

export class PlayerRepository {
  private readonly storageFile: string;
  private players: StoredPlayer[];

  constructor() {
    this.storageFile = join(__dirname, "../../data/players.json");
    this.players = [];
  }

  public async initialize(): Promise<void> {
    try {
      const data = await readFile(this.storageFile, "utf-8");
      this.players = JSON.parse(data);
    } catch (error) {
      this.players = [];
      await this.saveToFile();
    }
  }

  public async addPlayer(playerName: string): Promise<void> {
    const normalizedName = playerName.toLowerCase();
    if (
      this.players.some(
        (player) => player.name.toLowerCase() === normalizedName
      )
    ) {
      throw new Error("Player already exists in monitoring list");
    }

    const newPlayer: StoredPlayer = {
      name: playerName,
      addedAt: new Date().toISOString(),
    };

    this.players.push(newPlayer);
    await this.saveToFile();
  }

  public async removePlayer(playerName: string): Promise<void> {
    const normalizedName = playerName.toLowerCase();
    const initialLength = this.players.length;

    this.players = this.players.filter(
      (player) => player.name.toLowerCase() !== normalizedName
    );

    if (this.players.length === initialLength) {
      throw new Error("Player not found in monitoring list");
    }

    await this.saveToFile();
  }

  public async getPlayers(): Promise<string[]> {
    return this.players.map((player) => player.name);
  }

  public async updateLastMatch(
    playerName: string,
    matchId: string
  ): Promise<void> {
    const player = this.players.find(
      (p) => p.name.toLowerCase() === playerName.toLowerCase()
    );

    if (!player) {
      throw new Error("Player not found");
    }

    player.lastMatchId = matchId;
    await this.saveToFile();
  }

  public async getLastMatchId(playerName: string): Promise<string | undefined> {
    const player = this.players.find(
      (p) => p.name.toLowerCase() === playerName.toLowerCase()
    );
    return player?.lastMatchId;
  }

  private async saveToFile(): Promise<void> {
    try {
      await writeFile(
        this.storageFile,
        JSON.stringify(this.players, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error("Failed to save players to file:", error);
      throw new Error("Failed to save player data");
    }
  }
}
