import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getEventSettings,
  getRegistrationStatus,
  RegistrationClosedError,
  submitRegistration,
} from '../../lib/api';
import type { EventSettings, RegistrationInput, RegistrationStatus } from '../../types';
import { ACCOMMODATION_OPTIONS, SP_CODE_EXAMPLES, SP_CODE_HINT } from '../../lib/constants';
import { isValidEmail, isValidSpCode, isValidWhatsApp, normalizeSpCode } from '../../lib/format';
import { Alert, Button, Card, Field, Input, PageLoader, Select } from '../../components/ui';
import { DatePicker } from '../../components/DatePicker';
import { RegionPicker } from '../../components/RegionPicker';

interface PRow {
  key: string;
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
type PField = Exclude<keyof PRow, 'key'>;
type PErrors = Partial<Record<PField, string>>;

function rowKey(): string {
  return (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
}
function emptyParticipant(): PRow {
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [event, setEvent] = useState<EventSettings | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [participants, setParticipants] = useState<PRow[]>([emptyParticipant()]);
  const [pErrors, setPErrors] = useState<PErrors[]>([{}]);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [website, setWebsite] = useState(''); // honeypot

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getEventSettings(), getRegistrationStatus()])
      .then(([e, s]) => {
        setEvent(e);
        setStatus(s);
      })
      .finally(() => setLoading(false));
  }, []);

  function setParticipant(idx: number, key: PField, value: string) {
    setParticipants((list) => list.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
    setPErrors((errs) => errs.map((e, i) => (i === idx ? { ...e, [key]: undefined } : e)));
  }
  function addParticipantRow() {
    setParticipants((list) => [...list, emptyParticipant()]);
    setPErrors((errs) => [...errs, {}]);
  }
  function removeParticipantRow(idx: number) {
    setParticipants((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== idx)));
    setPErrors((errs) => (errs.length <= 1 ? errs : errs.filter((_, i) => i !== idx)));
  }

  function validate(): boolean {
    const pe: PErrors[] = participants.map((p) => {
      const e: PErrors = {};
      if (!p.full_name.trim()) e.full_name = 'Nama lengkap wajib diisi.';
      if (!p.sp_code.trim()) e.sp_code = 'Kode SP wajib diisi.';
      else if (!isValidSpCode(p.sp_code)) e.sp_code = 'Format kode SP tidak valid (mis. SP4.1.3A).';
      if (!p.birth_date.trim()) e.birth_date = 'Tanggal lahir wajib diisi.';
      else if (new Date(p.birth_date) > new Date()) e.birth_date = 'Tanggal lahir tidak boleh di masa depan.';
      if (!p.address.trim()) e.address = 'Pilih kecamatan/kota domisili dari daftar.';
      // last_occupation & accommodation are OPTIONAL in v3.1.
      if (p.email.trim() && !isValidEmail(p.email)) e.email = 'Format email tidak valid.';
      if (p.whatsapp_number.trim() && !isValidWhatsApp(p.whatsapp_number))
        e.whatsapp_number = 'Nomor WhatsApp tidak valid.';
      return e;
    });
    const consentErr = consent ? null : 'Anda harus menyetujui penggunaan data.';
    setPErrors(pe);
    setConsentError(consentErr);
    return pe.every((e) => Object.keys(e).length === 0) && !consentErr;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (!validate()) {
      setTimeout(
        () =>
          document
            .querySelector('[aria-invalid="true"]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        0,
      );
      return;
    }
    setSubmitting(true);
    const input: RegistrationInput = {
      privacy_consent: consent,
      website,
      participants: participants.map((p) => ({
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
      const session = await submitRegistration(input);
      navigate(`/sukses/${session.manage_token}`);
    } catch (err) {
      if (err instanceof RegistrationClosedError) setServerError(err.message);
      else setServerError((err as Error).message || 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !status) return <PageLoader />;

  if (!status.open) {
    return (
      <div className="container-app py-12">
        <Card>
          <h1 className="text-2xl font-bold text-slate-900">Pendaftaran Ditutup</h1>
          <p className="mt-2 text-slate-600">{status.message}</p>
          <Link to="/" className="mt-6 inline-block">
            <Button variant="outline">← Kembali ke Beranda</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Formulir Pendaftaran</h1>
        <p className="mt-1 text-slate-600">
          {event?.event_name}. Masukkan data peserta — bisa satu atau beberapa orang sekaligus. Kolom
          bertanda <span className="text-red-600">*</span> wajib diisi.
        </p>
      </div>

      {serverError && (
        <div className="mb-5">
          <Alert variant="error" title="Gagal mendaftar">{serverError}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {/* Daftar Peserta */}
        <div>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-lg font-bold text-slate-900">Daftar Peserta</h2>
            <span className="text-sm text-slate-500">{participants.length} peserta</span>
          </div>
          <Alert variant="info" title="Tentang Kode SP">
            <p>{SP_CODE_HINT}</p>
            <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              {SP_CODE_EXAMPLES.map((ex) => (
                <li key={ex.code} className="text-xs">
                  <span className="font-mono font-bold text-brand-800">{ex.code}</span> — {ex.meaning}
                </li>
              ))}
            </ul>
          </Alert>
        </div>

        <div className="space-y-5">
          {participants.map((p, idx) => {
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
                  {participants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeParticipantRow(idx)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                      aria-label={`Hapus peserta ${idx + 1}`}
                    >
                      ✕ Hapus
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Nama Lengkap" required error={e.full_name}>
                    <Input
                      value={p.full_name}
                      onChange={(ev) => setParticipant(idx, 'full_name', ev.target.value)}
                      placeholder="Nama lengkap peserta"
                      aria-invalid={!!e.full_name}
                    />
                  </Field>
                  <Field label="Nama Panggilan" hint="Opsional">
                    <Input
                      value={p.nickname}
                      onChange={(ev) => setParticipant(idx, 'nickname', ev.target.value)}
                      placeholder="Mis. Budi, Yuli (opsional)"
                    />
                  </Field>
                </div>

                <Field
                  label="Kode SP"
                  required
                  error={e.sp_code}
                  hint={
                    p.sp_code && isValidSpCode(p.sp_code)
                      ? `Akan disimpan sebagai: ${normalizeSpCode(p.sp_code)}`
                      : 'Contoh: SP4, SP4A, SP4.1.3'
                  }
                >
                  <Input
                    value={p.sp_code}
                    onChange={(ev) => setParticipant(idx, 'sp_code', ev.target.value)}
                    placeholder="SP4.1.3"
                    aria-invalid={!!e.sp_code}
                    className="font-mono uppercase"
                  />
                </Field>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Tanggal Lahir" required error={e.birth_date} hint="Umur dihitung otomatis oleh panitia.">
                    <DatePicker
                      value={p.birth_date}
                      onChange={(v) => setParticipant(idx, 'birth_date', v)}
                      max={todayStr}
                      ariaInvalid={!!e.birth_date}
                    />
                  </Field>

                  <Field label="Provinsi/Kota/Kecamatan Domisili" required error={e.address} hint="Ketik untuk mencari kecamatan domisili.">
                    <RegionPicker
                      value={p.address}
                      onChange={(v) => setParticipant(idx, 'address', v)}
                      ariaInvalid={!!e.address}
                      idPrefix={`reg-${p.key}`}
                    />
                  </Field>
                </div>

                <Field label="Alamat Lengkap Domisili" hint="Opsional — nama jalan, RT/RW, nomor rumah, dll.">
                  <Input
                    value={p.address_detail}
                    onChange={(ev) => setParticipant(idx, 'address_detail', ev.target.value)}
                    placeholder="Mis. Jl. Mawar No. 5, RT 02/RW 03 (opsional)"
                  />
                </Field>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Pekerjaan Terakhir" hint="Opsional">
                    <Input
                      value={p.last_occupation}
                      onChange={(ev) => setParticipant(idx, 'last_occupation', ev.target.value)}
                      placeholder="Mis. Guru, Wiraswasta (opsional)"
                    />
                  </Field>

                  <Field label="Rencana Lokasi Menginap" hint="Opsional">
                    <Select
                      value={p.accommodation}
                      onChange={(ev) => setParticipant(idx, 'accommodation', ev.target.value)}
                    >
                      <option value="">— Pilih (opsional) —</option>
                      {ACCOMMODATION_OPTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Email" error={e.email} hint="Opsional">
                    <Input
                      type="email"
                      value={p.email}
                      onChange={(ev) => setParticipant(idx, 'email', ev.target.value)}
                      placeholder="nama@email.com (opsional)"
                      aria-invalid={!!e.email}
                    />
                  </Field>

                  <Field label="No. WhatsApp / HP" error={e.whatsapp_number} hint="Opsional">
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={p.whatsapp_number}
                      onChange={(ev) => setParticipant(idx, 'whatsapp_number', ev.target.value)}
                      placeholder="0812xxxxxxxx (opsional)"
                      aria-invalid={!!e.whatsapp_number}
                    />
                  </Field>
                </div>
              </Card>
            );
          })}

          <Button type="button" variant="outline" fullWidth onClick={addParticipantRow}>
            + Tambah Peserta
          </Button>
        </div>

        {/* Honeypot — hidden from humans, traps bots */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {/* Privacy consent */}
        <Card>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setConsentError(null);
              }}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              aria-invalid={!!consentError}
            />
            <span className="text-sm text-slate-700">
              Saya menyetujui data peserta (nama, kode SP, tanggal lahir, alamat, dan kontak bila diisi)
              digunakan oleh panitia <strong>hanya</strong> untuk keperluan acara reuni — konfirmasi
              kehadiran, pengingat, dan rekap. Data tidak dibagikan ke pihak di luar panitia.
            </span>
          </label>
          {consentError && <p className="field-error mt-2">{consentError}</p>}
        </Card>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Mengirim…' : `Daftar ${participants.length} Peserta`}
        </Button>
        <p className="text-center text-xs text-slate-400">
          Setelah mendaftar, Anda menerima kode kehadiran (QR) dan tautan untuk mengelola data.
        </p>
      </form>
    </div>
  );
}
