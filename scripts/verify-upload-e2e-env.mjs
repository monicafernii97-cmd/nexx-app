const required = [
  "E2E_BASE_URL",
  "E2E_OWNER_EMAIL",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
];

for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required.`);
}

const baseUrl = new URL(process.env.E2E_BASE_URL);
// Actions environment deployments point at job pages, not the application.
// Reject those before starting a browser or sending authentication traffic.
if (
  baseUrl.hostname === "github.com" ||
  baseUrl.hostname.endsWith(".github.com")
) {
  throw new Error("E2E_BASE_URL must point to the application, not GitHub.");
}
if (
  process.env.E2E_REQUIRE_VERCEL_PREVIEW === "true" &&
  (baseUrl.protocol !== "https:" ||
    !baseUrl.hostname.endsWith(".vercel.app") ||
    baseUrl.username || baseUrl.password || baseUrl.port ||
    baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash)
) {
  throw new Error("Preview assurance requires a Vercel HTTPS application origin.");
}
const production = ["nexproof.io", "www.nexproof.io"].includes(
  baseUrl.hostname,
);
const lane = process.env.E2E_LANE ?? "pr";
if (
  baseUrl.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(baseUrl.hostname)
) {
  throw new Error("Deployed E2E tests require HTTPS.");
}
if (production && process.env.E2E_ALLOW_PRODUCTION !== "true") {
  throw new Error("Production testing was not explicitly enabled.");
}
if (production && lane === "resilience") {
  throw new Error("Network fault injection is forbidden on production.");
}
const robotEmail =
  /^upload-robot-(owner|outsider)\+(preview|production)@nexproof\.io$/i;
if (!robotEmail.test(process.env.E2E_OWNER_EMAIL.trim())) {
  throw new Error("The owner identity is not an approved upload robot.");
}
if (lane === "weekly" && !process.env.E2E_OUTSIDER_EMAIL?.trim()) {
  throw new Error("Weekly security coverage requires E2E_OUTSIDER_EMAIL.");
}
if (
  process.env.E2E_OUTSIDER_EMAIL?.trim() &&
  !robotEmail.test(process.env.E2E_OUTSIDER_EMAIL.trim())
) {
  throw new Error("The outsider identity is not an approved upload robot.");
}

console.log(
  JSON.stringify({
    event: "upload_e2e_environment_verified",
    lane,
    host: baseUrl.hostname,
    production,
  }),
);
