'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { WarningCircle, ArrowRight } from '@phosphor-icons/react';

/**
 * Welcome / landing page and auth-aware router.
 *
 * - Unauthenticated visitors see the branded welcome page with sign-in/up CTAs.
 * - Authenticated users are redirected based on their Convex user record:
 *   - `onboardingComplete === true` → `/dashboard`
 *   - Otherwise → `/onboarding`
 */
export default function WelcomePage() {
  const { isSignedIn, isLoaded: clerkLoaded } = useAuth();
  const { signOut } = useClerk();
  const { isAuthenticated: convexReady, isLoading: convexLoading } = useConvexAuth();
  const router = useRouter();

  const currentUser = useQuery(
    api.users.me,
    convexReady ? {} : 'skip'
  );

  const convexAuthFailed = clerkLoaded && isSignedIn && !convexLoading && !convexReady;

  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn) return;
    if (convexLoading) return;
    if (!convexReady) return;
    if (currentUser === undefined) return;

    if (currentUser === null) {
      router.replace('/onboarding');
    } else if (currentUser.onboardingComplete) {
      router.replace('/dashboard');
    } else {
      router.replace('/onboarding');
    }
  }, [clerkLoaded, isSignedIn, convexLoading, convexReady, currentUser, router]);

  // Terminal auth error
  if (convexAuthFailed) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: 'var(--zinc-950)' }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center max-w-sm px-6"
        >
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            <WarningCircle size={22} weight="fill" style={{ color: 'var(--danger)' }} />
          </div>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--zinc-100)' }}>
            Connection issue
          </p>
          <p className="text-xs mb-5" style={{ color: 'var(--zinc-400)' }}>
            We couldn&apos;t sync your session. Please try signing in again.
          </p>
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            className="btn-outline text-xs"
          >
            Sign in again
          </button>
        </motion.div>
      </div>
    );
  }

  // Loading state
  if (!clerkLoaded || convexLoading || (isSignedIn && currentUser === undefined)) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: 'var(--zinc-950)' }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: 'var(--emerald-600)',
              boxShadow: '0 8px 24px rgba(5, 150, 105, 0.3)',
            }}
          >
            <span className="text-lg font-bold text-white">N</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--zinc-400)' }}>Loading...</p>
        </motion.div>
      </div>
    );
  }

  // Welcome page for unauthenticated users — Ethereal Glass Split Layout
  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden" style={{ background: 'var(--base-bg)' }}>
      {/* Subtle Ethereal Glass Radial Mesh Gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute w-[800px] h-[800px] rounded-full blur-[140px]"
          style={{
            background: 'radial-gradient(circle, rgba(5, 150, 105, 0.05) 0%, transparent 70%)',
            top: '-10%',
            right: '-10%',
          }}
        />
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px]"
          style={{
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.02) 0%, transparent 60%)',
            bottom: '-20%',
            left: '5%',
          }}
        />
      </div>

      {/* Main content — left-aligned, asymmetric */}
      <div className="flex-1 flex items-center relative z-10 w-full max-w-[1400px] mx-auto px-8 md:px-16 lg:px-24 py-24">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-12 items-center">
            {/* Left: Content — takes 3/5 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
              className="md:col-span-3"
            >
              {/* Logo Mark */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
                className="mb-10 w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--emerald-600)',
                  boxShadow: '0 8px 32px rgba(5, 150, 105, 0.3)',
                }}
              >
                <span className="text-xl font-bold text-white">N</span>
              </motion.div>

              {/* Eyebrow */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="mb-8"
              >
                <span className="rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-white/10" style={{ color: 'var(--zinc-400)', background: 'rgba(255,255,255,0.03)' }}>
                  A Premium Standard
                </span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
                className="text-headline text-5xl md:text-7xl mb-8 tracking-tighter"
                style={{ color: 'var(--zinc-100)', letterSpacing: '-0.04em' }}
              >
                Your corner.<br />
                Your calm.<br />
                <span style={{ color: 'var(--zinc-600)' }}>Your case.</span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
                className="text-lg md:text-xl leading-relaxed mb-12 max-w-[45ch] font-light"
                style={{ color: 'var(--zinc-400)' }}
              >
                Strategic empowerment and refined counsel,
                designed for parents who need absolute clarity, documentation, and peace of mind.
              </motion.p>

              {/* CTA Buttons — Nested Button Architecture */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.6 }}
                className="flex flex-wrap gap-5 items-center"
              >
                <Link href="/sign-up" className="no-underline">
                  <button className="btn-primary pl-6 pr-2 py-2 flex items-center gap-4 group">
                    <span className="text-sm tracking-wide">Get Started</span>
                    <div className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center transition-transform group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:scale-105">
                      <ArrowRight size={14} weight="bold" />
                    </div>
                  </button>
                </Link>
                <Link href="/sign-in" className="no-underline">
                  <button className="btn-ghost px-6 py-3.5" style={{ color: 'var(--zinc-400)' }}>
                    Sign In
                  </button>
                </Link>
              </motion.div>
            </motion.div>

            {/* Right: Floating Ethereal Glass Panel */}
            <div className="hidden md:block md:col-span-2 relative">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.8 }}
                    className="aspect-[4/5] w-full rounded-[2.5rem] card-premium flex flex-col justify-end p-8"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 40px 80px -20px rgba(0,0,0,0.8)'
                    }}
                >
                    <div className="w-full h-px bg-white/10 mb-6" />
                    <p className="text-sm tracking-widest uppercase font-medium" style={{ color: 'var(--zinc-500)' }}>Secure Vault</p>
                    <p className="text-2xl font-light mt-2 tracking-tight">AES-256 Encrypted.</p>
                </motion.div>
          </div>
        </div>
      </div>

      {/* Bottom Tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1.5, duration: 0.8 }}
        className="text-center pb-8 text-xs tracking-[0.15em] uppercase"
        style={{ color: 'var(--zinc-500)' }}
      >
        Secure. Private. Empowering.
      </motion.p>
    </div>
  );
}
