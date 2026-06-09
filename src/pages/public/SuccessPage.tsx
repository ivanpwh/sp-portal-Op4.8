import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { getEventSettings, getSessionByToken, shortCode } from '../../lib/api';
import type { EventSettings, SessionWithParticipants } from '../../types';
import { formatDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, PageLoader } from '../../components/ui';

export default function SuccessPage() {
  const { token = '' } = useParams();
  const [session, setSession] = useState<SessionWithParticipants | null>(null);
  const [event, setEvent] = useState<EventSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([getSessionByToken(token), getEventSettings()])
      .then(([s, e]) => {
        setSession(s);
        setEvent(e);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <PageLoader />;

  if (!session) {
    return (
      <div className="container-app py-12">
        <Alert variant="error" title="Data tidak ditemukan">
          Tautan tidak valid atau pendaftaran tidak ditemukan.
        </Alert>
      </div>
    );
  }

  const manageUrl = `${window.location.origin}/kelola/${session.manage_token}`;
  const code = shortCode(session);
  const firstName = session.participants[0]?.full_name.split(' ')[0] ?? 'Keluarga';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(manageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <div className="container-app py-8">
      {/* Hero confirmation */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-100">
          <svg className="h-12 w-12 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Terima Kasih, {firstName}!</h1>
        <p className="mt-2 text-slate-600">
          Pendaftaran untuk <strong>{session.participants.length} peserta</strong> berhasil tercatat.
          Sampai jumpa di acara! 🎉
        </p>
      </div>

      {/* QR / check-in code */}
      <Card className="mb-5 text-center">
        <p className="text-sm font-semibold text-slate-500">Kode Check-in Pendaftaran</p>
        <p className="mt-1 text-2xl font-extrabold tracking-wider text-brand-700">{code}</p>
        <div className="mt-4 inline-block rounded-2xl border border-slate-200 bg-white p-4">
          <QRCodeSVG value={code} size={180} level="M" />
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Tunjukkan QR / kode ini kepada panitia saat tiba untuk check-in seluruh peserta.
        </p>
      </Card>

      {/* Participants */}
      <Card className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">Peserta Terdaftar</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {session.participants.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800">{p.full_name}</p>
                <p className="text-xs text-slate-500">{p.accommodation || '-'}</p>
              </div>
              <Badge color="green">{p.sp_code}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      {/* Event details */}
      {event && (
        <Card className="mb-5">
          <h2 className="text-lg font-bold text-slate-900">Detail Acara</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Acara</dt>
              <dd className="text-right font-semibold text-slate-800">{event.event_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Waktu</dt>
              <dd className="text-right font-semibold text-slate-800">{formatDateTime(event.event_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Lokasi</dt>
              <dd className="text-right font-semibold text-slate-800">
                {event.location}
                <br />
                <span className="font-normal text-slate-500">{event.address}</span>
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {/* Manage link */}
      <Card className="mb-5 bg-brand-50">
        <h2 className="text-lg font-bold text-slate-900">Kelola Pendaftaran</h2>
        <p className="mt-1 text-sm text-slate-600">
          Simpan tautan ini. Anda bisa mengubah data, menambah/menghapus peserta, atau membatalkan
          kehadiran kapan saja tanpa login.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input readOnly value={manageUrl} className="input-base flex-1 text-sm" onFocus={(e) => e.target.select()} />
          <Button variant="outline" onClick={copyLink}>
            {copied ? '✓ Tersalin' : 'Salin Tautan'}
          </Button>
        </div>
        <Link to={`/kelola/${session.manage_token}`} className="mt-3 inline-block">
          <Button>Buka Halaman Kelola →</Button>
        </Link>
      </Card>

      <div className="text-center">
        <Link to="/" className="text-sm font-semibold text-slate-500 hover:text-brand-700">
          ← Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
