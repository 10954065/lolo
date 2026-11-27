import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fx = () => JSON.parse(readFileSync("test-results/e2e-fixture.json", "utf8")) as { electionId: string; passwords: Record<string, string> };

test("a member votes on a phone without horizontal scrolling", async ({ page }) => {
  const { electionId, passwords } = fx();
  await page.goto("/login");
  await page.getByLabel("Email address").fill("voter2@e2e.test");
  await page.getByLabel("Password").fill(passwords["voter2@e2e.test"]);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/dashboard/elections/${electionId}/ballot`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("radio", { name: /Kofi Asare/ }).check();
  await page.getByRole("radio", { name: /Ekow Sam/ }).check();
  await page.getByRole("button", { name: "Review my choices" }).click();
  await page.getByRole("button", { name: "Submit my vote" }).click();
  await page.getByRole("button", { name: "Yes, submit my vote" }).click();
  await expect(page.getByTestId("ballot-receipt")).toBeVisible();
});
