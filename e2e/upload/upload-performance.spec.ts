import { expect, test } from "@playwright/test";
import { beginSyntheticRun, finishSyntheticRun } from "../support/lifecycle";
import { ensureUploadFixtures } from "../support/files";
import { uploadAndSend } from "../support/upload-journey";

for (const fixtureName of ["medium-10m", "maximum-24m"] as const) {
  test(`${fixtureName} stays within upload UX and transfer budgets`, async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== "chromium",
      "Performance budgets use one stable Chromium baseline.",
    );
    const environment = await beginSyntheticRun(page, testInfo);
    const fixture = ensureUploadFixtures(environment.runId, "weekly").fixtures[
      fixtureName
    ];
    try {
      await page.evaluate(() => {
        const target = window as typeof window & {
          __nexxUploadLongTasks?: number[];
        };
        target.__nexxUploadLongTasks = [];
        if ("PerformanceObserver" in window) {
          const observer = new PerformanceObserver((list) => {
            target.__nexxUploadLongTasks?.push(
              ...list.getEntries().map((entry) => entry.duration),
            );
          });
          try {
            observer.observe({ type: "longtask", buffered: true });
          } catch {
            /* engine support varies */
          }
        }
      });
      const heapBefore = await page.evaluate(() => {
        const memory = performance as Performance & {
          memory?: { usedJSHeapSize: number };
        };
        return memory.memory?.usedJSHeapSize ?? null;
      });
      const metrics = await uploadAndSend({
        page,
        testInfo,
        runId: environment.runId,
        filePath: fixture.path,
        byteSize: fixture.byteSize,
        prompt: `Acknowledge the ${fixtureName} synthetic performance document.`,
        waitForAssistant: false,
      });
      expect(metrics.selectionAcknowledgedMs).toBeLessThan(2_000);
      expect(metrics.attachmentReadyMs).toBeLessThan(5 * 60 * 1000);
      expect(metrics.requestBytes).toBeLessThan(fixture.byteSize * 1.4);
      const browserHealth = await page.evaluate(() => {
        const target = window as typeof window & {
          __nexxUploadLongTasks?: number[];
        };
        const memory = performance as Performance & {
          memory?: { usedJSHeapSize: number };
        };
        return {
          maxLongTaskMs: Math.max(0, ...(target.__nexxUploadLongTasks ?? [])),
          heapAfter: memory.memory?.usedJSHeapSize ?? null,
        };
      });
      expect(browserHealth.maxLongTaskMs).toBeLessThanOrEqual(200);
      if (heapBefore !== null && browserHealth.heapAfter !== null) {
        expect(browserHealth.heapAfter - heapBefore).toBeLessThanOrEqual(
          100 * 1024 * 1024,
        );
      }
      await expect(page.getByTestId("chat-composer")).toBeEditable();
    } finally {
      await finishSyntheticRun(page, testInfo, environment.runId);
    }
  });
}
