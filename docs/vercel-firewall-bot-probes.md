# Vercel Firewall Rule: deny-common-exploit-probes

Create a Vercel Firewall custom rule named `deny-common-exploit-probes`.

Use **Request Path** or **Raw Path** matching. Do not use framework route
matching for this rule, because framework route matching runs after the app
proxy/middleware layer.

## Rollout

1. Create the rule in **Log** mode for a short verification window.
2. Confirm it only matches obvious scanner/probe paths.
3. Switch the action to **Deny**.
4. If available, enable persistent deny/challenge for repeat offenders.

## Match Categories

Deny requests whose request path matches any of these categories:

- `/.env`
- `/.env.*`
- `/api/.env`
- `/backend/.env`
- `/app/.env`
- `/.aws/credentials`
- `/credentials.json`
- `/service-account.json`
- `/firebase-service-account.json`
- `/.git/*`
- `/.git`
- `/.svn/*`
- `/.hg/*`
- `/wp-admin/*`
- `/wp-login.php`
- `/xmlrpc.php`
- `/wp-content/*`
- `/wp-includes/*`
- `/phpmyadmin/*`
- `/pma/*`
- `/adminer/*`
- `/phpinfo.php`
- `/server-status`
- `/*.php`
- `/*.bak`
- `/*.backup`
- `/*.old`
- `/*.orig`
- `/*.save`
- `/*.sql`
- `/*.sqlite`
- `/*.sqlite3`
- `/*.db`
- `/*.log`
- `/*.ini`
- `/*.pem`
- `/*.key`
- `/*.p12`
- `/*.pfx`

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
