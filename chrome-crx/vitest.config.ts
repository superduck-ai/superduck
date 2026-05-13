import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts'
    ],
    globals: false,
    maxWorkers: 4,
    fileParallelism: true,
    isolate: true,
    sequence: {
      shuffle: true,
      // Randomize the order of tests *within* a file too, on top of the
      // file-level shuffle. Any in-file ordering dependency surfaces
      // immediately.
      hooks: 'parallel'
    },
    // Test-performance tracking:
    //   * The default + verbose reporters print per-test timings on every run
    //     so timings show up in CI logs.
    //   * The junit reporter writes a machine-readable XML report
    //     (`test-results.junit.xml`) that GitHub Actions / BuildPulse /
    //     Datadog CI Visibility / etc. can ingest to chart suite duration
    //     over time.
    //   * `slowTestThreshold` (ms) flags any test slower than the threshold
    //     so regressions are caught early, not buried in averages.
    reporters: process.env.CI
      ? [
          ['default', { summary: false }],
          'verbose',
          ['junit', { suiteName: 'chrome-crx' }]
        ]
      : ['default'],
    outputFile: {
      junit: 'test-results.junit.xml'
    },
    slowTestThreshold: 300,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      // Only the modules that are exercised by our unit/integration tests are
      // included in the coverage report. UI / Chrome-extension surfaces
      // (service worker, sidepanel React, CDP bridge) are intentionally
      // excluded because they cannot be exercised in a node test runner —
      // adding them would dilute the gate to a meaningless number.
      include: [
        'src/lib/utils.ts',
        'src/is-plan-event-enabled.ts',
        'src/mcpRuntime/shared.ts'
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/vite-env.d.ts'],
      // CI gate: any drop in coverage on the tested modules fails the build.
      // Function coverage is set lower than line/statement coverage because
      // shared.ts intentionally exposes a number of no-op stubs (e.g. the
      // screenRecorder facade) that serve as injection points for the
      // service-worker runtime and have no behavior to assert from node.
      thresholds: {
        lines: 85,
        statements: 85,
        branches: 85,
        functions: 55
      }
    }
  }
});
