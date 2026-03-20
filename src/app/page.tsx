'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { WarningCircle } from '@phosphor-icons/react';

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

  // Welcome page for unauthenticated users — asymmetric split layout
  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden" style={{ background: 'var(--zinc-950)' }}>
      {/* Subtle ambient mesh gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px]"
          style={{
            background: 'radial-gradient(circle, rgba(5, 150, 105, 0.08) 0%, transparent 70%)',
            top: '10%',
            right: '5%',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px]"
          style={{
            background: 'radial-gradient(circle, rgba(63, 63, 70, 0.3) 0%, transparent 70%)',
            bottom: '20%',
            left: '10%',
          }}
        />
      </div>

      {/* Main content — left-aligned, asymmetric */}
      <div className="flex-1 flex items-center relative z-10">
        <div className="w-full max-w-7xl mx-auto px-8 md:px-16 lg:px-24">
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
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="text-xs font-semibold tracking-[0.25em] uppercase mb-5"
                style={{ color: 'var(--emerald-500)' }}
              >
                Welcome to NEXX
              </motion.p>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.7 }}
                className="text-headline text-4xl md:text-6xl mb-6"
                style={{ color: 'var(--zinc-100)' }}
              >
                Your corner.<br />
                Your calm.<br />
                <span style={{ color: 'var(--zinc-500)' }}>Your case.</span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="text-base leading-relaxed mb-10 max-w-[50ch]"
                style={{ color: 'var(--zinc-400)' }}
              >
                Strategic empowerment and refined counsel,
                designed for parents who need clarity, documentation, and peace of mind.
              </motion.p>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.5 }}
                className="flex flex-wrap gap-4"
              >
                <Link href="/sign-up">
                  <button className="btn-primary text-sm tracking-wide px-8 py-3.5">
                    Get Started
                  </button>
                </Link>
                <Link href="/sign-in">
                  <button className="btn-outline text-sm px-8 py-3.5">
                    Sign In
                  </button>
                </Link>
              </motion.div>
            </motion.div>

            {/* Right: Empty space / visual breathing room — 2/5 */}
            <div className="hidden md:block md:col-span-2" />
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
