import { mkdir } from 'fs/promises';
import { join } from 'path';

export async function ensureDataDirectory(): Promise<void> {
  const dataDir = join(__dirname, '../../data');
  try {
    await mkdir(dataDir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
} 