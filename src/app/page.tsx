'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { CaretDown } from '@phosphor-icons/react';
import { PLANS } from '@/lib/plans';

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
      // Signed in but no Convex record yet — new user
      const selectedPlan = typeof window !== 'undefined' ? localStorage.getItem('selectedPlan') : null;
      const validPlans = new Set(['free', 'pro', 'premium', 'executive']);
      if (!selectedPlan || !validPlans.has(selectedPlan)) {
        localStorage.removeItem('selectedPlan');
        // No valid plan selected — scroll to pricing so they pick a plan first
        requestAnimationFrame(() => {
          document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
        });
        return; // Stay on welcome page — don't redirect
      } else {
        // Plan selected — proceed to onboarding
        router.replace('/onboarding');
      }
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
          <div className="w-24 h-24 rounded-3xl mx-auto mb-8 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#0A1128)] shadow-[0_12px_40px_rgba(10,17,40,0.6)] border border-[rgba(255,255,255,0.15)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
            <span className="text-[#F7F2EB] font-serif font-bold text-5xl drop-shadow-md relative z-10 mt-1 tracking-wider">
              <i>N</i>
            </span>
          </div>
          <p className="text-sm font-bold text-[#F7F2EB] tracking-[0.2em] uppercase drop-shadow-md">Loading...</p>
        </motion.div>
      </div>
    );
  }


  // Only render welcome page for unauthenticated users
  return (
    <div className="bg-[#0A1128] min-h-screen flex flex-col relative overflow-x-hidden font-sans">
      {/* Jumbo Background NEXX Shimmer */}
      <div className="absolute top-0 w-full h-screen flex items-center pointer-events-none z-0 overflow-hidden opacity-[0.03]">
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

      {/* ═══ Hero Section ═══ */}
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 xl:px-24 z-10 relative flex flex-col justify-center min-h-screen">
        
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
          Take command of your narrative. Transform high-conflict turmoil into a bulletproof, court-ready strategy.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="flex flex-col sm:flex-row items-start gap-4"
        >
          <Link
            href="/sign-in"
            className="btn-primary w-full sm:w-auto px-8 py-3.5 text-[13px] shadow-[0_4px_20px_rgba(26,75,155,0.4)] inline-flex items-center justify-center"
          >
            Sign In
          </Link>
          <button 
            onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
            className="btn-outline w-full sm:w-auto px-8 py-3.5 text-[13px] hover:bg-[rgba(255,255,255,0.1)] border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.9)] hover:border-[rgba(255,255,255,0.3)]"
          >
            Sign Up
          </button>
        </motion.div>

        {/* Bouncing Arrow Scroll hint */}
          <motion.button
            type="button"
            aria-label="Scroll to pricing"
            onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 cursor-pointer group bg-transparent border-none p-0"
          >
            <p className="text-[11px] uppercase tracking-widest font-bold text-[rgba(255,255,255,0.25)] group-hover:text-[var(--champagne)] transition-colors">
              Prepare. Preempt. Prevail.
            </p>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <CaretDown size={20} className="text-[rgba(255,255,255,0.3)] group-hover:text-[var(--champagne)] transition-colors" />
            </motion.div>
          </motion.button>

      </div>

      {/* ═══ Pricing Section ═══ */}
      <div id="pricing" className="w-full z-10 relative py-24 md:py-32">
        {/* Section ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[40%] bg-[#1A4B9B]/10 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl mx-auto px-6 md:px-12 xl:px-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <p className="text-[11px] md:text-xs font-bold tracking-[0.25em] uppercase text-[var(--champagne)] mb-4">
              Choose Your Arsenal
            </p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold italic text-white tracking-tight mb-4">
              Plans Built for Battle
            </h2>
            <p className="text-base text-[rgba(255,255,255,0.5)] max-w-lg mx-auto leading-relaxed">
              Every tier is designed to arm you with the tools you need. Start free, upgrade when you&apos;re ready to dominate.
            </p>
          </motion.div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: i * 0.1, duration: 0.6 }}
                className={`relative rounded-[2rem] p-6 flex flex-col border transition-all hover:scale-[1.02] hover:shadow-[0_8px_40px_rgba(26,75,155,0.2)] ${
                  plan.popular
                    ? 'bg-gradient-to-b from-[#0F1D3D] to-[#0A1128] border-[rgba(229,168,74,0.35)] shadow-[0_4px_30px_rgba(229,168,74,0.1)]'
                    : 'bg-[#0A1128] border-[rgba(255,255,255,0.08)]'
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-[#E5A84A] to-[#C88B2E] text-[#0A1128] shadow-[0_2px_12px_rgba(229,168,74,0.3)]">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan Name */}
                <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--champagne)] mb-3 mt-1">
                  {plan.name}
                </h3>

                {/* Price */}
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-serif font-bold text-white tracking-tight">{plan.price}</span>
                  <span className="text-sm text-[rgba(255,255,255,0.4)]">{plan.period}</span>
                </div>

                {/* Description */}
                <p className="text-[13px] text-[rgba(255,255,255,0.5)] leading-relaxed mb-6">
                  {plan.description}
                </p>

                {/* Features */}
                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span className="mt-0.5 w-4 h-4 rounded-full bg-[rgba(229,168,74,0.15)] flex items-center justify-center shrink-0">
                        <span className="text-[10px] text-[var(--champagne)]">✓</span>
                      </span>
                      <span className="text-[13px] text-[rgba(255,255,255,0.7)] leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => {
                    localStorage.setItem('selectedPlan', plan.tier);
                    router.push(isSignedIn ? '/onboarding' : '/sign-up');
                  }}
                  className={`w-full py-3 rounded-xl text-[13px] font-bold tracking-wide uppercase transition-all ${
                    plan.popular
                      ? 'bg-gradient-to-r from-[#E5A84A] to-[#C88B2E] text-[#0A1128] hover:shadow-[0_4px_20px_rgba(229,168,74,0.4)]'
                      : 'bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.8)] border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]'
                  }`}
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Footer Text */}
      <div className="w-full py-8 z-10 relative">
        <p className="text-center text-[10px] md:text-xs tracking-[0.25em] font-semibold text-[rgba(255,255,255,0.3)] uppercase">
          Prepare. Preempt. Prevail.
        </p>
      </div>
    </div>
  );
}

