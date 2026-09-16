import { useEffect, useState } from 'react';
import { getEventSettings, updateEventSettings } from '../../lib/api';
import type { EventSettings } from '../../types';
import { Alert, Button, Card, Field, Input, PageLoader, Textarea } from '../../components/ui';
import { evaluateRegistrationGate, isDeadlinePassed } from '../../lib/registrationGate';
import { formatDateTime } from '../../lib/format';

// ISO <-> <input type="datetime-local"> helpers (local time).
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function EventSettingsPage() {
  const [ev, setEv] = useState<EventSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getEventSettings()
      .then(setEv)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !ev) return <PageLoader />;

  // Dihitung dari state form, bukan dari hasil simpan terakhir, supaya panitia
  // melihat akibat suntingannya seketika.
  const gate = evaluateRegistrationGate({
    registration_open: ev.registration_open,
    registration_deadline: ev.registration_deadline,
  });
  const deadlinePassed = isDeadlinePassed(ev.registration_deadline);

  function patch<K extends keyof EventSettings>(key: K, value: EventSettings[K]) {
    setEv((e) => (e ? { ...e, [key]: value } : e));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateEventSettings(ev!);
      setEv(updated);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Pengaturan Acara</h1>
        <p className="text-sm text-slate-500">Atur detail acara, tenggat, dan buka/tutup pendaftaran.</p>
      </div>

      {saved && <Alert variant="success" title="Tersimpan">Pengaturan acara berhasil diperbarui.</Alert>}

      <form onSubmit={save} className="space-y-5">
        <Card className="space-y-5">
          <Field label="Nama Acara" required>
            <Input value={ev.event_name} onChange={(e) => patch('event_name', e.target.value)} />
          </Field>
          <Field label="Tagline / Deskripsi Singkat" hint="Teks sambutan di bawah nama acara pada halaman utama.">
            <Textarea value={ev.tagline} onChange={(e) => patch('tagline', e.target.value)} rows={3} />
          </Field>
          <Field label="Tanggal &amp; Waktu Acara" required>
            <Input
              type="datetime-local"
              value={toLocalInput(ev.event_date)}
              onChange={(e) => patch('event_date', fromLocalInput(e.target.value) ?? ev.event_date)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Nama Lokasi" required>
              <Input value={ev.location} onChange={(e) => patch('location', e.target.value)} />
            </Field>
            <Field label="Kata Kunci Peta (Google Maps)" hint="Mis. nama tempat atau alamat untuk peta.">
              <Input value={ev.maps_query} onChange={(e) => patch('maps_query', e.target.value)} />
            </Field>
          </div>
          <Field label="Alamat Lengkap" required>
            <Textarea value={ev.address} onChange={(e) => patch('address', e.target.value)} />
          </Field>
        </Card>

        <Card className="space-y-5">
          <h2 className="text-lg font-bold text-slate-900">Pendaftaran</h2>
          <Field label="Tenggat Pendaftaran" hint="Kosongkan untuk tanpa tenggat. Tidak ada batas kuota peserta.">
            <Input
              type="datetime-local"
              value={toLocalInput(ev.registration_deadline)}
              onChange={(e) => patch('registration_deadline', fromLocalInput(e.target.value))}
            />
          </Field>

          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
            <span>
              <span className="block font-semibold text-slate-800">Pendaftaran Dibuka</span>
              <span className="block text-sm text-slate-500">Matikan untuk menutup form publik sementara.</span>
            </span>
            <input
              type="checkbox"
              checked={ev.registration_open}
              onChange={(e) => patch('registration_open', e.target.checked)}
              className="h-6 w-6 rounded text-brand-600 focus:ring-brand-500"
            />
          </label>

          {/* Pendaftaran terbuka hanya bila saklar di atas menyala DAN tenggatnya
              belum lewat. Tanpa ringkasan ini, kombinasi "saklar menyala tapi
              tenggat sudah lewat" terlihat seperti berhasil — panitia mencentang,
              menyimpan, melihat "Tersimpan", lalu situs tetap tertutup tanpa
              satu pun petunjuk kenapa. Dihitung dari nilai yang SEDANG DIEDIT,
              jadi jawabannya muncul sebelum tombol simpan ditekan. */}
          <Alert
            variant={gate.open ? 'success' : 'warning'}
            title={gate.open ? 'Saat ini pendaftaran TERBUKA' : 'Saat ini pendaftaran TERTUTUP'}
          >
            {gate.reason === 'past_deadline' ? (
              <>
                Tenggatnya terlewat pada <strong>{formatDateTime(ev.registration_deadline)}</strong>.
                Selama tenggat masih di masa lalu, mencentang &ldquo;Pendaftaran Dibuka&rdquo;
                <strong> tidak akan membuka apa pun</strong> — majukan dulu tenggatnya, atau
                kosongkan agar tidak ada batas waktu.
              </>
            ) : gate.reason === 'closed_manual' ? (
              <>
                Ditutup lewat saklar di atas. Nyalakan untuk membuka kembali
                {deadlinePassed ? ' — tapi tenggatnya juga perlu dimajukan.' : '.'}
              </>
            ) : ev.registration_deadline ? (
              <>
                Terbuka sampai <strong>{formatDateTime(ev.registration_deadline)}</strong>.
              </>
            ) : (
              <>Terbuka tanpa batas waktu.</>
            )}
          </Alert>
        </Card>

        <Card className="space-y-5">
          <h2 className="text-lg font-bold text-slate-900">Check-in (QR)</h2>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <span>
              <span className="block font-semibold text-slate-800">Fitur QR Check-in Aktif</span>
              <span className="block text-sm text-slate-500">
                Jika dimatikan, kode &amp; QR check-in disembunyikan dari halaman peserta
                (halaman sukses &amp; kelola). Check-in oleh panitia di area admin tetap berfungsi.
              </span>
            </span>
            <input
              type="checkbox"
              checked={ev.qr_checkin_enabled !== false}
              onChange={(e) => patch('qr_checkin_enabled', e.target.checked)}
              className="h-6 w-6 shrink-0 rounded text-brand-600 focus:ring-brand-500"
            />
          </label>
        </Card>

        <Button type="submit" size="lg" loading={saving}>Simpan Pengaturan</Button>
      </form>
    </div>
  );
}
