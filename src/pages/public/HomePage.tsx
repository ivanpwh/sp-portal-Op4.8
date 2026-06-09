import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEventSettings, getRegistrationStatus } from '../../lib/api';
import type { EventSettings, RegistrationStatus } from '../../types';
import { formatDateTime, mapsEmbedUrl, mapsUrl } from '../../lib/format';
import { Alert, Button, Card, PageLoader } from '../../components/ui';

export default function HomePage() {
  const [event, setEvent] = useState<EventSettings | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getEventSettings(), getRegistrationStatus()])
      .then(([e, s]) => {
        setEvent(e);
        setStatus(s);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !event || !status) return <PageLoader />;

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-700 to-brand-600 text-white">
        <div className="container-app py-12 sm:py-16">
          <p className="font-semibold uppercase tracking-wide text-brand-100">Selamat Datang</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">
            {event.event_name}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-brand-50">
            Satukan kembali keluarga besar Soero Pramono. Daftarkan kehadiran Anda — cukup lewat HP,
            mudah untuk semua usia.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 font-semibold">
              📅 {formatDateTime(event.event_date)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 font-semibold">
              📍 {event.location}
            </span>
          </div>

          <div className="mt-8">
            {status.open ? (
              <Link to="/daftar">
                <Button size="lg" variant="secondary" className="!bg-white !text-brand-700 hover:!bg-brand-50">
                  Daftar Sekarang →
                </Button>
              </Link>
            ) : (
              <span className="inline-block rounded-2xl bg-white/15 px-6 py-4 text-lg font-semibold">
                Pendaftaran Ditutup
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="container-app -mt-6 space-y-5 pb-12">
        {/* Registration closed notice */}
        {!status.open && (
          <Alert variant="warning" title="Pendaftaran saat ini ditutup">
            {status.message} Jika ada pertanyaan, silakan hubungi panitia melalui kontak keluarga.
          </Alert>
        )}

        {/* Counter */}
        <Card>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-3xl font-extrabold text-brand-700">{status.total_sessions}</p>
              <p className="text-sm text-slate-500">Pendaftaran Masuk</p>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-brand-700">{status.total_people}</p>
              <p className="text-sm text-slate-500">Total Peserta Hadir</p>
            </div>
          </div>
          {status.deadline && (
            <p className="mt-4 text-center text-sm text-slate-500">
              Batas pendaftaran: <strong>{formatDateTime(status.deadline)}</strong>
            </p>
          )}
        </Card>

        {/* Location & map */}
        <Card>
          <h2 className="text-xl font-bold text-slate-900">Lokasi Acara</h2>
          <p className="mt-1 text-slate-600">{event.location}</p>
          <p className="text-sm text-slate-500">{event.address}</p>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <iframe
              title="Peta Lokasi"
              src={mapsEmbedUrl(event.maps_query)}
              className="h-64 w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <a href={mapsUrl(event.maps_query)} target="_blank" rel="noreferrer" className="mt-3 inline-block">
            <Button variant="outline" size="sm">
              Buka Petunjuk Arah di Google Maps →
            </Button>
          </a>
        </Card>

        {/* How it works */}
        <Card>
          <h2 className="text-xl font-bold text-slate-900">Cara Mendaftar</h2>
          <ol className="mt-4 space-y-3">
            {[
              'Masukkan data peserta beserta Kode SP masing-masing — bisa satu atau beberapa orang.',
              'Setujui penggunaan data untuk keperluan acara reuni.',
              'Klik "Daftar" — Anda langsung menerima kode kehadiran (QR) untuk seluruh peserta.',
              'Simpan tautan kelola untuk mengubah data atau membatalkan kapan saja.',
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {i + 1}
                </span>
                <span className="text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
          {status.open && (
            <Link to="/daftar" className="mt-5 inline-block">
              <Button size="lg">Mulai Pendaftaran</Button>
            </Link>
          )}
        </Card>
      </div>
    </div>
  );
}
