import type { Metadata } from 'next';
import './globals.css';
import { ConvexClientProvider } from '@/lib/convex-provider';

export const metadata: Metadata = {
  title: 'NEXX — Your Corner. Your Calm. Your Case.',
  description: 'AI-powered legal counsel, emotional support, and strategic empowerment for parents navigating co-parenting with a narcissistic ex.',
  icons: { icon: '/favicon.ico' },
};

/** Root HTML layout with Convex/Clerk providers and deterministic font fallbacks. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme — runs before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nexx-theme');var d=document.documentElement;if(t==='light'){d.classList.remove('dark');d.classList.add('light')}else{d.classList.add('dark');d.classList.remove('light')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <ConvexClientProvider>
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}

