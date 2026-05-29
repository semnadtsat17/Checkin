import { createApp } from './core/server';
import { config } from './config';
import { seedInitialData } from './seed';

// ── Event subscribers (side-effect imports — order matters for startup logging) ─
// Each subscriber registers itself against an in-process EventEmitter.
// Importing here ensures subscriptions are live before the first HTTP request.
import './modules/leave/subscribers/leaveAttendanceSync.subscriber';
import { startAbsentJob } from './modules/attendance/attendance.absentJob';

const app = createApp();

// Seed runs async before first request; non-blocking server startup.
seedInitialData().catch((err) => console.error('[seed] Failed:', err));

app.listen(config.port, () => {
  console.log(`\n[backend] ✓ http://localhost:${config.port}  (${config.nodeEnv})\n`);
  startAbsentJob();
});
