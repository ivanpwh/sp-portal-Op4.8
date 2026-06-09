import { useEffect, useState } from 'react';
import { broadcastReminder, listSpInduk, type BroadcastResult } from '../../lib/api';
import type { NotificationChannel } from '../../types';
import { Alert, Button, Card, Field, PageLoader, Select, Textarea } from '../../components/ui';

const TEMPLATES: Record<string, string> = {
  'H-7': 'Halo keluarga besar SP! 👋 Acara reuni tinggal 7 hari lagi. Mohon pastikan kehadiran Anda. Sampai jumpa!',
  'H-1': 'Pengingat: Reuni keluarga Soero Pramono BESOK! Jangan lupa bawa kode check-in Anda. 🎉',
  'Hari-H': 'Selamat datang! Acara reuni dimulai hari ini. Tunjukkan QR/kode check-in Anda di meja panitia. 🙏',
};

export default function BroadcastPage() {
  const [induk, setInduk] = useState('all');
  const [indukOptions, setIndukOptions] = useState<string[]>([]);
  const [onlyAttending, setOnlyAttending] = useState(true);
  const [channels, setChannels] = useState<NotificationChannel[]>(['whatsapp', 'email']);
  const [message, setMessage] = useState(TEMPLATES['H-7']);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  useEffect(() => {
    listSpInduk().then(setIndukOptions);
  }, []);

  function toggleChannel(ch: NotificationChannel) {
    setChannels((c) => (c.includes(ch) ? c.filter((x) => x !== ch) : [...c, ch]));
  }

  async function send() {
    if (channels.length === 0 || !message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await broadcastReminder({ induk, onlyAttending, channels });
      setResult(res);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Broadcast Pengingat Massal</h1>
        <p className="text-sm text-slate-500">Kirim pengingat ke peserta via WhatsApp/Email (H-7, H-1, Hari-H).</p>
      </div>

      <Card className="space-y-5">
        <Field label="Segmen Penerima" hint="Pilih kelompok SP Induk tertentu atau semua.">
          <Select value={induk} onChange={(e) => setInduk(e.target.value)}>
            <option value="all">Semua SP Induk</option>
            {indukOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </Field>

        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyAttending}
            onChange={(e) => setOnlyAttending(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Hanya kirim ke peserta yang akan hadir (kecualikan yang batal)
        </label>

        <div>
          <span className="field-label">Saluran Pengiriman</span>
          <div className="flex gap-3">
            {(['whatsapp', 'email'] as NotificationChannel[]).map((ch) => (
              <label key={ch} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={channels.includes(ch)}
                  onChange={() => toggleChannel(ch)}
                  className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                />
                {ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
              </label>
            ))}
          </div>
        </div>

        <Field label="Pesan" hint="Pilih templat cepat atau tulis sendiri.">
          <div className="mb-2 flex flex-wrap gap-2">
            {Object.keys(TEMPLATES).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setMessage(TEMPLATES[k])}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {k}
              </button>
            ))}
          </div>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[120px]" />
        </Field>

        <Button onClick={send} loading={sending} size="lg" disabled={channels.length === 0 || !message.trim()}>
          Kirim Pengingat
        </Button>
      </Card>

      {sending && <PageLoader label="Mengirim pengingat…" />}

      {result && (
        <Alert variant={result.failed > 0 ? 'warning' : 'success'} title="Rekap Pengiriman">
          <p>
            Total target: <strong>{result.total}</strong> sesi · Berhasil: <strong>{result.sent}</strong> ·
            Gagal: <strong>{result.failed}</strong>
          </p>
          {result.failed > 0 && (
            <p className="mt-1 text-sm">
              Pengiriman yang gagal tercatat di Log Notifikasi dan dapat dicoba ulang (retry).
            </p>
          )}
        </Alert>
      )}
    </div>
  );
}
