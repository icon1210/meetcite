import { defineConfig } from "@playwright/test";

const python = process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";

// End-to-end tests run the real API in demo AI mode (no GPU needed) plus the Vite dev server.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port 8000`,
      cwd: "../backend",
      url: "http://localhost:8000/api/health",
      env: {
        AI_MODE: "fake",
        DATA_DIR: "./data-e2e",
        DATABASE_URL: "sqlite:///./data-e2e/meetmind.db",
      },
      // Never reuse a running API: it may be the real one, and tests would write into real meetings.
      // Stop the MeetMind API window before running the tests.
      reuseExistingServer: false,
    },
    { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: true },
  ],
});
