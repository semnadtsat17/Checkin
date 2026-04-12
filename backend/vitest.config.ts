import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment:     'node',
    include:         ['src/__tests__/**/*.test.ts'],
    globals:         false,
    // Test files must run sequentially — they all share the same JSON-file-backed
    // storage (attendance_approvals.json, audit_logs.json, notifications.json …).
    // Parallel workers hitting the same files produce race conditions.
    fileParallelism: false,
  },
});
