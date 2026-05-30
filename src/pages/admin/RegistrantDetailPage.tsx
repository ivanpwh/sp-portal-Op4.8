import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  adminUpdateRegistrant,
  checkIn,
  deleteRegistrant,
  getRegistrant,
  shortCode,
} from '../../lib/api';
import type { Registrant } from '../../types';
import { ACCOMMODATION_OPTIONS, FAMILY_BRANCHES } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageLoader, Select, Textarea } from '../../components/ui';

export default function RegistrantDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [r, setR] = useState<Registrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Registrant>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getRegistrant(id)
      .then((data) => {
        setR(data);
        if (data) setForm(data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageLoader />;
  if (!r) {
    return (
      <Card>
        <Alert variant="error" title="Tidak ditemukan">Pendaftar tidak ditemukan.</Alert>
        <Link to="/admin" className="mt-4 inline-block">
          <Button variant="outline">← Dashboard</Button>
        </Link>
      </Card>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await adminUpdateRegistrant(id, form);
      setR(updated);
      setEditing(false);
      setMsg('Perubahan tersimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCheckIn() {
    setBusy(true);
    try {
      const updated = await checkIn(id, !r!.is_checked_in);
      setR(updated);
      setForm(updated);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCancel() {
    setBusy(true);
    try {
      const updated = await adminUpdateRegistrant(id, {
        attendance_status: r!.attendance_status === 'cancelled' ? 'will_attend' : 'cancelled',
      });
      setR(updated);
      setForm(updated);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    await deleteRegistrant(id);
    navigate('/admin');
  }

  return (
    <div className="space-y-5">
      <Link to="/admin" className="text-sm font-semibold text-slate-500 hover:text-brand-700">
        ← Kembali ke Dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{r.full_name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {r.attendance_status === 'cancelled' ? <Badge color="red">Dibatalkan</Badge> : <Badge color="green">Akan Hadir</Badge>}
            {r.is_checked_in && <Badge color="blue">Sudah Check-in</Badge>}
            <Badge>{shortCode(r)}</Badge>
          </div>
        </div>
      </div>

      {msg && <Alert variant="success">{msg}</Alert>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Details / edit */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Data Pendaftar</h2>
              {!editing && (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  ✎ Koreksi Data
                </Button>
              )}
            </div>

            {editing ? (
              <div className="space-y-4">
                <Field label="Nama Lengkap"><Input value={form.full_name ?? ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
                <Field label="Tempat, Tanggal Lahir"><Input value={form.birth_place_date ?? ''} onChange={(e) => setForm({ ...form, birth_place_date: e.target.value })} /></Field>
                <Field label="Nomor WhatsApp"><Input value={form.whatsapp_number ?? ''} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} /></Field>
                <Field label="Email"><Input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                <Field label="Pekerjaan Terakhir"><Input value={form.last_occupation ?? ''} onChange={(e) => setForm({ ...form, last_occupation: e.target.value })} /></Field>
                <Field label="Trah / Cabang Keluarga">
                  <Select value={form.family_branch ?? ''} onChange={(e) => setForm({ ...form, family_branch: e.target.value })}>
                    {FAMILY_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </Select>
                </Field>
                <Field label="Jumlah Rombongan"><Input type="number" min={1} value={form.group_size ?? 1} onChange={(e) => setForm({ ...form, group_size: Number(e.target.value) })} /></Field>
                <Field label="Detail Rombongan"><Textarea value={form.group_details ?? ''} onChange={(e) => setForm({ ...form, group_details: e.target.value })} /></Field>
                <Field label="Rencana Lokasi Menginap">
                  <Select value={form.accommodation ?? ''} onChange={(e) => setForm({ ...form, accommodation: e.target.value })}>
                    {ACCOMMODATION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </Select>
                </Field>
                <Field label="Kode SP"><Input value={form.sp_code ?? ''} onChange={(e) => setForm({ ...form, sp_code: e.target.value })} /></Field>
                <div className="flex gap-3">
                  <Button onClick={save} loading={saving}>Simpan</Button>
                  <Button variant="outline" onClick={() => { setEditing(false); setForm(r); }}>Batal</Button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Row label="Tempat, Tanggal Lahir" value={r.birth_place_date} />
                <Row label="WhatsApp" value={r.whatsapp_number} />
                <Row label="Email" value={r.email} />
                <Row label="Pekerjaan Terakhir" value={r.last_occupation} />
                <Row label="Trah / Cabang" value={r.family_branch} />
                <Row label="Jumlah Rombongan" value={`${r.group_size} orang`} />
                <Row label="Detail Rombongan" value={r.group_details} />
                <Row label="Menginap" value={r.accommodation} />
                <Row label="Kode SP" value={r.sp_code || '-'} />
                <Row label="Persetujuan Privasi" value={r.privacy_consent ? 'Ya' : 'Tidak'} />
                <Row label="Terdaftar" value={formatDateTime(r.registered_at)} />
                <Row label="Terakhir Diubah" value={r.updated_at ? formatDateTime(r.updated_at) : '-'} />
              </dl>
            )}
          </Card>
        </div>

        {/* Actions sidebar */}
        <div className="space-y-5">
          <Card className="text-center">
            <p className="text-sm font-semibold text-slate-500">Kode Check-in</p>
            <p className="mt-1 text-xl font-extrabold text-brand-700">{shortCode(r)}</p>
            <div className="mt-3 inline-block rounded-xl border border-slate-200 p-3">
              <QRCodeSVG value={shortCode(r)} size={140} level="M" />
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Tindakan</h2>
            <Button
              fullWidth
              variant={r.is_checked_in ? 'outline' : 'primary'}
              loading={busy}
              onClick={toggleCheckIn}
            >
              {r.is_checked_in ? 'Batalkan Check-in' : '✓ Tandai Hadir (Check-in)'}
            </Button>
            {r.checked_in_at && (
              <p className="text-center text-xs text-slate-400">Check-in: {formatDateTime(r.checked_in_at)}</p>
            )}
            <Button fullWidth variant="outline" loading={busy} onClick={toggleCancel}>
              {r.attendance_status === 'cancelled' ? 'Aktifkan Kembali' : 'Tandai Dibatalkan'}
            </Button>
            <Button fullWidth variant="danger" onClick={() => setConfirmDelete(true)}>
              🗑 Hapus Pendaftar
            </Button>
          </Card>
        </div>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Hapus Pendaftar?">
        <p className="text-slate-600">
          Hapus permanen <strong>{r.full_name}</strong>? Gunakan untuk spam/duplikat. Tindakan ini tidak dapat dibatalkan.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" fullWidth onClick={() => setConfirmDelete(false)}>Batal</Button>
          <Button variant="danger" fullWidth onClick={remove}>Ya, Hapus</Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
