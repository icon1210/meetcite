import { expect, test } from "@playwright/test";

// The full user journey from the spec's testing strategy (§17):
// register, upload, wait for results, check a source, edit, export, delete.
test("user can process, edit, export and delete a meeting", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("a-long-password");
  await page.getByLabel("Confirm password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: /your meetings/i })).toBeVisible();

  await page.getByRole("link", { name: "Upload" }).first().click();
  await page.locator('input[type="file"][accept^=".mp3"]').setInputFiles({
    name: "launch-planning.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.from("ID3 sample"),
  });
  await expect(page.getByLabel("Meeting title")).toHaveValue("launch planning");
  await page.getByRole("button", { name: "Upload and process" }).click();

  // Results appear once processing finishes.
  await expect(page.getByRole("tab", { name: /Summary/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("AI-generated")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Detailed minutes" })).toBeVisible();
  await expect(page.getByText(/AI check: \d+% of \d+ points look supported/)).toBeVisible();
  await page.screenshot({ path: "test-results/screens/meeting-summary.png", fullPage: true });
  // Evidence review lists every claim, flagged ones first.
  await page.getByRole("tab", { name: /Evidence review/ }).click();
  await expect(page.getByText("claims in these minutes")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/evidence-review.png", fullPage: true });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /your meetings/i })).toBeVisible();
  await expect(page.getByText("Audio transcribed")).toBeVisible();
  // The home page says which meeting needs attention and why, and each reason opens the right tab.
  const attention = page.getByRole("list", { name: "Meetings that need attention" });
  await expect(attention.getByRole("link", { name: "launch planning" })).toBeVisible();
  await expect(attention.getByRole("link", { name: /claims? to check/ })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/dashboard.png", fullPage: true });
  await attention.getByRole("link", { name: /claims? to check/ }).click();
  await expect(page.getByRole("tab", { name: /Evidence review/ })).toHaveAttribute("aria-selected", "true");
  await page.goto("/");
  await page
    .getByRole("list", { name: "Meetings", exact: true })
    .getByRole("link", { name: "launch planning" })
    .click();
  await expect(page.getByRole("tab", { name: /Summary/ })).toBeVisible();

  // The fact-checker flags the sample's invented claim.
  await page.getByRole("tab", { name: /Questions & risks/ }).click();
  await expect(page.getByText("AI check: not supported").first()).toBeVisible();
  await page.screenshot({ path: "test-results/screens/questions-risks.png", fullPage: true });

  await page.getByRole("tab", { name: /Insights/ }).click();
  await expect(page.getByRole("heading", { name: "Participation" })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/insights.png", fullPage: true });
  await page.getByRole("tab", { name: /Summary/ }).click();

  // A source link opens the transcript at the cited segment (US6).
  await page
    .getByRole("button", { name: /Go to transcript at/ })
    .first()
    .click();
  await expect(page.getByRole("tab", { name: /Transcript/ })).toHaveAttribute("aria-selected", "true");

  // Accept the name MeetCite found ("I'm Priya"), then rename another speaker by hand (US9).
  await page.getByRole("button", { name: /Use the suggested name Priya for Speaker 1/ }).click();
  await expect(page.getByRole("button", { name: "Rename Priya" })).toBeVisible();
  await page.getByRole("button", { name: "Rename Speaker 2" }).click();
  await page.getByLabel("New name for Speaker 2").fill("Tunde");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("button", { name: "Rename Tunde" })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/transcript.png", fullPage: true });

  // Label a decision with the factual-support rubric (FR19).
  await page.getByRole("tab", { name: /Decisions/ }).click();
  await page.getByRole("button", { name: "Review this claim" }).first().click();
  await page.getByRole("button", { name: "Supported", exact: true }).click();
  await expect(page.getByRole("button", { name: /Your review: Supported/ })).toBeVisible();

  // Generate the C1 baseline and compare it with C2 side by side (FR13, FR18).
  await page.getByRole("tab", { name: /Compare/ }).click();
  await page.getByRole("button", { name: /Generate C1/ }).click();
  await expect(page.getByRole("tab", { name: /Compare \(2\)/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No evidence cited").first()).toBeVisible();
  await page.screenshot({ path: "test-results/screens/compare.png", fullPage: true });
  // The baseline is now the active version; switch the Summary tab back to C2.
  await page.getByRole("button", { name: "Use this version" }).click();
  await expect(page.getByText("Shown in Summary tab")).toHaveCount(1);

  // Mark an action item done (US5).
  await page.getByRole("tab", { name: /Action items/ }).click();
  const firstCheckbox = page.getByRole("checkbox").first();
  await firstCheckbox.check();
  await expect(firstCheckbox).toBeChecked();
  await page.screenshot({ path: "test-results/screens/action-items.png", fullPage: true });

  // Export minutes (US8).
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "TXT" }).click();
  expect((await download).suggestedFilename()).toContain("minutes.txt");

  // Delete permanently (US9).
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("heading", { name: /your meetings/i })).toBeVisible();
  await expect(page.getByText("No meetings yet")).toBeVisible();
});

test("browser recording cannot start without consent (spec §14)", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Recorder");
  await page.getByLabel("Email").fill(`rec-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("a-long-password");
  await page.getByLabel("Confirm password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "Record" }).first().click();

  const start = page.getByRole("button", { name: "Start recording" });
  await expect(start).toBeDisabled();
  await page.getByText("Everyone in this meeting has been told").click();
  await expect(start).toBeEnabled();
  await page.screenshot({ path: "test-results/screens/record.png", fullPage: true });
});

test("project memory: a series carries actions over and answers across meetings", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Series User");
  await page.getByLabel("Email").fill(`series-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("a-long-password");
  await page.getByLabel("Confirm password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();

  // Create a series from the dashboard; it opens the series page.
  await page.getByRole("button", { name: "New series" }).click();
  await page.getByLabel("New series name").fill("Weekly team meeting");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Weekly team meeting/ })).toBeVisible();

  const addMeeting = async (title: string) => {
    await page.getByRole("link", { name: "Add a meeting" }).click();
    await page.locator('input[type="file"][accept^=".mp3"]').setInputFiles({
      name: "week.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.from("ID3 sample"),
    });
    await page.getByLabel("Meeting title").fill(title);
    await page.getByLabel("Agenda (optional)").fill("Launch date\nBudget\nHiring plan");
    await page.getByRole("button", { name: "Upload and process" }).click();
    await expect(page.getByRole("tab", { name: /Summary/ })).toBeVisible({ timeout: 30_000 });
  };

  await addMeeting("Week 1");
  await page.getByRole("tab", { name: /Follow-up/ }).click();
  await expect(page.getByRole("heading", { name: "Agenda check" })).toBeVisible();
  await expect(page.getByText("Hiring plan")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Follow-up email" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deadline reminders" })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/follow-up.png", fullPage: true });

  // The second meeting in the series sees the first meeting's open actions.
  await page.getByRole("tab", { name: /Series memory/ }).click();
  await page.getByRole("link", { name: "Open series" }).click();
  await addMeeting("Week 2");
  await page.getByRole("tab", { name: /Series memory/ }).click();
  await expect(page.getByRole("heading", { name: "Still open from earlier meetings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark done" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/screens/series-memory.png", fullPage: true });

  // Series page: one action tracker and questions across all meetings.
  await page.getByRole("link", { name: "Open series" }).click();
  await expect(page.getByRole("tab", { name: /Actions/ })).toBeVisible();
  await page
    .getByRole("button", { name: /Mark done:/ })
    .first()
    .click();
  await page.getByRole("tab", { name: /Ask across meetings/ }).click();
  await page.getByLabel("Question about this series").fill("When is the launch?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText("Sources")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/series-page.png", fullPage: true });
});

test("visitors see the landing page and can sign up from it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // every section visible for the full-page screenshot
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Turn Meetings Into Actionable Intelligence/ })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/landing.png", fullPage: true });

  // The product preview: choosing a citation highlights its transcript line.
  await page.getByRole("tab", { name: "Action items" }).click();
  await page.getByRole("button", { name: "Show source at 00:53" }).click();
  await expect(page.getByRole("button", { name: "Show source at 00:53" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("link", { name: "Explore How It Works" }).click();
  await expect(page).toHaveURL(/#how-it-works$/);

  await page.getByRole("link", { name: "Get Started" }).first().click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByRole("link", { name: "MeetCite home" }).click();
  await page.getByRole("link", { name: "Sign In" }).first().click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("protected pages redirect to login", async ({ page }) => {
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
