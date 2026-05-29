import { useEffect, useState } from 'react';
import type { ShiftTransferRequest } from '@hospital-hr/shared';
import { useAuth } from '../../context/AuthContext';
import { shiftTransferApi, type CreateShiftTransferDto } from '../../api/shiftTransfer';
import { employeeApi } from '../../api/employees';
import type { UserProfile } from '@hospital-hr/shared';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function statusBadge(status: ShiftTransferRequest['status']): { label: string; cls: string } {
  switch (status) {
    case 'pending_target':  return { label: 'รอผู้รับตอบ',      cls: 'bg-yellow-100 text-yellow-700' };
    case 'pending_manager': return { label: 'รอหัวหน้าอนุมัติ', cls: 'bg-blue-100 text-blue-700' };
    case 'approved':        return { label: 'อนุมัติแล้ว',      cls: 'bg-green-100 text-green-700' };
    case 'rejected':        return { label: 'ไม่อนุมัติ',        cls: 'bg-red-100 text-red-700' };
  }
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateForm({
  colleagues,
  onSave,
  onCancel,
}: {
  colleagues: UserProfile[];
  onSave:     (dto: CreateShiftTransferDto) => Promise<void>;
  onCancel:   () => void;
}) {
  const [receiverId, setReceiverId] = useState('');
  const [shiftDate,  setShiftDate]  = useState('');
  const [shiftCode,  setShiftCode]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receiverId) { setError('กรุณาเลือกพนักงานที่จะรับเวร');   return; }
    if (!shiftDate)  { setError('กรุณาเลือกวันที่');                return; }
    if (!shiftCode.trim()) { setError('กรุณากรอกรหัสกะ (Shift Code)'); return; }
    setSaving(true);
    try {
      await onSave({ receiverId, shiftDate, shiftCode: shiftCode.trim().toUpperCase() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">พนักงานที่จะรับเวร *</label>
        <select
          value={receiverId} onChange={(e) => setReceiverId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">— เลือกพนักงาน —</option>
          {colleagues.map((c) => (
            <option key={c.id} value={c.id}>{c.firstNameTh} {c.lastNameTh}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">วันที่ต้องการโอนเวร *</label>
        <input
          type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">รหัสกะ (Shift Code) *</label>
        <input
          type="text" value={shiftCode} onChange={(e) => setShiftCode(e.target.value)}
          placeholder="เช่น D, N, A"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <p className="mt-1 text-xs text-gray-400">กรอกรหัสกะตามตารางเวร เช่น D = เช้า, N = ดึก</p>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit" disabled={saving}
          className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {saving ? 'กำลังส่ง...' : 'ส่งคำขอ'}
        </button>
        <button
          type="button" onClick={onCancel}
          className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

// ─── Request card ──────────────────────────────────────────────────────────────

function RequestCard({
  req,
  myId,
  onRespond,
  onCancel,
}: {
  req:       ShiftTransferRequest;
  myId:      string;
  onRespond: (id: string, response: 'accepted' | 'declined') => Promise<void>;
  onCancel:  (id: string) => Promise<void>;
}) {
  const isSender   = req.senderId   === myId;
  const isReceiver = req.receiverId === myId;
  const badge      = statusBadge(req.status);
  const [acting,   setActing]   = useState(false);
  const [error,    setError]    = useState('');

  async function act(fn: () => Promise<void>) {
    setActing(true);
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'); }
    finally { setActing(false); }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            กะ <span className="font-mono">{req.shiftCode}</span>
            {' · '}
            {fmtDate(req.shiftDate)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {isSender ? 'คุณส่ง → รับโดยพนักงานอื่น' : 'พนักงานอื่นส่งให้คุณ'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {req.managerNote && (
        <p className="text-xs text-gray-500 italic">หมายเหตุ: {req.managerNote}</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Receiver: respond */}
      {isReceiver && req.status === 'pending_target' && (
        <div className="flex gap-2">
          <button
            disabled={acting}
            onClick={() => act(() => onRespond(req.id, 'accepted'))}
            className="flex-1 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
          >
            รับเวร
          </button>
          <button
            disabled={acting}
            onClick={() => act(() => onRespond(req.id, 'declined'))}
            className="flex-1 rounded-xl border border-red-300 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            ปฏิเสธ
          </button>
        </div>
      )}

      {/* Sender: cancel */}
      {isSender && req.status === 'pending_target' && (
        <button
          disabled={acting}
          onClick={() => act(() => onCancel(req.id))}
          className="w-full rounded-xl border border-gray-300 py-2 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          ยกเลิกคำขอ
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShiftTransferPage() {
  const { user } = useAuth();
  const [requests,   setRequests]   = useState<ShiftTransferRequest[]>([]);
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [reqs, emps] = await Promise.all([
        shiftTransferApi.listMy(),
        employeeApi.list({ departmentId: user?.departmentId, isActive: true, pageSize: 200 })
          .then((r) => r.items.filter((e) => e.id !== user?.id)),
      ]);
      setRequests(reqs);
      setColleagues(emps);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(dto: CreateShiftTransferDto) {
    await shiftTransferApi.create(dto);
    setShowForm(false);
    load();
  }

  async function handleRespond(id: string, response: 'accepted' | 'declined') {
    await shiftTransferApi.respond(id, response);
    load();
  }

  async function handleCancel(id: string) {
    await shiftTransferApi.cancel(id);
    load();
  }

  if (loading) return <PageSpinner />;

  const incoming = requests.filter((r) => r.receiverId === user?.id && r.status === 'pending_target');
  const outgoing = requests.filter((r) => r.senderId   === user?.id);
  const others   = requests.filter((r) => r.receiverId === user?.id && r.status !== 'pending_target');

  return (
    <div className="p-4 lg:p-6 max-w-lg">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">โอนเวร</h1>
          <p className="mt-0.5 text-sm text-gray-400">ส่งหรือรับเวรกับเพื่อนร่วมแผนก</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
        >
          + ส่งเวร
        </button>
      </div>

      {/* Incoming — action required */}
      {incoming.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-amber-700">
            รอการตอบรับจากคุณ ({incoming.length})
          </h2>
          <div className="space-y-3">
            {incoming.map((r) => (
              <RequestCard key={r.id} req={r} myId={user!.id}
                onRespond={handleRespond} onCancel={handleCancel} />
            ))}
          </div>
        </section>
      )}

      {/* Outgoing */}
      {outgoing.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">คำขอที่คุณส่ง</h2>
          <div className="space-y-3">
            {outgoing.map((r) => (
              <RequestCard key={r.id} req={r} myId={user!.id}
                onRespond={handleRespond} onCancel={handleCancel} />
            ))}
          </div>
        </section>
      )}

      {/* Received (non-pending) */}
      {others.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">คำขอที่รับมา</h2>
          <div className="space-y-3">
            {others.map((r) => (
              <RequestCard key={r.id} req={r} myId={user!.id}
                onRespond={handleRespond} onCancel={handleCancel} />
            ))}
          </div>
        </section>
      )}

      {requests.length === 0 && (
        <div className="py-16 text-center text-sm text-gray-400">ยังไม่มีคำขอโอนเวร</div>
      )}

      {/* Create modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="ส่งคำขอโอนเวร">
        <CreateForm
          colleagues={colleagues}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
