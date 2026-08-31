const DEFAULT_ORIGINS = new Set([
  'https://nexproof.io',
  'https://www.nexproof.io',
  'https://nexx-app.vercel.app',
]);

const NEXX_VERCEL_PREVIEW = /^https:\/\/nexx-[a-z0-9-]+-monicafernii97-cmds-projects\.vercel\.app$/;

export function isAllowedNexxBrowserOrigin(args: {
  origin: string | null;
  configuredOrigins?: string;
  nodeEnv?: string;
}) {
  if (!args.origin) return true;
  const configured = (args.configuredOrigins ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.includes(args.origin) || DEFAULT_ORIGINS.has(args.origin)) return true;
  if (NEXX_VERCEL_PREVIEW.test(args.origin)) return true;
  return args.nodeEnv !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(args.origin);
}
