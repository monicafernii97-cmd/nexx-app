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
          <div className="w-14 h-14 rounded-2xl mx-auto mb-6 flex items-center justify-center bg-[linear-gradient(135deg,#60A5FA,#2563EB)] shadow-[0_8px_32px_rgba(96,165,250,0.4)] border border-white/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-white/10" />
            <span className="text-white font-serif font-bold text-2xl drop-shadow-sm relative z-10 mt-1">
              <i>N</i>
            </span>
          </div>
          <p className="text-[13px] font-bold text-white tracking-[0.2em] uppercase drop-shadow-sm">Loading...</p>
        </motion.div>
      </div>
    );
  }


  // Only render welcome page for unauthenticated users
  return (
    <div className="bg-[#0A1128] min-h-screen flex flex-col justify-center relative overflow-hidden font-sans">
      {/* Jumbo Background NEXX Shimmer */}
      <div className="absolute inset-0 flex items-center pointer-events-none z-0 overflow-hidden opacity-[0.03]">
        <motion.h1
           initial={{ x: '100vw' }}
           animate={{ x: '-100vw' }}
           transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
           className="text-[35vw] font-black font-serif italic tracking-tighter whitespace-nowrap select-none"
           style={{
               background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.2) 100%)',
               backgroundSize: '200% auto',
               WebkitBackgroundClip: 'text',
               WebkitTextFillColor: 'transparent',
               color: 'transparent',
               animation: 'shimmer-bg 4s linear infinite',
           }}
        >
          NEXX
        </motion.h1>
      </div>

      {/* Ambient Radial Gradients */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[var(--sapphire-base)]/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[50%] bg-[#1A4B9B]/20 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 xl:px-24 z-10 relative mt-[-10vh]">
        
        {/* Logo Mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-10 shadow-[0_4px_20px_rgba(229,168,74,0.15)] border border-[rgba(229,168,74,0.3)] bg-gradient-to-br from-[#123D7E] to-[#0A1128]"
        >
          <span className="text-[26px] font-black font-serif italic uppercase tracking-tighter text-[var(--champagne)]">N</span>
        </motion.div>

        {/* WELCOME TO NEXX */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-[11px] md:text-xs font-bold tracking-[0.25em] uppercase text-[var(--champagne)] mb-5"
        >
          Welcome to NEXX
        </motion.p>

        {/* Huge Headlines */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="font-serif font-bold italic tracking-tight mb-8"
        >
          <h2 className="text-6xl md:text-7xl lg:text-[5.5rem] leading-[1.05] text-white">Your corner.</h2>
          <h2 className="text-6xl md:text-7xl lg:text-[5.5rem] leading-[1.05] text-white">Your calm.</h2>
          <h2 className="text-6xl md:text-7xl lg:text-[5.5rem] leading-[1.05] text-[rgba(255,255,255,0.4)]">Your case.</h2>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-base md:text-[17px] text-[rgba(255,255,255,0.7)] max-w-xl leading-[1.6] mb-12 font-medium"
        >
          Strategic empowerment and refined counsel, designed for parents who need clarity, documentation, and peace of mind.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="flex flex-col sm:flex-row items-start gap-4"
        >
          <Link href="/sign-up">
            <button className="btn-primary w-full sm:w-auto px-8 py-3.5 text-[13px]">
              Get Started
            </button>
          </Link>
          <Link href="/sign-in">
            <button className="btn-outline w-full sm:w-auto px-8 py-3.5 text-[13px] hover:bg-[rgba(255,255,255,0.1)] border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.9)] hover:border-[rgba(255,255,255,0.3)]">
              Sign In
            </button>
          </Link>
        </motion.div>

      </div>

      {/* Bottom Footer Text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 1 }}
        className="absolute bottom-8 left-0 right-0 text-center text-[10px] md:text-xs tracking-[0.25em] font-semibold text-[rgba(255,255,255,0.3)] uppercase"
      >
        Secure. Private. Empowering.
      </motion.p>
    </div>
  );
}

