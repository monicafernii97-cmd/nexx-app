import { test, expect } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { spawnSync } from "node:child_process";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { registerSyntheticRun, cleanupSyntheticRun } from "../support/convex";

test.beforeAll(async () => {
  await clerkSetup();
});
test("direct evidence upload reaches a downloadable packet through the real intake service", async ({
  page,
}) => {
  test.setTimeout(300000);
  const runId = `exhibit-qa-upload-${Date.now()}`,
    uploadRunId = `e2e-pr-${runId}`;
  let subject = "";
  let registered = false;
  await page.goto("/");
  await clerk.signIn({
    page,
    emailAddress: "upload-robot-owner+preview@nexproof.io",
  });
  subject = await page.evaluate(
    () =>
      (window as unknown as { Clerk: { user: { id: string } } }).Clerk.user.id,
  );
  try {
    await registerSyntheticRun(page, {
      runId: uploadRunId,
      lane: "pr",
      environment: "preview",
    });
    registered = true;
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf
      .addPage()
      .drawText(
        "Synthetic appointment confirmation. March 12, 2026 at 10 AM.",
        { x: 40, y: 600, size: 12, font },
      );
    await page.goto("/docuvault/exhibits");
    await page
      .getByLabel("Collection title", { exact: true })
      .fill(`${runId} uploaded packet`);
    await page
      .getByLabel("Upload original evidence", { exact: true })
      .setInputFiles({
        name: `nexx-e2e-${uploadRunId}--original.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.from(await pdf.save()),
      });
    await expect(
      page.getByRole("heading", { name: "Exhibits (1)", exact: true }),
    ).toBeVisible({ timeout: 150000 });
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved/ }),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review PDF", exact: true }),
    ).toBeVisible({ timeout: 90000 });
    await page.getByRole("button", { name: "Review PDF", exact: true }).click();
    const response = await page.request.get(
      (await page
        .getByRole("link", { name: "Open PDF", exact: true })
        .getAttribute("href"))!,
    );
    expect(response.status()).toBe(200);
    expect((await PDFDocument.load(await response.body())).getPageCount()).toBe(
      4,
    );
  } finally {
    const cleanup = spawnSync(
      process.execPath,
      [
        "node_modules/convex/bin/main.js",
        "run",
        "exhibitStudioQA:cleanupBrowserRun",
        JSON.stringify({ runId, subject }),
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    if (registered) await cleanupSyntheticRun(page, uploadRunId);
    if (cleanup.status !== 0) throw new Error(cleanup.stderr);
  }
});
test("signed-in Studio: timeline selection, saved draft, generated preview and immutable final version", async ({
  page,
}) => {
  if (process.env.NEXT_PUBLIC_CONVEX_URL?.includes("blessed-rabbit-457"))
    throw new Error("This fixture is development-only.");
  const runId = `exhibit-qa-browser-${Date.now()}`;
  let subject = "";
  await page.goto("/");
  await clerk.signIn({
    page,
    emailAddress: "upload-robot-owner+preview@nexproof.io",
  });
  await page.goto("/docuvault/exhibits");
  await expect(
    page.getByRole("heading", { name: "Exhibit Studio", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const session = await page.evaluate(async () => {
    const clerk = (
      window as unknown as {
        Clerk: {
          user: { id: string };
          session: { getToken: (a: { template: string }) => Promise<string> };
        };
      }
    ).Clerk;
    return {
      subject: clerk.user.id,
      token: await clerk.session.getToken({ template: "convex" }),
    };
  });
  subject = session.subject;
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  client.setAuth(session.token);
  try {
    const cases = await client.query(api.cases.list, {});
    const active = cases.find((c) => c.status === "active") ?? cases[0];
    expect(active).toBeTruthy();
    const timelineId = await client.mutation(api.timelineCandidates.create, {
      caseId: active._id,
      title: runId,
      description:
        "Synthetic timeline entry: appointment confirmed in writing at 10:00 AM.",
      eventDate: "2026-03-12",
      requestId: runId,
    });
    await page
      .getByLabel("Collection title", { exact: true })
      .fill(`${runId} master`);
    await expect(
      page.getByRole("status").filter({ hasText: "Saved" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByText("Recorded timeline", { exact: true }).click();
    await page.getByLabel(`2026-03-12 · ${runId}`, { exact: true }).check();
    await page
      .getByRole("button", { name: "Snapshot selected timeline", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Exhibits (1)", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Bates on evidence pages", { exact: true }).check();
    await expect
      .poll(async () => {
        const overview = await client.query(api.exhibitStudio.overview, {
          caseId: active._id,
        });
        const row = overview.collections.find(
          (c) => c.title === `${runId} master`,
        );
        return row ? JSON.parse(row.itemsJson).length : 0;
      })
      .toBe(1);
    await page
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review PDF", exact: true }),
    ).toBeVisible({ timeout: 90000 });
    await page.getByRole("button", { name: "Review PDF", exact: true }).click();
    await expect(
      page.getByRole("region", {
        name: "Generated packet preview",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Generated packet preview, page 1 of 4" }),
    ).toBeVisible({ timeout: 60000 });
    const previewUrl = await page
      .getByRole("link", { name: "Open PDF", exact: true })
      .getAttribute("href");
    const previewResponse = await page.request.get(previewUrl!);
    expect(previewResponse.status()).toBe(200);
    expect(previewResponse.headers()["content-type"]).toContain(
      "application/pdf",
    );
    const reviewedBytes = await previewResponse.body();
    await page
      .getByLabel(
        "I reviewed this exact PDF, including its source pages, index, numbering, and warnings.",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", { name: "Finalize reviewed version", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Download version", exact: true }),
    ).toBeVisible();
    const download = await page.request.get(
      (await page
        .getByRole("link", { name: "Download version", exact: true })
        .getAttribute("href"))!,
    );
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect(await download.body()).toEqual(reviewedBytes);
    await client.mutation(api.timelineCandidates.confirm, {
      candidateId: timelineId,
    });
    const unchanged = await page.request.get(previewUrl!);
    expect(await unchanged.body()).toEqual(reviewedBytes);
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await page
      .getByRole("button", { name: "Add to collection (1)", exact: true })
      .click();
    await page
      .getByLabel("New collection name", { exact: true })
      .fill(`${runId} subset`);
    await page
      .getByRole("button", { name: "Add selected exhibits", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.reload();
    await page
      .getByLabel("Saved collection", { exact: true })
      .selectOption({ label: `${runId} master` });
    await expect(
      page.getByRole("heading", { name: "Exhibits (1)", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download version", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "output/exhibit-browser/studio-verified.png",
      fullPage: true,
    });
    await page.goto("/chat/timeline");
    await page
      .getByLabel("Search timeline events", { exact: true })
      .fill(runId);
    await page
      .getByRole("button", { name: "Build timeline PDF", exact: true })
      .click();
    await page
      .getByLabel("Timeline PDF title", { exact: true })
      .fill(`${runId} standalone chronology`);
    await page
      .getByLabel("Chronology format", { exact: true })
      .selectOption("table");
    await page
      .getByRole("button", {
        name: "Generate selected chronology",
        exact: true,
      })
      .click();
    const chronology = page.getByRole("link", {
      name: "Download timeline PDF",
      exact: true,
    });
    await expect(chronology).toBeVisible({ timeout: 90000 });
    const chronologyResponse = await page.request.get(
      (await chronology.getAttribute("href"))!,
    );
    expect(chronologyResponse.status()).toBe(200);
    expect(
      (await PDFDocument.load(await chronologyResponse.body())).getPageCount(),
    ).toBe(1);
  } finally {
    if (subject) {
      const cleanup = spawnSync(
        process.execPath,
        [
          "node_modules/convex/bin/main.js",
          "run",
          "exhibitStudioQA:cleanupBrowserRun",
          JSON.stringify({ runId, subject }),
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      if (cleanup.status !== 0)
        throw new Error("Synthetic browser cleanup failed: " + cleanup.stderr);
    }
  }
});

test("source region studio: authenticated rendered page and reviewed redaction", async ({
  page,
}) => {
  const runId = `exhibit-qa-region-${Date.now()}`;
  let subject = "";
  await page.goto("/");
  await clerk.signIn({
    page,
    emailAddress: "upload-robot-owner+preview@nexproof.io",
  });
  subject = await page.evaluate(
    () =>
      (window as unknown as { Clerk: { user: { id: string } } }).Clerk.user.id,
  );
  try {
    const fixture = spawnSync(
      process.execPath,
      [
        "node_modules/convex/bin/main.js",
        "run",
        "exhibitStudioQAFixture:createBrowserFile",
        JSON.stringify({ runId, subject }),
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    if (fixture.status !== 0) throw new Error(fixture.stderr);
    await page.goto("/docuvault/exhibits");
    await page
      .getByLabel("Collection title", { exact: true })
      .fill(`${runId} packet`);
    await page.getByLabel(`${runId}.pdf`, { exact: true }).check();
    await page
      .getByRole("button", { name: "Import selected files", exact: true })
      .click();
    const renderedResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/exhibits/source/") && r.url().includes("page=1"),
    );
    await page
      .locator("article")
      .getByRole("button")
      .filter({ hasText: `${runId}.pdf` })
      .click();
    const rendered = await renderedResponse;
    await page.getByText("Select extracted text", { exact: true }).click();
    const transcription = page.getByLabel("Extracted source text", {
      exact: true,
    });
    await expect(transcription).toBeVisible({ timeout: 60000 });
    await transcription.focus();
    await transcription.press("ControlOrMeta+A");
    await page
      .getByRole("button", { name: /^Pin selected text \([1-9]/ })
      .click();
    await expect(
      page.getByText(/Later OCR updates do not change this excerpt/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove text excerpt", exact: true })
      .click();
    expect(
      rendered.status(),
      rendered.status() === 200
        ? "Rendered source ready"
        : await rendered.text(),
    ).toBe(200);
    await page
      .getByText("Crop or redact a source region", { exact: true })
      .click();
    const original = page.getByRole("img", {
      name: "Unrotated original source page 1; region controls follow",
    });
    await expect
      .poll(
        () =>
          original.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        { timeout: 60000 },
      )
      .toBe(true);
    await page.getByLabel("height (%)", { exact: true }).fill("50");
    await page
      .getByRole("button", { name: "Add redaction", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Clear redactions (1)", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved/ }),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review PDF", exact: true }),
    ).toBeVisible({ timeout: 90000 });
    await page.getByRole("button", { name: "Review PDF", exact: true }).click();
    await page
      .getByLabel(
        "I reviewed this exact PDF, including its source pages, index, numbering, and warnings.",
        { exact: true },
      )
      .check();
    await page
      .getByLabel(
        "I compared the redacted pages with the originals and reviewed covers, summaries, and other pages for information that must also be removed.",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", { name: "Finalize reviewed version", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Download version", exact: true }),
    ).toBeVisible();
    const index = await page.request.get(
      (await page
        .getByRole("link", { name: "Download index", exact: true })
        .getAttribute("href"))!,
    );
    expect(index.status()).toBe(200);
    expect(index.headers()["content-type"]).toContain("application/pdf");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "output/exhibit-browser/mobile-region.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
    ).toBe(true);
  } finally {
    const cleanup = spawnSync(
      process.execPath,
      [
        "node_modules/convex/bin/main.js",
        "run",
        "exhibitStudioQA:cleanupBrowserRun",
        JSON.stringify({ runId, subject }),
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    if (cleanup.status !== 0) throw new Error(cleanup.stderr);
  }
});
