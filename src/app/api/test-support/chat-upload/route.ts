import { auth, currentUser } from "@clerk/nextjs/server";
import { api } from "@convex/_generated/api";
import { getAuthenticatedConvexClient } from "@/lib/convexServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  operation?: "register" | "inspect" | "cleanup" | "status";
  runId?: string;
  lane?: "pr" | "release" | "daily" | "weekly" | "resilience";
  environment?: "local" | "preview" | "staging" | "production";
  deploymentId?: string;
};

const SYNTHETIC_UPLOAD_EMAIL =
  /^upload-robot-(owner|outsider)\+(preview|production)@nexproof\.io$/i;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return Response.json({ error: "Authentication required" }, { status: 401 });

  const user = await currentUser();
  const emails = user?.emailAddresses.map((entry) => entry.emailAddress) ?? [];
  if (!emails.some((email) => SYNTHETIC_UPLOAD_EMAIL.test(email.trim()))) {
    return Response.json(
      { error: "Synthetic test identity required" },
      { status: 404 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.operation || !body.runId) {
    return Response.json(
      { error: "Operation and run id are required" },
      { status: 400 },
    );
  }

  try {
    const convex = await getAuthenticatedConvexClient();
    switch (body.operation) {
      case "register": {
        if (!body.lane || !body.environment) {
          return Response.json(
            { error: "Lane and environment are required" },
            { status: 400 },
          );
        }
        const id = await convex.mutation(api.chatUploadE2E.registerRun, {
          runId: body.runId,
          lane: body.lane,
          environment: body.environment,
          deploymentId: body.deploymentId,
        });
        return Response.json(
          { id },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      case "inspect":
        return Response.json(
          await convex.query(api.chatUploadE2E.inspectRunUpload, {
            runId: body.runId,
          }),
          {
            headers: { "Cache-Control": "no-store" },
          },
        );
      case "cleanup":
        return Response.json(
          await convex.action(api.chatUploadE2E.requestCleanup, {
            runId: body.runId,
          }),
          {
            headers: { "Cache-Control": "no-store" },
          },
        );
      case "status":
        return Response.json(
          await convex.query(api.chatUploadE2E.getRunStatus, {
            runId: body.runId,
          }),
          {
            headers: { "Cache-Control": "no-store" },
          },
        );
      default:
        return Response.json(
          { error: "Unsupported operation" },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[UploadE2E] Synthetic test-support request failed", {
      operation: body.operation,
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return Response.json(
      { error: "Synthetic test operation failed" },
      { status: 500 },
    );
  }
}
