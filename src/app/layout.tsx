import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { ConvexClientProvider } from '@/lib/convex-provider';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEXX — Your Corner. Your Calm. Your Case.',
  description: 'AI-powered legal counsel, emotional support, and strategic empowerment for parents navigating co-parenting with a narcissistic ex.',
  icons: { icon: '/favicon.ico' },
};

/** Root HTML layout with Outfit font and Convex/Clerk providers. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="antialiased">
        <ConvexClientProvider>
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
