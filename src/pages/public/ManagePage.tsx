import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  cancelRegistrationByToken,
  getRegistrantByToken,
  shortCode,
  updateRegistrationByToken,
} from '../../lib/api';
import type { Registrant, RegistrationInput } from '../../types';
import { ACCOMMODATION_OPTIONS, FAMILY_BRANCHES } from '../../lib/constants';
import { isValidEmail, isValidWhatsApp } from '../../lib/format';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageLoader, Select, Textarea } from '../../components/ui';

export default function ManagePage() {
  const { token = '' } = useParams();
  const [registrant, setRegistrant] = useState<Registrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<RegistrationInput>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    getRegistrantByToken(token)
      .then((r) => {
        setRegistrant(r);
        if (r) {
          setForm({
            full_name: r.full_name,
            birth_place_date: r.birth_place_date,
            whatsapp_number: r.whatsapp_number,
            email: r.email,
            last_occupation: r.last_occupation,
            family_branch: r.family_branch,
            group_size: r.group_size,
            group_details: r.group_details,
            accommodation: r.accommodation,
            sp_code: r.sp_code ?? '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  function set<K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.whatsapp_number && !isValidWhatsApp(form.whatsapp_number)) {
      setError('Nomor WhatsApp tidak valid.');
      return;
    }
    if (form.email && !isValidEmail(form.email)) {
      setError('Format email tidak valid.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateRegistrationByToken(token, form);
      setRegistrant(updated);
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
      setRegistrant(updated);
      setConfirmCancel(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <PageLoader />;

  if (!registrant) {
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

  const cancelled = registrant.attendance_status === 'cancelled';

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Kelola Pendaftaran</h1>
          <p className="mt-1 text-sm text-slate-500">Kode: {shortCode(registrant)}</p>
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
          <Card className="space-y-5">
            <Field label="Nama Lengkap" required>
              <Input value={form.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} />
            </Field>
            <Field label="Tempat, Tanggal Lahir" required>
              <Input value={form.birth_place_date ?? ''} onChange={(e) => set('birth_place_date', e.target.value)} />
            </Field>
            <Field label="Nomor WhatsApp" required>
              <Input type="tel" inputMode="numeric" value={form.whatsapp_number ?? ''} onChange={(e) => set('whatsapp_number', e.target.value)} />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Pekerjaan Terakhir" required>
              <Input value={form.last_occupation ?? ''} onChange={(e) => set('last_occupation', e.target.value)} />
            </Field>
          </Card>

          <Card className="space-y-5">
            <Field label="Trah / Cabang Keluarga" required>
              <Select value={form.family_branch ?? ''} onChange={(e) => set('family_branch', e.target.value)}>
                {FAMILY_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <Field label="Jumlah Rombongan" required>
              <Input type="number" min={1} value={form.group_size ?? 1} onChange={(e) => set('group_size', Number(e.target.value))} />
            </Field>
            <Field label="Detail Rombongan" required>
              <Textarea value={form.group_details ?? ''} onChange={(e) => set('group_details', e.target.value)} />
            </Field>
            <Field label="Rencana Lokasi Menginap" required>
              <Select value={form.accommodation ?? ''} onChange={(e) => set('accommodation', e.target.value)}>
                {ACCOMMODATION_OPTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </Field>
            <Field label="Kode SP">
              <Input value={form.sp_code ?? ''} onChange={(e) => set('sp_code', e.target.value)} placeholder="Opsional" />
            </Field>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" loading={saving} fullWidth>
              Simpan Perubahan
            </Button>
            <Button type="button" variant="danger" onClick={() => setConfirmCancel(true)} fullWidth>
              Batalkan Kehadiran
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
          Anda yakin ingin membatalkan kehadiran? Status akan diubah menjadi <strong>dibatalkan</strong> dan
          panitia akan diberi tahu. Anda tetap bisa mendaftar ulang nanti.
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
