import { useEffect, useState } from 'react';
import { listLogs, retryLog } from '../../lib/api';
import type { NotificationLog } from '../../types';
import { formatShortDateTime } from '../../lib/format';
import { Badge, Button, PageLoader, StatCard } from '../../components/ui';

const TYPE_LABEL: Record<string, string> = {
  participant_confirmation: 'Konfirmasi Peserta',
  committee_blast: 'Blast Panitia',
  reminder: 'Pengingat',
};

export default function NotificationLogsPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    listLogs()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  async function doRetry(id: string) {
    setRetrying(id);
    try {
      await retryLog(id);
      setLogs(await listLogs());
    } finally {
      setRetrying(null);
    }
  }

  if (loading) return <PageLoader />;

  const sent = logs.filter((l) => l.status === 'sent').length;
  const failed = logs.filter((l) => l.status === 'failed').length;
  const rate = logs.length ? Math.round((sent / logs.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Log Notifikasi</h1>
        <p className="text-sm text-slate-500">
          Status pengiriman WhatsApp/Email. Kegagalan tidak menggagalkan pendaftaran &amp; dapat di-retry.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={logs.length} />
        <StatCard label="Berhasil" value={sent} accent="blue" />
        <StatCard label="Gagal" value={failed} accent="amber" />
        <StatCard label="Keterkiriman" value={`${rate}%`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Waktu</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Saluran</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.slice(0, 200).map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-slate-500">{formatShortDateTime(l.created_at)}</td>
                <td className="px-4 py-3 text-slate-700">{TYPE_LABEL[l.type] ?? l.type}</td>
                <td className="px-4 py-3 text-slate-600">{l.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</td>
                <td className="px-4 py-3">
                  {l.status === 'sent' && <Badge color="green">Terkirim</Badge>}
                  {l.status === 'failed' && <Badge color="red">Gagal</Badge>}
                  {l.status === 'dry_run' && <Badge color="slate">Dry-run</Badge>}
                  {l.error_message && <p className="mt-1 text-xs text-red-500">{l.error_message}</p>}
                </td>
                <td className="px-4 py-3 text-right">
                  {l.status === 'failed' && (
                    <Button size="sm" variant="outline" loading={retrying === l.id} onClick={() => doRetry(l.id)}>
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Belum ada notifikasi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
