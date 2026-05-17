# Vercel Firewall Rule: deny-common-exploit-probes

Create a Vercel Firewall custom rule named `deny-common-exploit-probes`.

Prefer **Request Path** matching for ordinary scanner probes. Request Path is
the normalized, decoded URL path Vercel uses for routing. Use **Raw Path** only
when you need byte-for-byte matching against unusual percent-encoding, encoded
slashes, or other edge-path distinctions. Do not use framework route matching
for this rule, because framework route matching runs after the app
proxy/middleware layer.

## Rollout

1. Create the rule in **Log** mode for a short verification window.
2. Confirm it only matches obvious scanner/probe paths.
3. Switch the action to **Deny**.
4. If available, enable persistent deny/challenge for repeat offenders.

## Match Conditions

Deny requests whose request path matches any of these operator-form
conditions. These values are intended for Vercel Firewall's condition builder;
they are not filesystem globs.

- `eq:/.env`
- `pre:/.env.`
- `eq:/api/.env`
- `eq:/backend/.env`
- `eq:/app/.env`
- `eq:/.aws/credentials`
- `pre:/.aws/`
- `sub:credentials.json`
- `sub:service-account.json`
- `sub:firebase-service-account.json`
- `eq:/composer.json`
- `eq:/composer.lock`
- `sub:database.sql`
- `pre:/.git`
- `pre:/.svn`
- `pre:/.hg`
- `pre:/wp-admin`
- `eq:/wp-login.php`
- `eq:/xmlrpc.php`
- `pre:/wp-content`
- `pre:/wp-includes`
- `pre:/phpmyadmin`
- `pre:/pma`
- `pre:/adminer`
- `pre:/vendor`
- `pre:/backup`
- `pre:/backups`
- `eq:/phpinfo.php`
- `eq:/server-status`
- `re:\.(php\d?|phtml)(?:/|$)`
- `re:\.bak(?:/|$)`
- `re:\.backup(?:/|$)`
- `re:\.old(?:/|$)`
- `re:\.orig(?:/|$)`
- `re:\.save(?:/|$)`
- `re:\.sql(?:/|$)`
- `re:\.sqlite(?:/|$)`
- `re:\.sqlite3(?:/|$)`
- `re:\.db(?:/|$)`
- `re:\.log(?:/|$)`
- `re:\.ini(?:/|$)`
- `re:\.pem(?:/|$)`
- `re:\.key(?:/|$)`
- `re:\.crt(?:/|$)`
- `re:\.cer(?:/|$)`
- `re:\.p12(?:/|$)`
- `re:\.pfx(?:/|$)`
- `re:\.zip(?:/|$)`

Use regex conditions for extension-style probes instead of suffix-only
conditions. Suffix operators can miss scanner variants with a trailing slash,
such as `/file.php/`; regexes like `re:\.php(?:/|$)` and
`re:\.(php\d?|phtml)(?:/|$)` cover both ordinary filenames and slash-terminated
probe paths.

## Production Verification

After the rule is active, verify in Vercel Runtime Logs that:

- Probe paths show as firewall-denied traffic or app fallback `404`.
- Probe paths do not redirect to `/sign-in`.
- `/sign-in` is no longer a top path caused by scanner redirects.
- Routing middleware/proxy invocations decrease materially.
- Serverless invocations for `/sign-in` decrease materially.
- Protected app pages still require auth.
- Protected APIs still require auth.
- `/robots.txt` and `/sitemap.xml` return `200`.
