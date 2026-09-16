import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** Paksa jawaban media query gerakan; setup global menjawab `false`. */
function reduceMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
import { LotteryStage } from './LotteryStage';
import { DEFAULT_LOTTERY_SETTINGS } from '../lib/lotterySettings';
import type { LotteryPoolParticipant, LotteryWinner } from '../types';

const POOL: LotteryPoolParticipant[] = [
  { id: 'p1', full_name: 'Bambang Soeryadi', nickname: 'Pak Bam', sp_code: 'SP1.1' },
  { id: 'p2', full_name: 'Retno Palupi', nickname: 'Bu Ret', sp_code: 'SP2.2' },
  { id: 'p3', full_name: 'Joko Susilo', nickname: '', sp_code: 'SP2.3' },
];

function winner(over: Partial<LotteryWinner> = {}): LotteryWinner {
  return {
    id: 'w1',
    participant_id: 'p2',
    full_name: 'Retno Palupi',
    nickname: 'Bu Ret',
    sp_code: 'SP2.2',
    drawn_at: new Date().toISOString(),
    drawn_by_name: 'Panitia Inti',
    round_label: 'Hadiah Utama',
    ...over,
  };
}

function renderStage(over: Partial<Parameters<typeof LotteryStage>[0]> = {}) {
  const props = {
    pool: POOL,
    winners: [] as LotteryWinner[],
    revealed: [] as LotteryWinner[],
    spinning: false,
    settings: DEFAULT_LOTTERY_SETTINGS,
    mode: 'idle' as const,
    muted: false,
    stale: false,
    fullscreen: false,
    onToggleFullscreen: vi.fn(),
    onSetMode: vi.fn(),
    onRequestDraw: vi.fn(),
    requesting: false,
    requestFailed: false,
    ...over,
  };
  return { props, ...render(<LotteryStage {...props} />) };
}

describe('LotteryStage — keadaan siaga', () => {
  /**
   * Layar ini tayang di proyektor selama sambutan, kadang berjam-jam, dan
   * dilihat seluruh ruangan. Membocorkan satu nama peserta sebelum diundi akan
   * merusak undiannya sendiri — bukan sekadar cacat tampilan.
   */
  it('tidak pernah merender nama peserta mana pun', () => {
    renderStage();
    for (const p of POOL) {
      expect(screen.queryByText(p.full_name)).toBeNull();
      expect(screen.queryByText(new RegExp(p.sp_code))).toBeNull();
    }
  });

  it('menampilkan jumlah peserta, bukan kalimat menunggu', () => {
    renderStage();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText(/peserta siap diundi/i)).toBeTruthy();
    // "Siap Diundi" muncul dua kali: penanda tahap di atas, dan kalimat di
    // bawah angka. Keduanya memang disengaja — cocokkan sebagai kumpulan.
    expect(screen.getAllByText(/siap diundi/i).length).toBeGreaterThanOrEqual(2);
  });

  it('menandai saat belum tersambung ke tab kontrol', () => {
    renderStage({ stale: true });
    expect(screen.getByText(/menunggu sambungan tab kontrol/i)).toBeTruthy();
  });

  it('menampilkan label babak saat sudah diisi', () => {
    renderStage({ settings: { ...DEFAULT_LOTTERY_SETTINGS, roundLabel: 'Doorprize Kipas Angin' } });
    expect(screen.getByText('Doorprize Kipas Angin')).toBeTruthy();
  });
});

describe('LotteryStage — pengumuman', () => {
  it('merender pemenang yang sedang diumumkan', () => {
    renderStage({ revealed: [winner()], winners: [winner()] });
    // Namanya muncul di kartu pengumuman DAN di baris "pemenang sebelumnya".
    expect(screen.getAllByText('Retno Palupi').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pemenang/).length).toBeGreaterThan(0);
  });

  it('menyebut jumlahnya saat pemenangnya lebih dari satu', () => {
    const many = [winner(), winner({ id: 'w2', full_name: 'Joko Susilo', sp_code: 'SP2.3' })];
    renderStage({ revealed: many, winners: many });
    expect(screen.getByText(/Pemenang · 2 orang/)).toBeTruthy();
  });
});

describe('LotteryStage — papan pemenang', () => {
  it('merender seluruh pemenang, bukan hanya beberapa terakhir', () => {
    const winners = Array.from({ length: 7 }, (_, i) =>
      winner({ id: `w${i}`, full_name: `Pemenang ${i}`, sp_code: `SP${i}.1` }),
    );
    renderStage({ mode: 'wall', winners });

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
    for (let i = 0; i < 7; i++) {
      expect(within(list).getByText(`Pemenang ${i}`)).toBeTruthy();
    }
  });

  it('mengatakan kosong alih-alih menampilkan papan hampa', () => {
    renderStage({ mode: 'wall', winners: [] });
    expect(screen.getByText(/Belum ada pemenang untuk ditampilkan/i)).toBeTruthy();
  });
});

describe('LotteryStage — hitung mundur & progres', () => {
  const LONG = { ...DEFAULT_LOTTERY_SETTINGS, durationMs: 10000 };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('menampilkan bilah progres selama reel berputar', () => {
    renderStage({ spinning: true, settings: LONG });
    const bar = screen.getByRole('progressbar', { name: /sisa waktu undian/i });
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });

  it('tidak menampilkan bilah progres saat durasinya "Langsung"', () => {
    renderStage({ spinning: true, settings: { ...DEFAULT_LOTTERY_SETTINGS, durationMs: 0 } });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('memajukan progres seiring waktu berjalan', async () => {
    vi.useFakeTimers();
    renderStage({ spinning: true, settings: LONG });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    const now = Number(
      screen.getByRole('progressbar').getAttribute('aria-valuenow') ?? '0',
    );
    expect(now).toBeGreaterThan(30);
    expect(now).toBeLessThan(70);
  });

  /**
   * Angka 3-2-1 adalah momen yang paling sering direkam tamu, tapi ia hanya
   * masuk akal kalau durasinya memberi ruang. Pada durasi pendek ia cuma akan
   * berkedip sekali lalu hilang — lebih mengganggu daripada berguna.
   */
  it('memunculkan hitung mundur pada tiga detik terakhir', async () => {
    vi.useFakeTimers();
    renderStage({ spinning: true, settings: LONG });

    expect(screen.queryByText('3')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7200);
    });
    expect(screen.getByText('3')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('tidak memunculkan hitung mundur pada durasi 3 detik atau kurang', async () => {
    vi.useFakeTimers();
    renderStage({ spinning: true, settings: { ...DEFAULT_LOTTERY_SETTINGS, durationMs: 3000 } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByText('1')).toBeNull();
    expect(screen.queryByText('2')).toBeNull();
  });
});

describe('LotteryStage — prefers-reduced-motion', () => {
  afterEach(() => {
    reduceMotion(false);
  });

  /**
   * Penonton acara ini banyak yang lansia. Gerakan latar harus MATI, bukan
   * sekadar melambat — dan itu berlaku juga untuk hiasan yang "cuma dekoratif".
   */
  it('tidak merender gumpalan latar yang bergerak', () => {
    reduceMotion(true);
    const { container } = renderStage();
    expect(container.querySelectorAll('.animate-float, .animate-float-slow')).toHaveLength(0);
  });

  it('merendernya saat gerakan tidak dikurangi', () => {
    reduceMotion(false);
    const { container } = renderStage();
    expect(
      container.querySelectorAll('.animate-float, .animate-float-slow').length,
    ).toBeGreaterThan(0);
  });
});

describe('LotteryStage — warna babak di papan pemenang', () => {
  it('memberi chip berlabel babak pada tiap pemenang', () => {
    const winners = [
      winner({ id: 'a', round_label: 'Hadiah Utama' }),
      winner({ id: 'b', full_name: 'Joko Susilo', round_label: 'Doorprize' }),
    ];
    renderStage({ mode: 'wall', winners });
    expect(screen.getByText('Hadiah Utama')).toBeTruthy();
    expect(screen.getByText('Doorprize')).toBeTruthy();
  });

  it('memberi warna yang sama untuk label babak yang sama, apa pun urutannya', () => {
    const winners = [
      winner({ id: 'a', round_label: 'Hadiah Utama' }),
      winner({ id: 'b', full_name: 'Joko Susilo', round_label: 'Hadiah Utama' }),
    ];
    const { container } = renderStage({ mode: 'wall', winners });
    const chips = Array.from(container.querySelectorAll('li span.rounded-full'));
    expect(chips).toHaveLength(2);
    expect(chips[0].className).toBe(chips[1].className);
  });

  it('tidak merender chip saat babaknya kosong', () => {
    const { container } = renderStage({
      mode: 'wall',
      winners: [winner({ round_label: '' })],
    });
    expect(container.querySelectorAll('li span.rounded-full')).toHaveLength(0);
  });
});

describe('LotteryStage — bilah kendali panggung', () => {
  /**
   * Sebelum ini, satu-satunya cara mengundi dari panggung adalah menekan spasi,
   * dan pintasan itu hanya aktif di layar penuh. MC yang berdiri di depan
   * proyektor di luar mode itu harus kembali ke tab kontrol.
   */
  it('menyediakan tombol undi dan reset bahkan di luar layar penuh', () => {
    renderStage({ fullscreen: false });
    expect(screen.getByRole('button', { name: 'Mulai Undian' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset Tampilan' })).toBeTruthy();
  });

  it('meneruskan penekanan tombol undi sebagai permintaan, bukan undian langsung', async () => {
    const user = userEvent.setup();
    const { props } = renderStage();
    await user.click(screen.getByRole('button', { name: 'Mulai Undian' }));
    expect(props.onRequestDraw).toHaveBeenCalledTimes(1);
  });

  it('mengembalikan layar ke keadaan siaga lewat tombol reset', async () => {
    const user = userEvent.setup();
    const { props } = renderStage({ mode: 'wall' });
    await user.click(screen.getByRole('button', { name: 'Reset Tampilan' }));
    expect(props.onSetMode).toHaveBeenCalledWith('idle');
  });

  // Tombol yang mati tanpa alasan tidak bisa dibedakan dari tombol rusak.
  it('mematikan tombol undi saat pool kosong DAN mengatakan alasannya', () => {
    renderStage({ pool: [] });
    const btn = screen.getByRole('button', { name: 'Mulai Undian' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Semua peserta sudah mendapat giliran/i)).toBeTruthy();
  });

  it('mematikan tombol undi selama reel berputar DAN mengatakan alasannya', () => {
    renderStage({ spinning: true });
    expect((screen.getByRole('button', { name: 'Mulai Undian' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Sedang mengundi/i)).toBeTruthy();
  });

  it('menandai keadaan menunggu jawaban tab kontrol', () => {
    renderStage({ requesting: true });
    const btn = screen.getByRole('button', { name: /Meminta/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('mengatakan saat tab kontrol tidak menjawab, alih-alih menggantung diam', () => {
    renderStage({ requestFailed: true });
    expect(screen.getByText(/Tab kontrol tidak menjawab/i)).toBeTruthy();
    // Tombolnya kembali bisa ditekan supaya MC bisa mencoba lagi.
    expect((screen.getByRole('button', { name: 'Mulai Undian' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
