import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import type { Language } from '@tg-duel/shared';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'development-secret-key-change-in-production'
);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TokenPayload {
  userId: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  language: Language;
}

/**
 * Validates Telegram initData using HMAC-SHA256
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string): TelegramUserData | null {
  // For development without Telegram
  if (process.env.NODE_ENV === 'development' && initData.startsWith('dev:')) {
    const devData = initData.slice(4);
    try {
      return JSON.parse(devData) as TelegramUserData;
    } catch {
      return null;
    }
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) return null;

    // Remove hash from params and sort
    urlParams.delete('hash');
    const params = Array.from(urlParams.entries());
    params.sort((a, b) => a[0].localeCompare(b[0]));
    
    const dataCheckString = params
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Calculate secret key
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(TELEGRAM_BOT_TOKEN)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      console.error('Invalid hash');
      return null;
    }

    // Check auth_date (valid for 1 hour)
    const authDate = urlParams.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10);
      const now = Math.floor(Date.now() / 1000);
      if (now - authTimestamp > 3600) {
        console.error('Auth data expired');
        return null;
      }
    }

    // Parse user data
    const userStr = urlParams.get('user');
    if (!userStr) return null;

    return JSON.parse(userStr) as TelegramUserData;
  } catch (error) {
    console.error('Failed to validate initData:', error);
    return null;
  }
}

/**
 * Creates a JWT token for authenticated user
 */
export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
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

/**
 * Extracts token from Authorization header
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
