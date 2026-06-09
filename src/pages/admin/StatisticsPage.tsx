import { useEffect, useState } from 'react';
import { exportCsv, getStats } from '../../lib/api';
import type { Stats } from '../../types';
import { Button, Card, PageLoader, StatCard } from '../../components/ui';
import { formatDate } from '../../lib/format';

export default function StatisticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  function downloadCsv() {
    const blob = new Blob([exportCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sp-portal-peserta-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !stats) return <PageLoader />;

  const maxInduk = Math.max(1, ...stats.by_sp_induk.map((b) => b.people));
  const maxTrend = Math.max(1, ...stats.trend.map((t) => t.count));
  const attendanceRate = stats.total_people
    ? Math.round((stats.total_checked_in / stats.total_people) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Statistik &amp; Laporan</h1>
          <p className="text-sm text-slate-500">Ringkasan pendaftaran dan kehadiran.</p>
        </div>
        <Button variant="outline" onClick={downloadCsv}>⬇ Ekspor CSV (Excel)</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Sesi Terdaftar" value={stats.total_sessions} />
        <StatCard label="Total Peserta" value={stats.total_people} accent="blue" sub="Untuk perkiraan konsumsi" />
        <StatCard label="Sudah Check-in" value={stats.total_checked_in} accent="amber" sub={`${attendanceRate}% dari peserta`} />
        <StatCard label="Peserta Dibatalkan" value={stats.total_cancelled} accent="slate" />
      </div>

      {/* By SP Induk */}
      <Card>
        <h2 className="text-lg font-bold text-slate-900">Rekap per SP Induk</h2>
        <p className="text-sm text-slate-500">Jumlah peserta &amp; sesi per kelompok keturunan (SP Induk).</p>
        <div className="mt-4 space-y-3">
          {stats.by_sp_induk.map((b) => (
            <div key={b.induk}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-mono font-semibold text-slate-700">{b.induk}</span>
                <span className="text-slate-500">
                  {b.people} orang · {b.sessions} sesi
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${(b.people / maxInduk) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {stats.by_sp_induk.length === 0 && <p className="text-sm text-slate-400">Belum ada data.</p>}
        </div>
      </Card>

      {/* Trend */}
      <Card>
        <h2 className="text-lg font-bold text-slate-900">Tren Pendaftaran</h2>
        <p className="text-sm text-slate-500">Jumlah sesi pendaftaran baru per hari.</p>
        <div className="mt-5 flex items-end gap-2 overflow-x-auto pb-2" style={{ height: 180 }}>
          {stats.trend.map((t) => (
            <div key={t.date} className="flex min-w-[44px] flex-1 flex-col items-center justify-end gap-2">
              <span className="text-xs font-semibold text-slate-600">{t.count}</span>
              <div
                className="w-full rounded-t-lg bg-brand-500 transition-all"
                style={{ height: `${(t.count / maxTrend) * 120}px`, minHeight: 4 }}
                title={`${t.count} sesi`}
              />
              <span className="whitespace-nowrap text-[10px] text-slate-400">{formatDate(t.date).split(' ').slice(0, 2).join(' ')}</span>
            </div>
          ))}
          {stats.trend.length === 0 && <p className="text-sm text-slate-400">Belum ada data.</p>}
        </div>
      </Card>
    </div>
  );
}
