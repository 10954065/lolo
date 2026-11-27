import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fx = () =>
  JSON.parse(readFileSync("test-results/e2e-fixture.json", "utf8")) as {
    electionId: string;
    admin: { email: string; password: string };
    passwords: Record<string, string>;
  };

const horizontalOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("the public menu opens as a side panel on a phone", async ({ page }) => {
  await page.goto("/");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open menu" }).click();
  const panel = page.getByRole("dialog", { name: "Menu" });
  await expect(panel.getByRole("link", { name: /Voting guidelines/ })).toBeVisible();
  await panel.getByRole("link", { name: /Candidates/ }).click();
  await expect(page).toHaveURL(/\/candidates$/);
});

test("staff navigate with the bottom tab bar and the More drawer", async ({ page }) => {
  const { admin, electionId } = fx();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const tabs = page.getByRole("navigation", { name: "Quick navigation" });
  await tabs.getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/\/admin\/members$/);
  await tabs.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Audit log" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);

  for (const path of ["/admin", "/admin/members", `/admin/elections/${electionId}`, `/admin/elections/${electionId}/voters`, "/admin/audit"]) {
    await page.goto(path);
    expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(1);
  }
});

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
