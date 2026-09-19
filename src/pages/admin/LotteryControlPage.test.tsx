import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LotteryControlPage from './LotteryControlPage';
import { DRAW_DURATION_PRESETS } from '../../components/LotteryReel';
import { DEFAULT_LOTTERY_SETTINGS } from '../../lib/lotterySettings';
import { submitRegistration } from '../../lib/api.mock';

/**
 * Uji ini ada karena dua cacat lolos ke tangan pengguna justru di lapisan yang
 * dulu tidak diuji sama sekali: satu kontrol yang tidak menyorot pilihan apa pun,
 * dan tiga tombol yang tidak melakukan apa pun yang terlihat. Keduanya lolos
 * seluruh uji unit dan seluruh pemeriksaan tipe.
 */

async function renderPage() {
  render(<LotteryControlPage />);
  // Halaman memuat pool + riwayat dulu; tunggu PageLoader hilang.
  await waitForElementToBeRemoved(() => screen.queryByText(/Memuat data undian/i));
}

function group(name: RegExp) {
  return screen.getByRole('group', { name });
}

function seedOpenEvent() {
  localStorage.setItem(
    'sp.event_settings',
    JSON.stringify({
      id: 'test-event',
      event_name: 'Test Event',
      registration_open: true,
      qr_checkin_enabled: true,
      registration_deadline: null,
      updated_at: new Date().toISOString(),
    }),
  );
}

/**
 * Daftarkan peserta lewat data layer demo, bukan dengan menulis localStorage
 * sendiri: halaman ini membaca pool lewat jalur yang sama, jadi bentuk datanya
 * dijamin ikut berubah kalau suatu saat bentuk penyimpanannya diubah.
 */
async function seedGroups(sizes: Record<string, number>) {
  for (const [induk, count] of Object.entries(sizes)) {
    await submitRegistration({
      privacy_consent: true,
      participants: Array.from({ length: count }, (_, i) => ({
        full_name: `${induk} Orang ${i + 1}`,
        sp_code: `${induk}.${i + 1}`,
        birth_date: '1990-01-01',
        address: 'Jawa Tengah',
        whatsapp_number: '081234567890',
        email: `${induk.toLowerCase()}.${i + 1}@example.com`,
      })),
    });
  }
}

beforeEach(() => {
  localStorage.clear();
});

describe('LotteryControlPage — kontrol babak', () => {
  /**
   * REGRESI: durasi bawaan dulu 4200 ms sementara pilihannya 0/3/5/10 detik.
   * Tidak ada tombol yang cocok, jadi panel terbuka tanpa satu pun tersorot —
   * kontrol yang berfungsi tapi terlihat rusak.
   */
  it('membuka dengan tepat satu pilihan tersorot di tiap kelompok', async () => {
    await renderPage();

    for (const name of [
      /jumlah pemenang/i,
      /waktu hingga pengumuman/i,
      /ukuran nama di layar/i,
      /efek pengumuman/i,
    ]) {
      const pressed = within(group(name))
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true');
      expect(pressed, `kelompok ${name} tidak punya tepat satu pilihan tersorot`).toHaveLength(1);
    }
  });

  it('menyorot durasi bawaan yang memang ditawarkan tombolnya', async () => {
    await renderPage();
    const pressed = within(group(/waktu hingga pengumuman/i))
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed?.textContent).toBe('5 dtk');
    expect(DRAW_DURATION_PRESETS).toContain(DEFAULT_LOTTERY_SETTINGS.durationMs);
  });

  it('memindahkan sorotan saat pilihan lain ditekan', async () => {
    const user = userEvent.setup();
    await renderPage();

    const g = group(/waktu hingga pengumuman/i);
    await user.click(within(g).getByRole('button', { name: 'Langsung' }));

    expect(within(g).getByRole('button', { name: 'Langsung' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(within(g).getByRole('button', { name: '5 dtk' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('menampilkan input jumlah bebas hanya setelah "Lainnya" dipilih', async () => {
    const user = userEvent.setup();
    await renderPage();

    // Lewat role spinbutton, bukan label: kelompok tombolnya ber-aria-labelledby
    // dengan teks yang sama, jadi getByLabelText juga akan menemukan kelompok itu.
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await user.click(within(group(/jumlah pemenang/i)).getByRole('button', { name: 'Lainnya' }));
    expect(screen.getByRole('spinbutton')).toBeTruthy();
  });
});

describe('LotteryControlPage — tombol perintah layar', () => {
  /**
   * REGRESI: ketiga tombol ini hanya mengirim pesan ke tab lain. Karena tidak
   * mengubah apa pun di tab kontrol, tanpa umpan balik mereka tak bisa
   * dibedakan dari tombol rusak — dan itulah yang dilaporkan pengguna.
   */
  it.each([
    ['Tampilkan Papan Pemenang'],
    ['Ulangi Pengumuman'],
    ['Bersihkan Layar'],
  ])('%s memberi umpan balik yang terlihat', async (label) => {
    const user = userEvent.setup();
    await renderPage();

    // Dicocokkan lewat teksnya, bukan role: komponen Alert juga memakai
    // role=status, jadi role saja tidak pernah unik di halaman ini.
    expect(screen.queryByText(/Perintah dikirim/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: label }));

    const toast = await screen.findByText(/Perintah dikirim/i);
    expect(toast.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('mengatakan tab layar besar belum terdeteksi alih-alih diam', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Bersihkan Layar' }));
    expect(await screen.findByText(/belum terdeteksi/i)).toBeTruthy();
  });

  it('menandai status sambungan layar besar di antara chip', async () => {
    await renderPage();
    expect(screen.getByText(/Layar besar belum terbuka/i)).toBeTruthy();
  });
});

/**
 * Filter kelompok SP. Yang diuji di sini adalah hal-hal yang tidak terlihat dari
 * tipe maupun dari uji data layer: jumlah yang ditampilkan panitia sebelum
 * menekan "Undi", dan satu perangkap arah — daftar kosong di lapisan data berarti
 * "semua kelompok ikut", sehingga melepas centang terakhir akan MELEBARKAN
 * undian alih-alih menutupnya.
 */
describe('LotteryControlPage — filter kelompok SP', () => {
  function poolBadge() {
    return screen.getByText(/peserta di dalam undian/i).textContent ?? '';
  }

  beforeEach(async () => {
    seedOpenEvent();
    await seedGroups({ SP1: 2, SP2: 1, SP3: 2 });
  });

  it('menampilkan tiap kelompok beserta jumlahnya, semuanya ikut secara bawaan', async () => {
    await renderPage();

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    for (const box of screen.getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).checked).toBe(true);
    }
    expect(screen.getByRole('checkbox', { name: /^SP2\b/ }).closest('label')?.textContent).toMatch(
      /1 peserta/,
    );
    expect(poolBadge()).toMatch(/^5 peserta/);
    expect(screen.getByText(/Semua kelompok ikut/i)).toBeTruthy();
  });

  it('mengecilkan undian ke kelompok yang masih tercentang', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('checkbox', { name: /^SP3\b/ }));

    expect(poolBadge()).toMatch(/^3 peserta/);
    expect(screen.getByText(/Hanya SP1, SP2 yang bisa terundi/i)).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /^SP3\b/ }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('mengunci centang terakhir — melepasnya justru akan mengikutkan semua kelompok', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('checkbox', { name: /^SP2\b/ }));
    await user.click(screen.getByRole('checkbox', { name: /^SP3\b/ }));

    const last = screen.getByRole('checkbox', { name: /^SP1\b/ }) as HTMLInputElement;
    expect(last.checked).toBe(true);
    expect(last.disabled).toBe(true);
    expect(poolBadge()).toMatch(/^2 peserta/);
  });

  it('mengembalikan seluruh kelompok lewat satu tombol', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('checkbox', { name: /^SP3\b/ }));
    expect(poolBadge()).toMatch(/^3 peserta/);

    await user.click(screen.getByRole('button', { name: /Ikutkan semua kelompok/i }));
    expect(poolBadge()).toMatch(/^5 peserta/);
    expect(screen.getByText(/Semua kelompok ikut/i)).toBeTruthy();
  });
});

describe('LotteryControlPage — preset babak', () => {
  it('menyimpan preset dan menampilkannya sebagai tombol', async () => {
    const user = userEvent.setup();
    await renderPage();

    expect(screen.getByText(/Belum ada preset tersimpan/i)).toBeTruthy();

    await user.type(screen.getByPlaceholderText(/Nama preset/i), 'Hadiah Utama');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByRole('button', { name: 'Hadiah Utama' })).toBeTruthy();
    expect(screen.queryByText(/Belum ada preset tersimpan/i)).toBeNull();
  });
});
