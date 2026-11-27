import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const fx = () =>
  JSON.parse(readFileSync("test-results/e2e-fixture.json", "utf8")) as {
    electionId: string;
    admin: { email: string; password: string };
    passwords: Record<string, string>;
  };

/** Every visible <img> must have decoded pixels: a broken image has naturalWidth 0. */
async function expectNoBrokenImages(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  const broken = await page.evaluate(async () => {
    const imgs = Array.from(document.images).filter((img) => img.getClientRects().length > 0);
    await Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))));
    return imgs.filter((img) => img.naturalWidth === 0).map((img) => img.currentSrc || img.src);
  });
  expect(broken).toEqual([]);
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("public pages show the brand and candidate photos without broken images", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("MOBA 2017").or(page.getByAltText(/MOBA, Mfantsipim/)).first()).toBeVisible();
  await expectNoBrokenImages(page);

  await page.goto("/candidates");
  await expect(page.getByAltText("Photograph of Kwame Mensah")).toBeVisible();
  await expectNoBrokenImages(page);
});

test("the ballot shows candidate photos and initials without broken images", async ({ page }) => {
  const { electionId, passwords } = fx();
  await signIn(page, "voter3@e2e.test", passwords["voter3@e2e.test"]);
  await page.goto(`/dashboard/elections/${electionId}/ballot`);
  await expect(page.getByAltText("Photograph of Kwame Mensah")).toBeVisible();
  await expect(page.getByRole("img", { name: "Kofi Asare (no photograph)" })).toBeVisible();
  await expectNoBrokenImages(page);
});

test("administrators see candidate photos without broken images", async ({ page }) => {
  const { electionId, admin } = fx();
  await signIn(page, admin.email, admin.password);
  await page.goto(`/admin/elections/${electionId}/candidates`);
  await expect(page.getByAltText("Photograph of Kwame Mensah")).toBeVisible();
  await expectNoBrokenImages(page);
});
