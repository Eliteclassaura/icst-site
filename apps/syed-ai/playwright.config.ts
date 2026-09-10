import { defineConfig, devices } from '@playwright/test'

// Five viewports from the master prompt × three engines. Public flows run in all three;
// admin flows run in Chromium only (tagged @admin) to keep CI time sane.
const VIEWPORTS = [360, 390, 768, 1024, 1440]
// Sandboxes with a preinstalled Chromium can point here instead of downloading (CI installs normally).
const chromiumExe = process.env.PW_CHROMIUM_EXECUTABLE
const chromiumLaunch = chromiumExe ? { launchOptions: { executablePath: chromiumExe } } : {}
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    ...(['chromium', 'firefox', 'webkit'] as const).flatMap((engine) =>
      VIEWPORTS.map((w) => ({
        name: `${engine}-${w}`,
        use: {
          ...devices[
            engine === 'chromium'
              ? 'Desktop Chrome'
              : engine === 'firefox'
                ? 'Desktop Firefox'
                : 'Desktop Safari'
          ],
          viewport: { width: w, height: 900 },
          ...(engine === 'chromium' ? chromiumLaunch : {}),
        },
        grepInvert: /@admin/,
      })),
    ),
    { name: 'admin-chromium', use: { ...devices['Desktop Chrome'], ...chromiumLaunch }, grep: /@admin/ },
  ],
})
