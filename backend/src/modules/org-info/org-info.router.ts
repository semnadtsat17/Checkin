/**
 * org-info.router.ts
 *
 * Global organisation identity — single record, always present.
 *
 * GET  /org-info  — any authenticated user (for header/branding display)
 * PATCH /org-info — super_admin only
 *
 * Fields: nameTh, nameEn (optional), logoPath (optional)
 */
import { Router } from 'express';
import type { OrgInfo } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';

const store = new JsonRepository<OrgInfo>('org_info');

function getOrCreate(): OrgInfo {
  const existing = store.findOne(() => true);
  if (existing) return existing;
  return store.create({
    nameTh: 'องค์กร',
  } as Omit<OrgInfo, 'id' | 'createdAt' | 'updatedAt'>);
}

const router = Router();

router.get('/', authenticate, (_req, res) => {
  res.json({ success: true, data: getOrCreate() });
});

router.patch('/', authenticate, requireRole('super_admin'), (req, res) => {
  const record = getOrCreate();
  const body = req.body as { nameTh?: string; nameEn?: string; logoPath?: string };

  const patch: Partial<OrgInfo> = {};
  if (body.nameTh   !== undefined) patch.nameTh   = body.nameTh.trim();
  if (body.nameEn   !== undefined) patch.nameEn   = body.nameEn.trim() || undefined;
  if (body.logoPath !== undefined) patch.logoPath  = body.logoPath.trim() || undefined;

  if (!Object.keys(patch).length) {
    return res.json({ success: true, data: record });
  }
  if (patch.nameTh === '') {
    return res.status(400).json({ success: false, error: 'nameTh cannot be empty' });
  }

  const updated = store.updateById(record.id, patch) ?? record;
  return res.json({ success: true, data: updated });
});

export default router;
