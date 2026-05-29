import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../config/permissions';

export default function BranchSelectPage() {
  const { pendingBranches, selectBranch, user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  if (!pendingBranches) {
    return null;
  }

  async function handleSelect(branchId: string) {
    setError('');
    setLoading(true);
    try {
      await selectBranch(branchId);
      const dest = hasPermission(user?.role, 'ADMIN_ACCESS') ? '/dashboard' : '/employee-dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเลือกสาขาได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">เลือกสาขา</h1>
          <p className="mt-1 text-sm text-gray-500">
            สวัสดี {user?.firstName} — กรุณาเลือกสาขาที่ต้องการเข้าใช้งาน
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {pendingBranches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => handleSelect(branch.id)}
              disabled={loading}
              className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-200 transition hover:ring-primary-400 hover:shadow-md disabled:opacity-60"
            >
              <div className="font-medium text-gray-900">{branch.nameTh}</div>
              {branch.nameEn && (
                <div className="text-sm text-gray-500">{branch.nameEn}</div>
              )}
              {branch.province && (
                <div className="mt-1 text-xs text-gray-400">{branch.province}</div>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={logout}
          className="mt-6 w-full text-sm text-gray-500 hover:text-gray-700"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}
