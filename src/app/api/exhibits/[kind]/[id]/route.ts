import { auth } from "@clerk/nextjs/server";
import { getAuthenticatedConvexClient } from "@/lib/convexServer";
import { api } from "@convex/_generated/api";
import { NextRequest, NextResponse } from "next/server";
import { rasterizeSource } from "@/lib/exhibit-packets/raster";
import { EXHIBIT_LIMITS } from "../../../../../../shared/exhibits";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  if (!(await auth()).userId)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { kind, id } = await params;
  if (!["source", "packet", "index"].includes(kind))
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const client = await getAuthenticatedConvexClient();
    const record = await client.query(api.exhibitStudio.downloadAccess, {
      id,
      kind: kind as "source" | "packet" | "index",
    });
    if (!record.url)
      return NextResponse.json({ error: "File unavailable." }, { status: 404 });
    const response = await fetch(record.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok || !response.body)
      return NextResponse.json(
        { error: "Storage temporarily unavailable." },
        { status: 502 },
      );
    if (request.nextUrl.searchParams.has("page")) {
      const page = Number(request.nextUrl.searchParams.get("page"));
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
        return NextResponse.json({ error: "Invalid page." }, { status: 400 });
      if (
        Number(response.headers.get("content-length")) >
        EXHIBIT_LIMITS.sourceBytes
      )
        return NextResponse.json(
          { error: "Source exceeds preview limit." },
          { status: 413 },
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > EXHIBIT_LIMITS.sourceBytes)
        return NextResponse.json(
          { error: "Source exceeds preview limit." },
          { status: 413 },
        );
      const raster = await rasterizeSource({
        bytes,
        mimeType: record.mimeType,
        page,
      });
      return new NextResponse(raster.bytes as Uint8Array<ArrayBuffer>, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "X-PDF-Page-Count": String(raster.pageCount),
        },
      });
    }
    const safeTitle = record.title.replace(/[^a-zA-Z0-9._ -]/g, "_");
    const filename =
      record.mimeType === "application/pdf"
        ? `${safeTitle.replace(/\.pdf$/i, "").slice(0, 170) || "exhibit"}.pdf`
        : safeTitle.slice(0, 180) || "exhibit";
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": record.mimeType,
        "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(record.sha256 ? { ETag: `"${record.sha256}"` } : {}),
      },
    });
  } catch (error) {
    if ((process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === 'preview') && error instanceof Error)
      console.error(
        "[exhibit preview]",
        error.message.replace(/https?:\/\/\S+/g, "[URL]"),
      );
    return NextResponse.json(
      { error: "This file is unavailable or you no longer have access." },
      { status: 404 },
    );
  }
}
