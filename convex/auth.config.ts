const clerkDomain = process.env.CLERK_ISSUER_DOMAIN;
if (!clerkDomain) {
    throw new Error(
        'Missing CLERK_ISSUER_DOMAIN environment variable. ' +
        'Set it in your Convex dashboard under Settings → Environment Variables.'
    );
}

const authConfig = {
    providers: [
        {
            domain: clerkDomain,
            applicationID: "convex",
        },
    ],
};

export default authConfig;
