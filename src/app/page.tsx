'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function WelcomePage() {
  const { isSignedIn, isLoaded: clerkLoaded } = useAuth();
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

  // Smart redirect for returning users
  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn) return; // Not signed in — show welcome page

    // Wait for Convex auth to sync before making routing decisions
    if (convexLoading) return;

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
  }, [clerkLoaded, isSignedIn, convexLoading, currentUser, router]);

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
              background: 'linear-gradient(135deg, #C58B07, #E5B84A)',
              boxShadow: '0 8px 32px rgba(197, 139, 7, 0.3)',
            }}
          >
            <span className="text-lg font-black" style={{ color: '#02022d' }}>N</span>
          </div>
          <p className="text-sm" style={{ color: '#8A7A60' }}>Loading...</p>
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
              background: `radial-gradient(circle, rgba(197, 139, 7, ${0.03 + i * 0.01}) 0%, transparent 70%)`,
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
            background: 'linear-gradient(135deg, #C58B07, #E5B84A)',
            boxShadow: '0 8px 32px rgba(197, 139, 7, 0.3)',
          }}
        >
          <span className="text-2xl font-black" style={{ color: '#02022d' }}>N</span>
        </motion.div>

        {/* Title */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-sm font-medium tracking-[0.3em] uppercase mb-4"
          style={{ color: '#92783A' }}
        >
          Welcome to
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="font-serif text-6xl md:text-7xl font-bold italic tracking-wide mb-6"
          style={{ color: '#F5EFE0' }}
        >
          <span className="shimmer">NEXX</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="text-base md:text-lg leading-relaxed mb-10"
          style={{ color: '#B8A88A' }}
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
                background: '#02022d',
                color: '#F5EFE0',
                border: '1px solid rgba(197, 139, 7, 0.2)',
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
        style={{ color: '#775E22' }}
      >
        Your Corner. Your Calm. Your Case.
      </motion.p>
    </div>
  );
}

