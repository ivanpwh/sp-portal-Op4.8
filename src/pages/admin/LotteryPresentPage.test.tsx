import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LotteryPresentPage from './LotteryPresentPage';
import { openLotteryChannel, type LotteryMessage } from '../../lib/lotteryChannel';

const SS_CACHE = 'sp.lottery_stage_cache';

beforeEach(() => {
  sessionStorage.clear();
});

describe('LotteryPresentPage — pemulihan setelah muat ulang', () => {
  it('memulihkan pool dan pemenang dari cache tab ini', () => {
    sessionStorage.setItem(
      SS_CACHE,
      JSON.stringify({
        pool: [
          { id: 'p1', full_name: 'Bambang Soeryadi', nickname: '', sp_code: 'SP1.1' },
          { id: 'p2', full_name: 'Retno Palupi', nickname: '', sp_code: 'SP2.2' },
        ],
        winners: [],
        settings: { roundLabel: 'Hadiah Utama', count: 1, durationMs: 5000, scale: 'besar', effect: 'drumroll' },
        muted: false,
      }),
    );

    render(<LotteryPresentPage />);

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Hadiah Utama')).toBeTruthy();
  });

  /**
   * Cache berasal dari sessionStorage, yang bisa berisi apa saja: versi aplikasi
   * lama, hasil suntingan manual, atau tulisan yang terpotong. Layar ini tayang
   * di depan tamu — gagal render adalah kegagalan yang paling terlihat dari
   * semua kegagalan yang mungkin.
   */
  it.each([
    ['json rusak', '{bukan json'],
    ['bukan objek', '"sekadar string"'],
    ['pool bukan array', JSON.stringify({ pool: 'bukan array', winners: [] })],
    ['field hilang', JSON.stringify({})],
    ['null', 'null'],
  ])('tidak gagal render saat cache %s', (_label, payload) => {
    sessionStorage.setItem(SS_CACHE, payload);

    expect(() => render(<LotteryPresentPage />)).not.toThrow();
    // Jatuh ke keadaan siaga kosong, bukan layar putih. "siap diundi" muncul
    // dua kali di keadaan ini (penanda tahap + kalimat di bawah angka).
    expect(screen.getAllByText(/siap diundi/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('tidak menandai "menunggu sambungan" saat memang tidak ada cache', () => {
    render(<LotteryPresentPage />);
    expect(screen.queryByText(/menunggu sambungan tab kontrol/i)).toBeNull();
  });

  it('menandai "menunggu sambungan" saat menampilkan isi cache yang belum disegarkan', () => {
    sessionStorage.setItem(
      SS_CACHE,
      JSON.stringify({ pool: [], winners: [], settings: {}, muted: false }),
    );
    render(<LotteryPresentPage />);
    expect(screen.getByText(/menunggu sambungan tab kontrol/i)).toBeTruthy();
  });
});

describe('LotteryPresentPage — meminta undian dari panggung', () => {
  let received: LotteryMessage[];
  let control: ReturnType<typeof openLotteryChannel>;

  beforeEach(() => {
    received = [];
    // Berperan sebagai tab kontrol yang mendengarkan di channel yang sama.
    control = openLotteryChannel((m) => received.push(m));
    // Pool harus berisi: tombol undi memang sengaja mati saat pool kosong.
    sessionStorage.setItem(
      SS_CACHE,
      JSON.stringify({
        pool: [{ id: 'p1', full_name: 'Peserta Satu', nickname: '', sp_code: 'SP1.1' }],
        winners: [],
        settings: {},
        muted: false,
      }),
    );
  });
  afterEach(() => control.close());

  /**
   * Invarian yang menjaga seluruh fitur ini: panggung hanya MEMINTA, tab
   * kontrol yang memanggil API. Kalau panggung suatu hari ikut memanggil
   * endpoint undian, dua tab bisa mengundi bersamaan.
   */
  it('mengirim request-draw, bukan menjalankan undian sendiri', async () => {
    const user = userEvent.setup();
    render(<LotteryPresentPage />);

    await user.click(screen.getByRole('button', { name: 'Mulai Undian' }));

    await waitFor(() => {
      expect(received.some((m) => m.type === 'request-draw')).toBe(true);
    });
  });

  it('berhenti menunggu dan mengatakannya saat tab kontrol tidak menjawab', async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<LotteryPresentPage />);

      await user.click(screen.getByRole('button', { name: 'Mulai Undian' }));
      expect(screen.getByRole('button', { name: /Meminta/i })).toBeTruthy();

      // Tidak ada 'draw-start' yang datang — tab kontrol tertutup.
      await vi.advanceTimersByTimeAsync(3500);

      expect(screen.getByText(/Tab kontrol tidak menjawab/i)).toBeTruthy();
      // Tombolnya hidup lagi supaya MC bisa mencoba ulang, bukan menggantung.
      expect(
        (screen.getByRole('button', { name: 'Mulai Undian' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LotteryPresentPage — lapisan latar', () => {
  /**
   * REGRESI: gradien latar dulu hanya muncul di layar penuh.
   *
   * Lapisannya ber-`-z-10`, dan anak ber-z-index negatif tercetak sebelum latar
   * belakang induknya sendiri kecuali induk itu membentuk stacking context —
   * `position: relative` saja tidak cukup. Layar penuh kebetulan membentuknya,
   * jadi gejalanya hanya terlihat di satu mode dan mudah dikira "sudah benar".
   *
   * jsdom tidak menghitung urutan cetak, jadi yang dijaga di sini adalah
   * penyebabnya: root wajib membentuk stacking context lewat `isolate`.
   */
  it('membentuk stacking context sendiri supaya gradien terlihat di kedua mode', () => {
    const { container } = render(<LotteryPresentPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('isolate');
    expect(root.className).toContain('relative');
  });

  it('menaruh gradien di lapisan dekoratif yang tidak dibaca pembaca layar', () => {
    const { container } = render(<LotteryPresentPage />);
    const backdrop = container.querySelector('[aria-hidden="true"].bg-gradient-to-b');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toContain('-z-10');
    expect(backdrop?.className).toContain('pointer-events-none');
  });
});

describe('LotteryPresentPage — PII di layar publik', () => {
  it('tidak pernah merender nama peserta yang belum diundi', () => {
    sessionStorage.setItem(
      SS_CACHE,
      JSON.stringify({
        pool: [{ id: 'p1', full_name: 'Bambang Soeryadi', nickname: 'Pak Bam', sp_code: 'SP1.1' }],
        winners: [],
        settings: {},
        muted: false,
      }),
    );

    render(<LotteryPresentPage />);

    expect(screen.queryByText('Bambang Soeryadi')).toBeNull();
    expect(screen.queryByText(/SP1\.1/)).toBeNull();
    expect(screen.queryByText('Pak Bam')).toBeNull();
  });
});
