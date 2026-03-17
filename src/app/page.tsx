'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Welcome / landing page and auth-aware router.
 *
 * - Unauthenticated visitors see the branded welcome page with sign-in/up CTAs.
 * - Authenticated users are redirected based on their Convex user record:
 *   - `onboardingComplete === true` → `/dashboard`
 *   - Otherwise → `/onboarding`
 *
 * Uses `useConvexAuth()` to wait for the Clerk JWT to sync to Convex before
 * querying `users.me`, preventing a race condition where Clerk reports
 * `isSignedIn` before Convex has the auth token.
 */
export default function WelcomePage() {
  const { isSignedIn, isLoaded: clerkLoaded } = useAuth();
  const { signOut } = useClerk();
  // useConvexAuth waits for the Clerk JWT to be synced to Convex.
  // This prevents a race where Clerk says "signed in" but Convex
  // hasn't received the token yet, causing users.me to return null.
  const { isAuthenticated: convexReady, isLoading: convexLoading } = useConvexAuth();
  const router = useRouter();

  // Only query when Convex auth is fully synced (not just Clerk signed-in)
  const currentUser = useQuery(
    api.users.me,
    convexReady ? {} : 'skip'
  );

  // Terminal state: Clerk is signed in but Convex auth failed to sync
  const convexAuthFailed = clerkLoaded && isSignedIn && !convexLoading && !convexReady;

  // Smart redirect for returning users
  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn) return; // Not signed in — show welcome page

    // Wait for Convex auth to sync before making routing decisions
    if (convexLoading) return;

    // If Convex auth settled as unauthenticated, don't route — the
    // error UI below will handle this terminal state.
    if (!convexReady) return;

    // Signed in + Convex ready — wait for user data to load
    if (currentUser === undefined) return; // Still loading

    if (currentUser === null) {
      // Signed in but no Convex record yet — send to onboarding
      router.replace('/onboarding');
    } else if (currentUser.onboardingComplete) {
      // Returning user — straight to dashboard
      router.replace('/dashboard');
    } else {
      // Has account but hasn't finished onboarding
      router.replace('/onboarding');
    }
  }, [clerkLoaded, isSignedIn, convexLoading, convexReady, currentUser, router]);

  // Terminal auth error: Clerk signed in but Convex token sync failed
  if (convexAuthFailed) {
    return (
      <div className="silk-bg min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center max-w-sm px-6"
        >
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: 'rgba(199, 90, 90, 0.15)',
              border: '1px solid rgba(199, 90, 90, 0.3)',
            }}
          >
            <span className="text-lg" style={{ color: '#C75A5A' }}>!</span>
          </div>
          <p className="text-sm font-semibold mb-2" style={{ color: '#F7F2EB' }}>
            Connection issue
          </p>
          <p className="text-xs mb-5" style={{ color: '#FFF9F0' }}>
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

  // Show loading state while checking auth
  if (!clerkLoaded || convexLoading || (isSignedIn && currentUser === undefined)) {
    return (
      <div className="silk-bg min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #FFF9F0, #D0E3FF)',
              boxShadow: '0 8px 32px rgba(208, 227, 255, 0.3)',
            }}
          >
            <span className="text-lg font-black" style={{ color: '#0A1E54' }}>N</span>
          </div>
          <p className="text-sm" style={{ color: '#FFF9F0' }}>Loading...</p>
        </motion.div>
      </div>
    );
  }


  // Only render welcome page for unauthenticated users
  return (
    <div className="silk-bg min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Ambient Gold Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 200 + i * 80,
              height: 200 + i * 80,
              background: `radial-gradient(circle, rgba(208, 227, 255, ${0.03 + i * 0.01}) 0%, transparent 70%)`,
              left: `${10 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              x: [0, 20, -10, 0],
              y: [0, -15, 10, 0],
              scale: [1, 1.05, 0.98, 1],
            }}
            transition={{
              duration: 8 + i * 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.25, 1, 0.5, 1] }}
        className="text-center z-10 px-6 max-w-lg"
      >
        {/* Logo Mark */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
          className="mx-auto mb-8 w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #FFF9F0, #D0E3FF)',
            boxShadow: '0 8px 32px rgba(208, 227, 255, 0.3)',
          }}
        >
          <span className="text-2xl font-black" style={{ color: '#0A1E54' }}>N</span>
        </motion.div>

        {/* Title */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-sm font-medium tracking-[0.3em] uppercase mb-4"
          style={{ color: '#D0E3FF' }}
        >
          Welcome to
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="font-serif text-6xl md:text-7xl font-bold italic tracking-wide mb-6"
          style={{ color: '#F7F2EB' }}
        >
          <span className="shimmer">NEXX</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="text-base md:text-lg leading-relaxed mb-10"
          style={{ color: '#D0E3FF' }}
        >
          Experience the pinnacle of luxury<br />
          management and refined security.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.6 }}
          className="space-y-4"
        >
          <Link href="/sign-up">
            <button
              className="w-full max-w-xs text-sm tracking-[0.15em] uppercase font-semibold py-3 px-7 rounded-lg cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
              style={{
                background: '#FFF9F0',
                color: '#0A1E54',
                border: '1px solid rgba(208, 227, 255, 0.2)',
              }}
            >
              Begin Your Journey
            </button>
          </Link>

          <div className="pt-2">
            <Link href="/sign-in">
              <button className="btn-outline w-full max-w-xs text-sm tracking-[0.1em]">
                Sign In
              </button>
            </Link>
          </div>
        </motion.div>
      </motion.div>

      {/* Bottom Tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-8 text-xs tracking-[0.2em] uppercase font-serif italic"
        style={{ color: '#FFF9F0' }}
      >
        Your Corner. Your Calm. Your Case.
      </motion.p>
    </div>
  );
}

