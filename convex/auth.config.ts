const authConfig = {
    providers: [
        {
            domain: process.env.AUTH_CLERK_DOMAIN ?? "https://full-cat-58.clerk.accounts.dev",
            applicationID: "convex",
        },
    ],
};

export default authConfig;
