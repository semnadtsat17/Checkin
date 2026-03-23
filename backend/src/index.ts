import { createApp } from './core/server';
import { config } from './config';
import { seedSubRoles } from './modules/employees/sub-role.seed';

// ── Seed default data (no-ops if data already exists) ─────────────────────────
seedSubRoles();

const app = createApp();

app.listen(config.port, () => {
  console.log(`\n[backend] ✓ http://localhost:${config.port}  (${config.nodeEnv})\n`);
});
