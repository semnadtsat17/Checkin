import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './schedule.controller';

const router = Router();

router.use(authenticate);

// All schedule operations require manager or above.
// Department-level access enforcement is done inside the service.
router.get('/',                        requireRole('manager'), ctrl.list);
router.post('/batch',                  requireRole('manager'), ctrl.batchUpsertWeeks);
// /days, /publish, /my, /my-days, /my-calendar must be registered BEFORE /:id
router.post('/days',                   requireRole('manager'), ctrl.upsertDays);
router.post('/publish',                requireRole('manager'), ctrl.publishSchedule);
router.get('/publish-status',          requireRole('manager'), ctrl.getPublishStatus);
router.get('/working-time',            requireRole('manager'), ctrl.getWorkingTime);
router.get('/employee-calendar',       requireRole('manager'), ctrl.getEmployeeCalendar);
router.get('/days',                    requireRole('manager'), ctrl.findDays);
router.get('/my',                      ctrl.getMySchedules);
router.get('/my-days',                 ctrl.getMyDays);
router.get('/my-calendar',             ctrl.getMyCalendar);
router.get('/:id',                     requireRole('manager'), ctrl.getOne);
router.post('/',                       requireRole('manager'), ctrl.upsertWeek);
router.patch('/:id/days/:date',        requireRole('manager'), ctrl.updateDay);
router.delete('/:id',                  requireRole('manager'), ctrl.remove);

export default router;
