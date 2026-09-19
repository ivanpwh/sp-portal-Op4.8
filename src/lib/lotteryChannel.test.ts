import { describe, it, expect, afterEach } from 'vitest';
import { openLotteryChannel, type LotteryChannel, type LotteryMessage } from './lotteryChannel';

// Kontrak sinkronisasi dua tab undian (kontrol <-> layar besar). Di test ini
// kedua "tab" adalah dua instance channel di proses yang sama — cukup untuk
// memverifikasi routing pesan & bentuk payload, yang justru bagian paling mudah
// rusak diam-diam saat message type ditambah/diubah.

const opened: LotteryChannel[] = [];

function open(onMessage: (m: LotteryMessage) => void): LotteryChannel {
  const c = openLotteryChannel(onMessage);
  opened.push(c);
  return c;
}

/** Tunggu satu pesan masuk (BroadcastChannel mengirim secara asinkron). */
function nextMessage(received: LotteryMessage[], timeoutMs = 1000): Promise<LotteryMessage> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const msg = received.shift();
      if (msg) return resolve(msg);
      if (Date.now() - started > timeoutMs) return reject(new Error('Tidak ada pesan yang diterima.'));
      setTimeout(poll, 5);
    };
    poll();
  });
}

afterEach(() => {
  for (const c of opened.splice(0)) c.close();
});

describe('openLotteryChannel', () => {
  it('mengirim draw-result lengkap dengan daftar pemenang dan sisa pool ke tab lain', async () => {
    const received: LotteryMessage[] = [];
    open((m) => received.push(m));
    const control = open(() => undefined);

    const winners = [
      {
        id: 'draw-1',
        participant_id: 'p-1',
        full_name: 'Peserta Satu',
        nickname: 'Satu',
        sp_code: 'SP1.1',
        drawn_at: new Date().toISOString(),
        drawn_by_name: 'Panitia',
        round_label: 'Hadiah Utama',
      },
      {
        id: 'draw-2',
        participant_id: 'p-2',
        full_name: 'Peserta Dua',
        nickname: '',
        sp_code: 'SP1.2',
        drawn_at: new Date().toISOString(),
        drawn_by_name: 'Panitia',
        round_label: 'Hadiah Utama',
      },
    ];
    control.post({ type: 'draw-result', winners, remaining: 4, requested: 2 });

    const msg = await nextMessage(received);
    expect(msg).toEqual({ type: 'draw-result', winners, remaining: 4, requested: 2 });
  });

  it('meneruskan permintaan undi dari layar besar ke tab kontrol', async () => {
    // Arah Present -> Control. Layar besar hanya MEMINTA; Control tetap
    // satu-satunya yang memanggil API, sehingga mustahil ada dua tab mengundi.
    const atControl: LotteryMessage[] = [];
    open((m) => atControl.push(m));
    const present = open(() => undefined);

    present.post({ type: 'request-draw' });

    expect(await nextMessage(atControl)).toEqual({ type: 'request-draw' });
  });

  it('meneruskan perintah tampilan layar beserta modenya', async () => {
    const atPresent: LotteryMessage[] = [];
    open((m) => atPresent.push(m));
    const control = open(() => undefined);

    control.post({ type: 'screen', mode: 'wall' });

    expect(await nextMessage(atPresent)).toEqual({ type: 'screen', mode: 'wall' });
  });

  it('membawa pengaturan babak di dalam state-snapshot', async () => {
    // Durasi & ukuran nama kini diatur panitia per babak. Layar besar tidak
    // boleh menebaknya sendiri — ia harus menerimanya lewat snapshot.
    const atPresent: LotteryMessage[] = [];
    open((m) => atPresent.push(m));
    const control = open(() => undefined);

    const settings = {
      roundLabel: 'Doorprize',
      count: 3,
      durationMs: 10000,
      scale: 'raksasa' as const,
      effect: 'drumroll' as const,
      induk: ['SP1', 'SP2'],
    };
    control.post({ type: 'state-snapshot', pool: [], winners: [], settings, muted: false });

    const msg = await nextMessage(atPresent);
    expect(msg).toEqual({ type: 'state-snapshot', pool: [], winners: [], settings, muted: false });
  });

  it('tidak mengirim pesan kembali ke pengirimnya sendiri', async () => {
    const own: LotteryMessage[] = [];
    const present = open((m) => own.push(m));
    present.post({ type: 'request-snapshot' });

    await expect(nextMessage(own, 120)).rejects.toThrow();
  });

  it('berhenti mengirim setelah close() — tab yang ditutup tidak boleh ikut menerima', async () => {
    const received: LotteryMessage[] = [];
    const present = open((m) => received.push(m));
    const control = open(() => undefined);

    present.close();
    control.post({ type: 'draw-start', count: 1, durationMs: 4200 });

    await expect(nextMessage(received, 120)).rejects.toThrow();
  });
});
