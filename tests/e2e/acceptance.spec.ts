/**
 * End-to-end acceptance tests against a production build with a hardened database.
 * Numbers refer to the acceptance list in the project brief (TESTING.md).
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

interface Fixture {
  electionId: string;
  admin: { email: string; password: string };
  committee: { email: string; password: string };
  passwords: Record<string, string>;
}
const fx = (): Fixture => JSON.parse(readFileSync("test-results/e2e-fixture.json", "utf8")) as Fixture;

async function signIn(page: Page, email: string, password: string, shouldSucceed = true): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (shouldSucceed) await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("16: unauthenticated users are sent to sign in from every protected area", async ({ page }) => {
  for (const path of ["/admin", "/committee", "/dashboard", "/admin/members"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("1: a member who is not approved cannot sign in to vote", async ({ page }) => {
  await signIn(page, "rejected@e2e.test", fx().passwords["rejected@e2e.test"], false);
  await expect(page.getByText(/not currently approved/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("2 + 3: an approved member signs in and must replace the temporary password", async ({ page }) => {
  const temp = fx().passwords["temp@e2e.test"];
  await signIn(page, "temp@e2e.test", temp);
  await expect(page).toHaveURL(/\/change-password/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/change-password/);
  await page.getByLabel(/Temporary password/).fill(temp);
  await page.getByLabel("New password", { exact: false }).first().fill("Larabanga-Mosque-1421");
  await page.getByLabel("Confirm new password").fill("Larabanga-Mosque-1421");
  await page.getByRole("button", { name: /Save password/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
});

test("16: voters cannot open administrative or committee dashboards or exports", async ({ page }) => {
  await signIn(page, "voter3@e2e.test", fx().passwords["voter3@e2e.test"]);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/committee/audit");
  await expect(page).toHaveURL(/\/dashboard$/);
  const response = await page.request.get("/api/exports/members");
  expect(response.status()).toBe(403);
});

test("5 + 6 + 8: a member votes once; the receipt is shown without choices; the ballot cannot be reopened", async ({ page }) => {
  const { electionId, passwords } = fx();
  await signIn(page, "voter1@e2e.test", passwords["voter1@e2e.test"]);
  await page.goto(`/dashboard/elections/${electionId}`);
  await expect(page.getByText("Voting is open")).toBeVisible();
  await page.getByRole("link", { name: /Go to the ballot/ }).click();

  await page.getByRole("button", { name: "Review my choices" }).click();
  await expect(page.getByText(/Please make a choice for President/)).toBeVisible();

  await page.getByRole("radio", { name: /Kwame Mensah/ }).check();
  await page.getByRole("radio", { name: /I abstain/ }).nth(1).check();
  await page.getByRole("button", { name: "Review my choices" }).click();
  await expect(page.getByText("Review your choices", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit my vote" }).click();
  await expect(page.getByRole("alertdialog").getByText(/Once submitted, your ballot cannot be changed/)).toBeVisible();
  await page.getByRole("button", { name: "Yes, submit my vote" }).click();

  const receipt = page.getByTestId("ballot-receipt");
  await expect(receipt).toHaveText(/^MOBA(-[0-9A-Z]{5}){5}$/);
  await expect(page.getByText("Your vote has been recorded")).toBeVisible();
  await expect(page.getByText("Kwame Mensah")).toHaveCount(0);
  const code = (await receipt.textContent())!.trim();

  await page.goto(`/dashboard/elections/${electionId}/ballot`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/elections/${electionId}$`));
  await expect(page.getByText("You have voted")).toBeVisible();

  await page.goto("/verify-receipt");
  await page.getByLabel("Receipt code").fill(code);
  await page.getByRole("button", { name: "Verify receipt" }).click();
  await expect(page.getByText(/matches a ballot recorded/)).toBeVisible();
});

test("9 + 13: administrators cannot see vote counts while voting is open", async ({ page }) => {
  const { electionId, admin } = fx();
  await signIn(page, admin.email, admin.password);
  await page.goto(`/admin/elections/${electionId}/results`);
  await expect(page.getByText(/Results are sealed until voting closes/)).toBeVisible();
  const response = await page.request.get(`/api/exports/elections/${electionId}/results.csv`);
  expect(response.status()).toBe(403);
});

test("11 + 12: the Electoral Committee is read-only, in the UI and on direct requests", async ({ page }) => {
  const { committee, electionId } = fx();
  await signIn(page, committee.email, committee.password);
  await expect(page).toHaveURL(/\/committee/);
  await expect(page.getByText(/READ-ONLY ACCESS/)).toBeVisible();
  for (const path of ["/admin", "/admin/members/new", `/admin/elections/${electionId}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/committee$/);
  }
  const forbidden = await page.request.get("/api/exports/imports/00000000-0000-4000-8000-000000000000/failed");
  expect(forbidden.status()).toBe(403);
  await page.goto(`/committee/elections/${electionId}`);
  await expect(page.getByText("Voter roll and participation")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve|Delete|Publish|Cancel election/ })).toHaveCount(0);
});

test("security headers and CSP nonce are present", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
