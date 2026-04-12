import { createApp } from './core/server';
import { config } from './config';
import { seedSubRoles } from './modules/employees/sub-role.seed';

// ── Event subscribers (side-effect imports — order matters for startup logging) ─
// Each subscriber registers itself against an in-process EventEmitter.
// Importing here ensures subscriptions are live before the first HTTP request.
import './modules/leave/subscribers/leaveAttendanceSync.subscriber';

// ── Seed default data (no-ops if data already exists) ─────────────────────────
seedSubRoles();

const app = createApp();

app.listen(config.port, () => {
  console.log(`\n[backend] ✓ http://localhost:${config.port}  (${config.nodeEnv})\n`);
});
