import { test, expect } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createHash } from "node:crypto";
import { registerSyntheticRun, cleanupSyntheticRun } from "../support/convex";
test("release: real upload, original preview, reviewed exact final PDF and registered cleanup", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_EXHIBIT_RELEASE !== "true",
    "Explicit release lane only.",
  );
  test.setTimeout(300000);
  await clerkSetup();
  const email = process.env.E2E_OWNER_EMAIL;
  if (
    !email ||
    !/^upload-robot-owner\+(preview|production)@nexproof\.io$/.test(email)
  )
    throw new Error("Approved exhibit release robot required.");
  if (
    email.includes("+production@") &&
    process.env.E2E_ALLOW_PRODUCTION !== "true"
  )
    throw new Error("Production release lane must be explicitly enabled.");
  const runId = `e2e-release-exhibit-${Date.now()}`;
  let registered = false;
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  try {
    await registerSyntheticRun(page, {
      runId,
      lane: "release",
      environment: email.includes("+production@") ? "production" : "preview",
    });
    registered = true;
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf
      .addPage([612, 792])
      .drawText("SYNTHETIC EXHIBIT RELEASE CHECK - NOT REAL CASE EVIDENCE", {
        font,
        size: 12,
        x: 40,
        y: 650,
      });
    await page.goto("/docuvault/exhibits");
    await page
      .getByLabel("Collection title", { exact: true })
      .fill(`${runId} packet`);
    await page
      .getByLabel("Upload original evidence", { exact: true })
      .setInputFiles({
        name: `nexx-e2e-${runId}--original.pdf`,
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
    await expect(
      page.getByRole("img", {
        name: "Generated packet preview, page 1 of 4",
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    const preview = await page.request.get(
      (await page
        .getByRole("link", { name: "Open PDF", exact: true })
        .getAttribute("href"))!,
    );
    expect(preview.status()).toBe(200);
    const reviewed = await preview.body();
    await page
      .getByLabel(
        "I reviewed this exact PDF, including its source pages, index, numbering, and warnings.",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", { name: "Finalize reviewed version", exact: true })
      .click();
    const link = page.getByRole("link", {
      name: "Download version",
      exact: true,
    });
    await expect(link).toBeVisible();
    const downloaded = await page.request.get(
      (await link.getAttribute("href"))!,
    );
    expect(downloaded.status()).toBe(200);
    expect(
      createHash("sha256")
        .update(await downloaded.body())
        .digest("hex"),
    ).toBe(createHash("sha256").update(reviewed).digest("hex"));
  } finally {
    await page.goto("/");
    if (registered) await cleanupSyntheticRun(page, runId);
  }
});
