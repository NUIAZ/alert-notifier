/**
 * vitest.config.js: tests run in Node with a jsdom DOM. There is no `chrome`
 * global in Node; tests that need one build a tiny stub (tests/chrome-stub.js)
 * so we exercise the real background.js against a fake storage/alarms/
 * notifications surface rather than mocking our own modules.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // No global setup file: the chrome stub is opt-in per test so pure-module
    // tests stay pure.
  },
});
