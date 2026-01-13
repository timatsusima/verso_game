import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate invite link for a duel
 */
export function generateInviteLink(duelId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  console.log('[generateInviteLink] NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL, 'baseUrl:', baseUrl);
  return `${baseUrl}/duel/${duelId}/join`;
}

/**
 * Generate Telegram share link
 */
export function generateTelegramShareLink(duelId: string, topic: string): string {
  const inviteLink = generateInviteLink(duelId);
  const text = encodeURIComponent(`🎯 Вызываю тебя на дуэль!\n\nТема: ${topic}\n\nПрисоединяйся:`);
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
