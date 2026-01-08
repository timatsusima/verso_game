import { jwtVerify } from 'jose';
import type { Language } from '@tg-duel/shared';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'development-secret-key-change-in-production'
);

export interface TokenPayload {
  userId: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  language: Language;
}

/**
 * Verifies and decodes a JWT token
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}
