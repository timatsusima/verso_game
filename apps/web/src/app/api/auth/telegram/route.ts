import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInitData, createToken } from '@/lib/auth';
import { AuthTelegramSchema } from '@tg-duel/shared';
import type { Language } from '@tg-duel/shared';

export async function POST(request: NextRequest) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
  const hasBotToken = !!TELEGRAM_BOT_TOKEN;

  try {
    const body = await request.json();
    
    // Validate request body
    const parsed = AuthTelegramSchema.safeParse(body);
    if (!parsed.success) {
      console.log('[Auth] Invalid request body');
      return NextResponse.json(
        { ok: false, code: 'INVALID_REQUEST', error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { initData } = parsed.data;

    console.log('[Auth] Auth attempt, initData length:', initData?.length, 'hasBotToken:', hasBotToken);

    // Check if initData is expired (before validation)
    let isExpired = false;
    let authDateDiff = null;
    if (initData && !initData.startsWith('dev:')) {
      try {
        const urlParams = new URLSearchParams(initData);
        const authDate = urlParams.get('auth_date');
        if (authDate) {
          const authTimestamp = parseInt(authDate, 10);
          const now = Math.floor(Date.now() / 1000);
          authDateDiff = now - authTimestamp;
          if (authDateDiff > 86400) { // 24 hours
            isExpired = true;
            console.log('[Auth] InitData expired, diff:', authDateDiff, 'seconds');
          } else {
            console.log('[Auth] InitData auth_date diff:', authDateDiff, 'seconds (valid)');
          }
        }
      } catch (e) {
        console.log('[Auth] Failed to parse auth_date');
      }
    }

    // Validate Telegram initData
    const telegramUser = validateInitData(initData);
    if (!telegramUser) {
      console.error('[Auth] validateInitData returned null, isExpired:', isExpired, 'authDateDiff:', authDateDiff);
      
      // Return specific error code if initData expired
      if (isExpired) {
        return NextResponse.json(
          { ok: false, code: 'INITDATA_EXPIRED', error: 'InitData expired' },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { ok: false, code: 'INITDATA_INVALID', error: 'InitData invalid' },
        { status: 401 }
      );
    }

    console.log('Auth success for user:', telegramUser.id, telegramUser.first_name);

    // Determine language from Telegram
    const language: Language = telegramUser.language_code?.startsWith('ru') ? 'ru' : 'en';

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId: String(telegramUser.id) },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: String(telegramUser.id),
          username: telegramUser.username || null,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name || null,
          photoUrl: telegramUser.photo_url || null,
          language,
        },
      });
    } else {
      // Update user info if changed
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: telegramUser.username || null,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name || null,
          photoUrl: telegramUser.photo_url || null,
        },
      });
    }

    // Create JWT token
    const token = await createToken({
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      language: user.language as Language,
    });

    return NextResponse.json({
      ok: true,
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        language: user.language as Language,
      },
    });
  } catch (error) {
    console.error('[Auth] Server error:', error);
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', error: 'Internal server error' },
      { status: 500 }
    );
  }
}
