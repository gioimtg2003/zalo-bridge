import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { Credentials } from 'zca-js';

export async function loadCredentials(credentialsPath: string): Promise<Credentials | null> {
  try {
    if (existsSync(credentialsPath)) {
      const raw = await readFile(credentialsPath, 'utf-8');
      return JSON.parse(raw) as Credentials;
    }
  } catch {
    console.warn('Failed to load stored credentials');
  }
  return null;
}

export async function saveCredentials(credentialsPath: string, creds: Credentials): Promise<void> {
  try {
    const dir = dirname(credentialsPath);
    await mkdir(dir, { recursive: true });
    await writeFile(credentialsPath, JSON.stringify(creds, null, 2), 'utf-8');
    console.log('Credentials saved to', credentialsPath);
  } catch (err) {
    console.error('Failed to save credentials:', err);
  }
}
