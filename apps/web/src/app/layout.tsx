import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { AuthCleanup } from '@/components/auth/auth-cleanup';
import { AuthBootstrap } from '@/components/auth/auth-bootstrap';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'Duel Quiz - 1v1 Knowledge Battle',
  description: 'Challenge your friends to a knowledge duel!',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className={`${inter.className} bg-pattern safe-area-top safe-area-bottom`}>
        <AuthCleanup />
        <AuthBootstrap />
        <main className="min-h-screen flex flex-col">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
