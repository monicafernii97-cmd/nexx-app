import { test, expect } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createHash } from "node:crypto";
import JSZip from "jszip";
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
    if (process.env.E2E_EXHIBIT_EXTENSIONS === "true") {
      await page.getByLabel("Bates on evidence pages", { exact: true }).check();
      await page
        .getByText("Create a shared Bates series", { exact: true })
        .click();
      await page
        .getByLabel("Series name", { exact: true })
        .fill(`${runId} series`);
      await page
        .getByLabel("Series prefix", { exact: true })
        .fill(`QA-${Date.now()}-`);
      await page
        .getByRole("button", { name: "Create Bates series", exact: true })
        .click();
      await expect(
        page.getByLabel("Bates numbering scope", { exact: true }),
      ).not.toHaveValue("");
    }
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
    if (process.env.E2E_EXHIBIT_EXTENSIONS === "true") {
      await page
        .getByText("Delivery formats for this finalized version", {
          exact: true,
        })
        .click();
      await page.getByLabel("Split into volumes", { exact: true }).check();
      await page
        .getByRole("button", { name: "Prepare delivery", exact: true })
        .click();
      const zipLink = page.getByRole("link", {
        name: "Download packet-delivery.zip",
        exact: true,
      });
      await expect(zipLink).toBeVisible({ timeout: 120000 });
      const zipped = await page.request.get(
        (await zipLink.getAttribute("href"))!,
      );
      expect(zipped.status()).toBe(200);
      const zip = await JSZip.loadAsync(await zipped.body());
      expect(
        Buffer.from(await zip.file("master.pdf")!.async("uint8array")),
      ).toEqual(reviewed);
      expect(
        Object.keys(zip.files).filter(
          (n) => n.startsWith("exhibits/") && n.endsWith(".pdf"),
        ),
      ).toHaveLength(1);
      expect(
        Object.keys(zip.files).filter(
          (n) => n.startsWith("volumes/") && n.endsWith(".pdf"),
        ),
      ).toHaveLength(1);
      const individual = page.getByRole("link", {
        name: /Download exhibits\/001-/,
      });
      const single = await page.request.get(
        (await individual.getAttribute("href"))!,
      );
      expect(single.status()).toBe(200);
      expect((await PDFDocument.load(await single.body())).getPageCount()).toBe(
        3,
      );
      if (process.env.E2E_EXHIBIT_VOICE_PROVIDER === "true") {
        const speech = await page.request.post("/api/tts", {
          data: {
            text: "This is a synthetic exhibit dictation test. Review the appointment message.",
            format: "mp3",
          },
        });
        expect(speech.status()).toBe(200);
        const recognized = await page.request.post("/api/audio/transcribe", {
          multipart: {
            file: {
              name: "synthetic-exhibit-dictation.mp3",
              mimeType: "audio/mpeg",
              buffer: await speech.body(),
            },
          },
        });
        expect(recognized.status()).toBe(200);
        expect((await recognized.json()).text.toLowerCase()).toContain(
          "appointment",
        );
      }
      await page.route("**/api/audio/transcribe", (route) =>
        route.fulfill({ json: { text: "Drafted voice instruction" } }),
      );
      await page.evaluate(() => {
        class FakeRecorder {
          static isTypeSupported() {
            return true;
          }
          state = "inactive";
          mimeType = "audio/webm";
          ondataavailable: ((e: { data: Blob }) => void) | null = null;
          onstop: (() => void) | null = null;
          start() {
            this.state = "recording";
          }
          stop() {
            this.state = "inactive";
            this.ondataavailable?.({
              data: new Blob(["synthetic audio"], { type: "audio/webm" }),
            });
            queueMicrotask(() => this.onstop?.());
          }
        }
        Object.defineProperty(window, "MediaRecorder", {
          value: FakeRecorder,
          configurable: true,
        });
        Object.defineProperty(navigator, "mediaDevices", {
          value: {
            getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
          },
          configurable: true,
        });
      });
      const input = page.getByLabel("Message the exhibit assistant", {
        exact: true,
      });
      await input.fill("Keep typed text.");
      await page
        .getByRole("button", { name: "Record exhibit message", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Stop recording", exact: true })
        .click();
      const transcript = page.getByLabel("Review dictated text", {
        exact: true,
      });
      await expect(transcript).toHaveValue("Drafted voice instruction");
      await expect(input).toHaveValue("Keep typed text.");
      await transcript.fill("Corrected voice instruction");
      await page
        .getByRole("button", { name: "Insert reviewed dictation", exact: true })
        .click();
      await expect(input).toHaveValue(
        "Keep typed text.\nCorrected voice instruction",
      );
      await page.screenshot({
        path: "output/exhibit-extensions/studio-delivery.png",
        fullPage: true,
      });
    }
  } finally {
    await page.goto("/");
    if (registered) await cleanupSyntheticRun(page, runId);
  }
});
