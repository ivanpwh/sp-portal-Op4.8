import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  cancelRegistrationByToken,
  getEventSettings,
  getSessionByToken,
  shortCode,
  updateSessionByToken,
  type SessionFullUpdate,
} from '../../lib/api';
import type { SessionWithParticipants } from '../../types';
import { ACCOMMODATION_OPTIONS, SP_CODE_HINT } from '../../lib/constants';
import { isValidEmail, isValidSpCode, isValidWhatsApp } from '../../lib/format';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageLoader, Select } from '../../components/ui';
import { DatePicker } from '../../components/DatePicker';
import { RegionPicker } from '../../components/RegionPicker';

interface PRow {
  key: string;
  id?: string;
  full_name: string;
  nickname: string;
  sp_code: string;
  birth_date: string;
  address: string;
  address_detail: string;
  last_occupation: string;
  accommodation: string;
  email: string;
  whatsapp_number: string;
}
type PField = Exclude<keyof PRow, 'key' | 'id'>;
type PErrors = Partial<Record<PField, string>>;

function rowKey(): string {
  return (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
}
function rowsFrom(session: SessionWithParticipants): PRow[] {
  return session.participants.map((p) => ({
    key: p.id,
    id: p.id,
    full_name: p.full_name,
    nickname: p.nickname,
    sp_code: p.sp_code,
    birth_date: p.birth_date,
    address: p.address,
    address_detail: p.address_detail ?? '',
    last_occupation: p.last_occupation,
    accommodation: p.accommodation,
    email: p.email ?? '',
    whatsapp_number: p.whatsapp_number ?? '',
  }));
}
function emptyRow(): PRow {
  return {
    key: rowKey(),
    full_name: '',
    nickname: '',
    sp_code: '',
    birth_date: '',
    address: '',
    address_detail: '',
    last_occupation: '',
    accommodation: '',
    email: '',
    whatsapp_number: '',
  };
}

export default function ManagePage() {
  const { token = '' } = useParams();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [session, setSession] = useState<SessionWithParticipants | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [rows, setRows] = useState<PRow[]>([]);
  const [pErrors, setPErrors] = useState<PErrors[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function hydrate(s: SessionWithParticipants) {
    setSession(s);
    const r = rowsFrom(s);
    setRows(r);
    setPErrors(r.map(() => ({})));
  }

  useEffect(() => {
    Promise.all([getSessionByToken(token), getEventSettings()])
      .then(([s, ev]) => {
        if (s) hydrate(s);
        else setSession(null);
        setQrEnabled(ev.qr_checkin_enabled !== false);
      })
      .finally(() => setLoading(false));
  }, [token]);

  function setRow(idx: number, key: PField, value: string) {
    setRows((list) => list.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
    setPErrors((errs) => errs.map((e, i) => (i === idx ? { ...e, [key]: undefined } : e)));
    setSaved(false);
  }
  function addRow() {
    setRows((list) => [...list, emptyRow()]);
    setPErrors((errs) => [...errs, {}]);
    setSaved(false);
  }
  function removeRow(idx: number) {
    setRows((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== idx)));
    setPErrors((errs) => (errs.length <= 1 ? errs : errs.filter((_, i) => i !== idx)));
    setSaved(false);
  }

  function validate(): boolean {
    let ok = true;
    const pe: PErrors[] = rows.map((p) => {
      const e: PErrors = {};
      if (!p.full_name.trim()) e.full_name = 'Nama lengkap wajib diisi.';
      if (!p.sp_code.trim()) e.sp_code = 'Kode SP wajib diisi.';
      else if (!isValidSpCode(p.sp_code)) e.sp_code = 'Format kode SP tidak valid (mis. SP4.1.3A).';
      if (!p.birth_date.trim()) e.birth_date = 'Tanggal lahir wajib diisi.';
      else if (new Date(p.birth_date) > new Date()) e.birth_date = 'Tanggal lahir tidak boleh di masa depan.';
      if (!p.address.trim()) e.address = 'Pilih kecamatan/kota domisili dari daftar.';
      if (p.email.trim() && !isValidEmail(p.email)) e.email = 'Format email tidak valid.';
      if (p.whatsapp_number.trim() && !isValidWhatsApp(p.whatsapp_number))
        e.whatsapp_number = 'Nomor WhatsApp tidak valid.';
      if (Object.keys(e).length) ok = false;
      return e;
    });
    setPErrors(pe);
    return ok;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) {
      setError('Periksa kembali data peserta yang ditandai.');
      return;
    }
    setSaving(true);
    const patch: SessionFullUpdate = {
      participants: rows.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        nickname: p.nickname,
        sp_code: p.sp_code,
        birth_date: p.birth_date,
        address: p.address,
        address_detail: p.address_detail,
        last_occupation: p.last_occupation,
        accommodation: p.accommodation,
        email: p.email,
        whatsapp_number: p.whatsapp_number,
      })),
    };
    try {
      const updated = await updateSessionByToken(token, patch);
      hydrate(updated);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function doCancel() {
    setCancelling(true);
    try {
      const updated = await cancelRegistrationByToken(token);
      hydrate(updated);
      setConfirmCancel(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <PageLoader />;

  if (!session) {
    return (
      <div className="container-app py-12">
        <Alert variant="error" title="Tautan tidak valid">
          Pendaftaran tidak ditemukan. Periksa kembali tautan kelola Anda.
        </Alert>
        <Link to="/" className="mt-4 inline-block">
          <Button variant="outline">← Beranda</Button>
        </Link>
      </div>
    );
  }

  const cancelled =
    session.participants.length > 0 &&
    session.participants.every((p) => p.attendance_status === 'cancelled');

  return (
    <div className="container-app animate-fade-in-up py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Kelola Pendaftaran</h1>
          {qrEnabled && <p className="mt-1 text-sm text-slate-500">Kode: {shortCode(session)}</p>}
        </div>
        {cancelled ? <Badge color="red">Dibatalkan</Badge> : <Badge color="green">Akan Hadir</Badge>}
      </div>

      {saved && (
        <div className="mb-5">
          <Alert variant="success" title="Perubahan tersimpan">
            Data Anda berhasil diperbarui. Panitia telah diberi tahu.
          </Alert>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {cancelled ? (
        <Card>
          <Alert variant="warning" title="Kehadiran Anda telah dibatalkan">
            Jika ini keliru atau Anda berubah pikiran, silakan daftar ulang atau hubungi panitia.
          </Alert>
          <Link to="/daftar" className="mt-4 inline-block">
            <Button>Daftar Ulang</Button>
          </Link>
        </Card>
      ) : (
        <form onSubmit={save} className="space-y-5">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold text-slate-900">Peserta</h2>
            <span className="text-sm text-slate-500">{rows.length} peserta</span>
          </div>

          {rows.map((p, idx) => {
            const e = pErrors[idx] ?? {};
            return (
              <Card key={p.key} className="space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="inline-flex items-center gap-2 font-bold text-slate-800">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-sm text-brand-700">
                      {idx + 1}
                    </span>
                    Peserta {idx + 1}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      ✕ Hapus
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Nama Lengkap" required error={e.full_name}>
                    <Input value={p.full_name} onChange={(ev) => setRow(idx, 'full_name', ev.target.value)} aria-invalid={!!e.full_name} />
                  </Field>
                  <Field label="Nama Panggilan" hint="Opsional">
                    <Input value={p.nickname} onChange={(ev) => setRow(idx, 'nickname', ev.target.value)} placeholder="Mis. Budi (opsional)" />
                  </Field>
                </div>
                <Field label="Kode SP" required error={e.sp_code} hint={SP_CODE_HINT}>
                  <Input
                    value={p.sp_code}
                    onChange={(ev) => setRow(idx, 'sp_code', ev.target.value)}
                    aria-invalid={!!e.sp_code}
                    className="font-mono uppercase"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Tanggal Lahir" required error={e.birth_date}>
                    <DatePicker value={p.birth_date} onChange={(v) => setRow(idx, 'birth_date', v)} max={todayStr} ariaInvalid={!!e.birth_date} />
                  </Field>
                  <Field label="Provinsi/Kota/Kecamatan Domisili" required error={e.address} hint="Ketik untuk mencari kecamatan domisili.">
                    <RegionPicker value={p.address} onChange={(v) => setRow(idx, 'address', v)} ariaInvalid={!!e.address} idPrefix={`reg-${p.key}`} />
                  </Field>
                </div>
                <Field label="Alamat Lengkap Domisili" hint="Opsional — nama jalan, RT/RW, nomor rumah, dll.">
                  <Input value={p.address_detail} onChange={(ev) => setRow(idx, 'address_detail', ev.target.value)} placeholder="Mis. Jl. Mawar No. 5, RT 02/RW 03 (opsional)" />
                </Field>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Pekerjaan Terakhir" hint="Opsional">
                    <Input value={p.last_occupation} onChange={(ev) => setRow(idx, 'last_occupation', ev.target.value)} />
                  </Field>
                  <Field label="Rencana Lokasi Menginap" hint="Opsional">
                    <Select value={p.accommodation} onChange={(ev) => setRow(idx, 'accommodation', ev.target.value)}>
                      <option value="">— Pilih (opsional) —</option>
                      {ACCOMMODATION_OPTIONS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Email" error={e.email} hint="Opsional">
                    <Input type="email" value={p.email} onChange={(ev) => setRow(idx, 'email', ev.target.value)} aria-invalid={!!e.email} />
                  </Field>
                  <Field label="No. WhatsApp / HP" error={e.whatsapp_number} hint="Opsional">
                    <Input type="tel" inputMode="numeric" value={p.whatsapp_number} onChange={(ev) => setRow(idx, 'whatsapp_number', ev.target.value)} aria-invalid={!!e.whatsapp_number} />
                  </Field>
                </div>
              </Card>
            );
          })}

          <Button type="button" variant="outline" fullWidth onClick={addRow}>
            + Tambah Peserta
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" loading={saving} fullWidth>
              Simpan Perubahan
            </Button>
            <Button type="button" variant="danger" onClick={() => setConfirmCancel(true)} fullWidth>
              Batalkan Seluruh Kehadiran
            </Button>
          </div>
        </form>
      )}

      <div className="mt-6 text-center">
        <Link to="/" className="text-sm font-semibold text-slate-500 hover:text-brand-700">
          ← Kembali ke Beranda
        </Link>
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Batalkan Kehadiran?">
        <p className="text-slate-600">
          Anda yakin ingin membatalkan kehadiran <strong>seluruh peserta</strong> dalam pendaftaran ini?
          Status akan diubah menjadi <strong>dibatalkan</strong> dan panitia akan diberi tahu. Anda tetap
          bisa mendaftar ulang nanti.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" fullWidth onClick={() => setConfirmCancel(false)}>
            Tidak
          </Button>
          <Button variant="danger" fullWidth loading={cancelling} onClick={doCancel}>
            Ya, Batalkan
          </Button>
        </div>
      </Modal>
    </div>
  );
}
