import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  addParticipant,
  checkInParticipant,
  deleteParticipant,
  deleteSession,
  getSessionById,
  setParticipantStatus,
  shortCode,
  updateParticipant,
} from '../../lib/api';
import type { Participant, ParticipantInput, SessionWithParticipants } from '../../types';
import { ACCOMMODATION_OPTIONS, SP_CODE_HINT } from '../../lib/constants';
import {
  calculateAge,
  formatBirthDate,
  formatDateTime,
  isValidEmail,
  isValidSpCode,
  isValidWhatsApp,
  spInduk,
} from '../../lib/format';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageLoader, Select } from '../../components/ui';
import { DatePicker } from '../../components/DatePicker';
import { RegionPicker } from '../../components/RegionPicker';

type PErrors = Partial<Record<keyof ParticipantInput, string>>;
function emptyPForm(): ParticipantInput {
  return {
    full_name: '',
    sp_code: '',
    birth_date: '',
    address: '',
    last_occupation: '',
    accommodation: '',
    email: '',
    whatsapp_number: '',
  };
}

export default function SessionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [session, setSession] = useState<SessionWithParticipants | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [busyPid, setBusyPid] = useState<string | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [confirmDeletePart, setConfirmDeletePart] = useState<Participant | null>(null);

  // Participant editor modal
  const [pOpen, setPOpen] = useState(false);
  const [pEditing, setPEditing] = useState<Participant | null>(null);
  const [pForm, setPForm] = useState<ParticipantInput>(emptyPForm());
  const [pErrors, setPErrors] = useState<PErrors>({});
  const [pSaving, setPSaving] = useState(false);

  function load() {
    return getSessionById(id).then((s) => setSession(s));
  }
  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function rowAction(pid: string, fn: () => Promise<unknown>) {
    setBusyPid(pid);
    try {
      await fn();
      await load();
    } finally {
      setBusyPid(null);
    }
  }

  function openAdd() {
    setPEditing(null);
    setPForm(emptyPForm());
    setPErrors({});
    setPOpen(true);
  }
  function openEdit(p: Participant) {
    setPEditing(p);
    setPForm({
      full_name: p.full_name,
      sp_code: p.sp_code,
      birth_date: p.birth_date,
      address: p.address,
      last_occupation: p.last_occupation,
      accommodation: p.accommodation,
      email: p.email ?? '',
      whatsapp_number: p.whatsapp_number ?? '',
    });
    setPErrors({});
    setPOpen(true);
  }
  function validateP(): boolean {
    const e: PErrors = {};
    if (!pForm.full_name.trim()) e.full_name = 'Wajib diisi.';
    if (!pForm.sp_code.trim()) e.sp_code = 'Wajib diisi.';
    else if (!isValidSpCode(pForm.sp_code)) e.sp_code = 'Format tidak valid (mis. SP4.1.3A).';
    if (!pForm.birth_date.trim()) e.birth_date = 'Wajib diisi.';
    else if (new Date(pForm.birth_date) > new Date()) e.birth_date = 'Tanggal lahir tidak boleh di masa depan.';
    if (!pForm.address.trim()) e.address = 'Pilih kecamatan/kota domisili dari daftar.';
    // last_occupation & accommodation optional
    if (pForm.email && pForm.email.trim() && !isValidEmail(pForm.email)) e.email = 'Email tidak valid.';
    if (pForm.whatsapp_number && pForm.whatsapp_number.trim() && !isValidWhatsApp(pForm.whatsapp_number))
      e.whatsapp_number = 'WhatsApp tidak valid.';
    setPErrors(e);
    return Object.keys(e).length === 0;
  }
  async function saveParticipant() {
    if (!validateP()) return;
    setPSaving(true);
    try {
      if (pEditing) {
        await updateParticipant(pEditing.id, {
          full_name: pForm.full_name.trim(),
          sp_code: pForm.sp_code,
          birth_date: pForm.birth_date.trim(),
          address: pForm.address.trim(),
          last_occupation: pForm.last_occupation?.trim() ?? '',
          accommodation: pForm.accommodation?.trim() ?? '',
          email: pForm.email?.trim().toLowerCase() || null,
          whatsapp_number: pForm.whatsapp_number?.trim() || null,
        });
        setMsg('Peserta diperbarui.');
      } else {
        await addParticipant(id, pForm);
        setMsg('Peserta ditambahkan.');
      }
      await load();
      setPOpen(false);
    } finally {
      setPSaving(false);
    }
  }

  async function removeSession() {
    await deleteSession(id);
    navigate('/admin');
  }

  if (loading) return <PageLoader />;
  if (!session) {
    return (
      <Card>
        <Alert variant="error" title="Tidak ditemukan">Sesi pendaftaran tidak ditemukan.</Alert>
        <Link to="/admin" className="mt-4 inline-block">
          <Button variant="outline">← Dashboard</Button>
        </Link>
      </Card>
    );
  }

  const attending = session.participants.filter((p) => p.attendance_status === 'will_attend').length;
  const checkedIn = session.participants.filter((p) => p.is_checked_in).length;
  const allCancelled = session.participants.length > 0 && attending === 0;
  const title = session.participants[0]?.full_name ?? 'Sesi Pendaftaran';

  return (
    <div className="space-y-5">
      <Link to="/admin" className="text-sm font-semibold text-slate-500 hover:text-brand-700">
        ← Kembali ke Dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {allCancelled ? <Badge color="red">Dibatalkan</Badge> : <Badge color="green">Akan Hadir</Badge>}
            {checkedIn > 0 && <Badge color="blue">Check-in {checkedIn}/{session.participants.length}</Badge>}
            <Badge>{shortCode(session)}</Badge>
          </div>
        </div>
      </div>

      {msg && <Alert variant="success">{msg}</Alert>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Info sesi (read-only) */}
          <Card>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Info Sesi</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Row label="Jumlah Peserta" value={`${session.participants.length} orang`} />
              <Row label="Akan Hadir" value={`${attending} orang`} />
              <Row label="Terdaftar" value={formatDateTime(session.registered_at)} />
              <Row label="Terakhir Diubah" value={session.updated_at ? formatDateTime(session.updated_at) : '-'} />
            </dl>
          </Card>

          {/* Peserta */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Peserta ({session.participants.length})</h2>
              <Button size="sm" onClick={openAdd}>+ Tambah Peserta</Button>
            </div>

            <div className="space-y-3">
              {session.participants.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-800">{p.full_name}</p>
                        <Badge color="green">{p.sp_code}</Badge>
                        <Badge>{spInduk(p.sp_code)}</Badge>
                        {p.attendance_status === 'cancelled' && <Badge color="red">Batal</Badge>}
                        {p.is_checked_in && <Badge color="blue">Check-in</Badge>}
                      </div>
                      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        <Row label="Tanggal Lahir" value={formatBirthDate(p.birth_date)} />
                        <Row label="Umur" value={calculateAge(p.birth_date) != null ? `${calculateAge(p.birth_date)} tahun` : '-'} />
                        <Row label="Alamat" value={p.address} />
                        <Row label="Pekerjaan" value={p.last_occupation || '-'} />
                        <Row label="Menginap" value={p.accommodation || '-'} />
                        <Row label="Email" value={p.email || '-'} />
                        <Row label="WA / HP" value={p.whatsapp_number || '-'} />
                      </dl>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={p.is_checked_in ? 'outline' : 'primary'}
                      loading={busyPid === p.id}
                      onClick={() => rowAction(p.id, () => checkInParticipant(p.id, !p.is_checked_in))}
                    >
                      {p.is_checked_in ? 'Batalkan Check-in' : '✓ Check-in'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      ✎ Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busyPid === p.id}
                      onClick={() =>
                        rowAction(p.id, () =>
                          setParticipantStatus(p.id, p.attendance_status === 'cancelled' ? 'will_attend' : 'cancelled'),
                        )
                      }
                    >
                      {p.attendance_status === 'cancelled' ? 'Aktifkan' : 'Tandai Batal'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmDeletePart(p)}>
                      🗑 Hapus
                    </Button>
                  </div>
                </div>
              ))}
              {session.participants.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">Belum ada peserta dalam sesi ini.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card className="text-center">
            <p className="text-sm font-semibold text-slate-500">Kode Check-in Sesi</p>
            <p className="mt-1 text-xl font-extrabold text-brand-700">{shortCode(session)}</p>
            <div className="mt-3 inline-block rounded-xl border border-slate-200 p-3">
              <QRCodeSVG value={shortCode(session)} size={140} level="M" />
            </div>
            <p className="mt-2 text-xs text-slate-400">{attending} akan hadir · {checkedIn} sudah check-in</p>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Tindakan Sesi</h2>
            <Button fullWidth variant="danger" onClick={() => setConfirmDeleteSession(true)}>
              🗑 Hapus Seluruh Sesi
            </Button>
            <p className="text-xs text-slate-400">Menghapus sesi akan menghapus seluruh peserta di dalamnya.</p>
          </Card>
        </div>
      </div>

      {/* Participant editor */}
      <Modal open={pOpen} onClose={() => setPOpen(false)} title={pEditing ? 'Edit Peserta' : 'Tambah Peserta'}>
        <div className="space-y-4">
          <Field label="Nama Lengkap" required error={pErrors.full_name}>
            <Input value={pForm.full_name} onChange={(e) => setPForm({ ...pForm, full_name: e.target.value })} aria-invalid={!!pErrors.full_name} />
          </Field>
          <Field label="Kode SP" required error={pErrors.sp_code} hint={SP_CODE_HINT}>
            <Input value={pForm.sp_code} onChange={(e) => setPForm({ ...pForm, sp_code: e.target.value })} aria-invalid={!!pErrors.sp_code} className="font-mono uppercase" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tanggal Lahir" required error={pErrors.birth_date}>
              <DatePicker value={pForm.birth_date} onChange={(v) => setPForm({ ...pForm, birth_date: v })} max={todayStr} ariaInvalid={!!pErrors.birth_date} />
            </Field>
            <Field label="Alamat Domisili" required error={pErrors.address}>
              <RegionPicker value={pForm.address} onChange={(v) => setPForm({ ...pForm, address: v })} ariaInvalid={!!pErrors.address} idPrefix="reg-detail" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Pekerjaan Terakhir" hint="Opsional">
              <Input value={pForm.last_occupation ?? ''} onChange={(e) => setPForm({ ...pForm, last_occupation: e.target.value })} />
            </Field>
            <Field label="Rencana Menginap" hint="Opsional">
              <Select value={pForm.accommodation ?? ''} onChange={(e) => setPForm({ ...pForm, accommodation: e.target.value })}>
                <option value="">— Pilih (opsional) —</option>
                {ACCOMMODATION_OPTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" error={pErrors.email} hint="Opsional">
              <Input type="email" value={pForm.email ?? ''} onChange={(e) => setPForm({ ...pForm, email: e.target.value })} aria-invalid={!!pErrors.email} />
            </Field>
            <Field label="No. WhatsApp / HP" error={pErrors.whatsapp_number} hint="Opsional">
              <Input type="tel" inputMode="numeric" value={pForm.whatsapp_number ?? ''} onChange={(e) => setPForm({ ...pForm, whatsapp_number: e.target.value })} aria-invalid={!!pErrors.whatsapp_number} />
            </Field>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setPOpen(false)}>Batal</Button>
            <Button fullWidth loading={pSaving} onClick={saveParticipant}>Simpan</Button>
          </div>
        </div>
      </Modal>

      {/* Delete participant */}
      <Modal open={!!confirmDeletePart} onClose={() => setConfirmDeletePart(null)} title="Hapus Peserta?">
        <p className="text-slate-600">
          Hapus <strong>{confirmDeletePart?.full_name}</strong> ({confirmDeletePart?.sp_code}) dari sesi ini?
          Tindakan ini tidak dapat dibatalkan.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" fullWidth onClick={() => setConfirmDeletePart(null)}>Batal</Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              const p = confirmDeletePart!;
              setConfirmDeletePart(null);
              rowAction(p.id, () => deleteParticipant(p.id));
            }}
          >
            Ya, Hapus
          </Button>
        </div>
      </Modal>

      {/* Delete session */}
      <Modal open={confirmDeleteSession} onClose={() => setConfirmDeleteSession(false)} title="Hapus Seluruh Sesi?">
        <p className="text-slate-600">
          Hapus permanen sesi pendaftaran ini beserta <strong>{session.participants.length} peserta</strong>?
          Tindakan ini tidak dapat dibatalkan.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" fullWidth onClick={() => setConfirmDeleteSession(false)}>Batal</Button>
          <Button variant="danger" fullWidth onClick={removeSession}>Ya, Hapus</Button>
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
