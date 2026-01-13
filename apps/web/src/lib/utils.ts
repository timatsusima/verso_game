import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate invite link for a duel (Telegram Mini App format)
 */
export function generateInviteLink(duelId: string): string {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'vrs_game_bot';
  const appName = process.env.NEXT_PUBLIC_TELEGRAM_APP_NAME || 'app';
  
  // Use Telegram Mini App deep link format
  return `https://t.me/${botUsername}/${appName}?startapp=join_${duelId}`;
}

/**
 * Generate Telegram share link
 */
export function generateTelegramShareLink(duelId: string, topic: string): string {
  const inviteLink = generateInviteLink(duelId);
  const text = encodeURIComponent(`🎯 Вызываю тебя на дуэль!\n\nТема: ${topic}`);
  return `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${text}`;
}

/**
 * Format time in seconds to MM:SS
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format short time (just seconds)
 */
export function formatShortTime(seconds: number): string {
  return `${seconds}s`;
}

/**
 * Delay utility
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
