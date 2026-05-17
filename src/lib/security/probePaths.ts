const BLOCKED_EXACT_PATHS = new Set([
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.env.development',
  '/.aws/credentials',
  '/credentials.json',
  '/service-account.json',
  '/firebase-service-account.json',
  '/wp-login.php',
  '/xmlrpc.php',
  '/phpinfo.php',
  '/server-status',
]);

const BLOCKED_PREFIXES = [
  '/.git',
  '/.svn',
  '/.hg',
  '/.aws',
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/phpmyadmin',
  '/pma',
  '/adminer',
  '/vendor',
  '/backup',
  '/backups',
];

const SENSITIVE_FILE_RE =
  /(?:^|\/)(?:\.env(?:\..*)?|credentials\.json|service-account\.json|firebase-service-account\.json|composer\.(?:json|lock)|database\.sql)(?:$|[/?#])/i;

const SENSITIVE_EXTENSION_RE =
  /\.(?:php|env|bak|backup|old|orig|save|sql|sqlite|sqlite3|db|log|ini|pem|key|crt|cer|p12|pfx)(?=$|[/?#])/i;

/** Decode and lowercase request paths so encoded scanner probes are classified consistently. */
export function normalizeProbePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}

/** Return true for allowed standards paths that intentionally begin with `.well-known`. */
export function isAllowedWellKnownPath(pathname: string): boolean {
  return (
    pathname.startsWith('/.well-known/acme-challenge/') ||
    pathname === '/.well-known/security.txt'
  );
}

/** Classify obvious exploit-scanner request paths that should not reach Clerk auth. */
export function isProbePathname(pathname: string): boolean {
  const normalizedPathname = normalizeProbePath(pathname);

  if (isAllowedWellKnownPath(normalizedPathname)) return false;

  if (BLOCKED_EXACT_PATHS.has(normalizedPathname)) return true;

  if (
    BLOCKED_PREFIXES.some(
      (prefix) =>
        normalizedPathname === prefix ||
        normalizedPathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  if (SENSITIVE_FILE_RE.test(normalizedPathname)) return true;
  if (SENSITIVE_EXTENSION_RE.test(normalizedPathname)) return true;

  return false;
}
