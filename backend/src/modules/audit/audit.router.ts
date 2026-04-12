/**
 * audit.router.ts
 *
 * REST endpoint for the audit log.
 *
 * Route summary:
 *   GET /audit-logs          List entries (manager / hr / super_admin)
 *
 * Filters (all optional, applied as AND):
 *   ?actorId=<userId>
 *   ?action=UPDATE_SETTINGS|APPROVE_LATE|REJECT_LATE|APPROVE_OT|REJECT_OT|CHECK_IN|CHECK_OUT
 *   ?entityType=SETTINGS|APPROVAL|ATTENDANCE
 *   ?from=<ISO date>         createdAt >= from
 *   ?to=<ISO date>           createdAt <= to
 *
 * Auth: JWT required (authenticate).
 * Role: manager, hr, or super_admin only.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole }  from '../../shared/middleware/requireRole';
import { ok }           from '../../shared/utils/response';
import { queryLogs }    from './audit.service';
import type { AuditAction, AuditEntityType } from './audit.types';

const router = Router();
router.use(authenticate);

/**
 * GET /audit-logs
 * Returns audit entries matching the supplied filters, newest-first.
 */
router.get(
  '/',
  requireRole(['manager', 'hr', 'super_admin']),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query as Record<string, string | undefined>;

      const logs = queryLogs({
        actorId:    q.actorId,
        action:     q.action     as AuditAction     | undefined,
        entityType: q.entityType as AuditEntityType | undefined,
        from:       q.from,
        to:         q.to,
      });

      ok(res, logs);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
