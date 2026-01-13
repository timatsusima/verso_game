import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInitData, createToken } from '@/lib/auth';
import { AuthTelegramSchema } from '@tg-duel/shared';
import type { Language } from '@tg-duel/shared';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const parsed = AuthTelegramSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { initData } = parsed.data;

    console.log('Auth attempt, initData length:', initData?.length);

    // Validate Telegram initData
    const telegramUser = validateInitData(initData);
    if (!telegramUser) {
      console.error('Auth failed: validateInitData returned null');
      return NextResponse.json(
        { error: 'Invalid or expired initData' },
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
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
