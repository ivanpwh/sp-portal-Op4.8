import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DuplicateError,
  getEventSettings,
  getRegistrationStatus,
  RegistrationClosedError,
  submitRegistration,
} from '../../lib/api';
import type { EventSettings, RegistrationInput, RegistrationStatus } from '../../types';
import { ACCOMMODATION_OPTIONS, FAMILY_BRANCHES } from '../../lib/constants';
import { isValidEmail, isValidWhatsApp, normalizeWhatsApp } from '../../lib/format';
import { Alert, Button, Card, Field, Input, PageLoader, Select, Textarea } from '../../components/ui';

type FormState = RegistrationInput;
type Errors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  full_name: '',
  birth_place_date: '',
  whatsapp_number: '',
  email: '',
  last_occupation: '',
  family_branch: '',
  group_size: 1,
  group_details: '',
  accommodation: '',
  sp_code: '',
  privacy_consent: false,
  website: '', // honeypot
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventSettings | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getEventSettings(), getRegistrationStatus()])
      .then(([e, s]) => {
        setEvent(e);
        setStatus(s);
      })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Errors = {};
    if (!form.full_name.trim()) e.full_name = 'Nama lengkap wajib diisi.';
    if (!form.birth_place_date.trim()) e.birth_place_date = 'Tempat & tanggal lahir wajib diisi.';
    if (!form.whatsapp_number.trim()) e.whatsapp_number = 'Nomor WhatsApp wajib diisi.';
    else if (!isValidWhatsApp(form.whatsapp_number)) e.whatsapp_number = 'Nomor WhatsApp tidak valid.';
    if (!form.email.trim()) e.email = 'Email wajib diisi.';
    else if (!isValidEmail(form.email)) e.email = 'Format email tidak valid.';
    if (!form.last_occupation.trim()) e.last_occupation = 'Pekerjaan terakhir wajib diisi.';
    if (!form.family_branch) e.family_branch = 'Pilih trah / cabang keluarga.';
    if (!form.group_size || form.group_size < 1) e.group_size = 'Minimal 1 orang.';
    if (!form.group_details.trim()) e.group_details = 'Detail rombongan wajib diisi.';
    if (!form.accommodation.trim()) e.accommodation = 'Rencana menginap wajib diisi.';
    if (!form.privacy_consent) e.privacy_consent = 'Anda harus menyetujui penggunaan data.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    setDuplicate(null);
    if (!validate()) {
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await submitRegistration(form);
      navigate(`/sukses/${r.manage_token}`);
    } catch (err) {
      if (err instanceof DuplicateError) {
        setDuplicate(err.registrant.manage_token);
      } else if (err instanceof RegistrationClosedError) {
        setServerError(err.message);
      } else {
        setServerError((err as Error).message || 'Terjadi kesalahan. Coba lagi.');
      }
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
          {event?.event_name}. Isi data dengan benar — kolom bertanda <span className="text-red-600">*</span> wajib.
        </p>
      </div>

      {duplicate && (
        <div className="mb-5">
          <Alert variant="warning" title="Anda sepertinya sudah terdaftar">
            <p>Nomor WhatsApp atau email ini sudah ada di sistem. Anda dapat memperbarui data yang ada alih-alih membuat pendaftaran baru.</p>
            <Link to={`/kelola/${duplicate}`} className="mt-3 inline-block">
              <Button size="sm">Kelola Pendaftaran Saya →</Button>
            </Link>
          </Alert>
        </div>
      )}

      {serverError && (
        <div className="mb-5">
          <Alert variant="error" title="Gagal mendaftar">{serverError}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Card className="space-y-5">
          <Field label="Nama Lengkap" htmlFor="full_name" required error={errors.full_name}>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder="Mis. Budi Santoso"
              aria-invalid={!!errors.full_name}
              autoComplete="name"
            />
          </Field>

          <Field
            label="Tempat, Tanggal Lahir"
            htmlFor="birth_place_date"
            required
            error={errors.birth_place_date}
            hint="Contoh: Yogyakarta, 17 Agustus 1965"
          >
            <Input
              id="birth_place_date"
              value={form.birth_place_date}
              onChange={(e) => set('birth_place_date', e.target.value)}
              placeholder="Kota, tanggal lahir"
              aria-invalid={!!errors.birth_place_date}
            />
          </Field>

          <Field
            label="Nomor WhatsApp"
            htmlFor="whatsapp_number"
            required
            error={errors.whatsapp_number}
            hint={
              form.whatsapp_number && isValidWhatsApp(form.whatsapp_number)
                ? `Akan disimpan sebagai: ${normalizeWhatsApp(form.whatsapp_number)}`
                : 'Boleh diawali 08… — otomatis diubah ke format 62…'
            }
          >
            <Input
              id="whatsapp_number"
              type="tel"
              inputMode="numeric"
              value={form.whatsapp_number}
              onChange={(e) => set('whatsapp_number', e.target.value)}
              placeholder="0812xxxxxxxx"
              aria-invalid={!!errors.whatsapp_number}
              autoComplete="tel"
            />
          </Field>

          <Field label="Email" htmlFor="email" required error={errors.email}>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="nama@email.com"
              aria-invalid={!!errors.email}
              autoComplete="email"
            />
          </Field>

          <Field label="Pekerjaan Terakhir" htmlFor="last_occupation" required error={errors.last_occupation}>
            <Input
              id="last_occupation"
              value={form.last_occupation}
              onChange={(e) => set('last_occupation', e.target.value)}
              placeholder="Mis. Guru, Wiraswasta, Pensiunan"
              aria-invalid={!!errors.last_occupation}
            />
          </Field>
        </Card>

        <Card className="space-y-5">
          <Field
            label="Trah / Cabang Keluarga"
            htmlFor="family_branch"
            required
            error={errors.family_branch}
            hint="Garis keturunan dari Soero Pramono (memudahkan pengelompokan & tempat duduk)."
          >
            <Select
              id="family_branch"
              value={form.family_branch}
              onChange={(e) => set('family_branch', e.target.value)}
              aria-invalid={!!errors.family_branch}
            >
              <option value="">— Pilih cabang keluarga —</option>
              {FAMILY_BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Jumlah Rombongan"
            htmlFor="group_size"
            required
            error={errors.group_size}
            hint="Total orang yang Anda bawa, termasuk diri sendiri."
          >
            <Input
              id="group_size"
              type="number"
              min={1}
              max={50}
              value={form.group_size}
              onChange={(e) => set('group_size', Number(e.target.value))}
              aria-invalid={!!errors.group_size}
            />
          </Field>

          <Field
            label="Detail Rombongan"
            htmlFor="group_details"
            required
            error={errors.group_details}
            hint="Contoh: bawa istri dan 2 anak"
          >
            <Textarea
              id="group_details"
              value={form.group_details}
              onChange={(e) => set('group_details', e.target.value)}
              placeholder="Siapa saja yang Anda bawa?"
              aria-invalid={!!errors.group_details}
            />
          </Field>

          <Field label="Rencana Lokasi Menginap" htmlFor="accommodation" required error={errors.accommodation}>
            <Select
              id="accommodation"
              value={form.accommodation}
              onChange={(e) => set('accommodation', e.target.value)}
              aria-invalid={!!errors.accommodation}
            >
              <option value="">— Pilih rencana menginap —</option>
              {ACCOMMODATION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Kode SP" htmlFor="sp_code" hint="Opsional — kode internal keluarga bila ada.">
            <Input
              id="sp_code"
              value={form.sp_code}
              onChange={(e) => set('sp_code', e.target.value)}
              placeholder="Opsional"
            />
          </Field>
        </Card>

        {/* Honeypot — hidden from humans, traps bots */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </div>

        {/* Privacy consent */}
        <Card>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.privacy_consent}
              onChange={(e) => set('privacy_consent', e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              aria-invalid={!!errors.privacy_consent}
            />
            <span className="text-sm text-slate-700">
              Saya menyetujui data saya (nama, tanggal lahir, nomor WhatsApp, email) digunakan oleh
              panitia <strong>hanya</strong> untuk keperluan acara reuni — konfirmasi kehadiran,
              pengingat, dan rekap. Data tidak dibagikan ke pihak di luar panitia.
            </span>
          </label>
          {errors.privacy_consent && <p className="field-error mt-2">{errors.privacy_consent}</p>}
        </Card>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Mengirim…' : 'Daftar Sekarang'}
        </Button>
        <p className="text-center text-xs text-slate-400">
          Dengan menekan "Daftar", Anda akan menerima konfirmasi via WhatsApp/Email.
        </p>
      </form>
    </div>
  );
}
