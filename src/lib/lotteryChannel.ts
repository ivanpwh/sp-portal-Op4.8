// ---------------------------------------------------------------------------
// SP Portal — sinkronisasi undian antar-tab lewat BroadcastChannel.
//
// Skenario yang didukung: SATU laptop, DUA tab di browser & sesi login yang sama
// — tab kontrol panitia (/admin/undian) dan tab layar besar untuk proyektor
// (/admin/undian/layar). Tidak ada WebSocket/server real-time; BroadcastChannel
// adalah API browser native yang hanya menjangkau tab dengan origin sama.
//
// ARAH PESAN
//
//   Control -> Present : draw-start, draw-result, state-snapshot, screen
//   Present -> Control : request-snapshot, request-draw
//
// Halaman Present TIDAK PERNAH memanggil API undian. Ia hanya boleh MEMINTA
// ('request-draw', mis. saat MC menekan spasi atau presenter remote di atas
// panggung); Control yang mengeksekusi. Dengan begitu Control tetap satu-satunya
// pemanggil backend, dan mustahil ada dua tab yang mengundi bersamaan.
//
// Karena 'request-draw' membuka jalur pemicu kedua, Control WAJIB mengabaikannya
// selama undian sedang berjalan dan meredamnya sesaat setelah selesai — lihat
// LotteryControlPage. Transaksi Serializable di backend adalah jaring pengaman
// terakhir, bukan pertahanan pertama.
//
// Muatan pesan hanya berisi full_name/nickname/sp_code — tidak ada PII lain
// (lihat LotteryWinner/LotteryPoolParticipant di src/types.ts).
// ---------------------------------------------------------------------------

import type { LotteryPoolParticipant, LotterySettings, LotteryWinner } from '../types';

// Di-namespace + berversi supaya tidak bentrok dengan aplikasi lain yang
// kebetulan berjalan di origin yang sama (mis. beberapa dev server di
// localhost). Versi dinaikkan ke v2 karena bentuk 'draw-result' berubah dari
// satu pemenang menjadi daftar: tab lama dan tab baru tidak boleh saling
// mendengar dan salah menafsirkan muatan.
const CHANNEL_NAME = 'sp-portal-lottery-v2';

/** Apa yang harus ditampilkan layar besar saat tidak sedang mengundi. */
export type LotteryScreenMode = 'idle' | 'wall' | 'replay';

export type LotteryMessage =
  // Control memberi tahu Present untuk MULAI animasi reel. Belum ada pemenang di
  // sini — hasilnya sengaja ditahan sampai 'draw-result'. `durationMs` dikirim
  // ikut karena durasi kini bisa diubah panitia per babak; Present tidak boleh
  // menebaknya sendiri.
  | { type: 'draw-start'; count: number; durationMs: number }
  // Hasil asli dari backend. Dikirim Control SETELAH delay teatrikal selesai di
  // sisi Control, sehingga kedua tab mengungkap pemenang pada saat yang sama.
  // `requested` > `winners.length` berarti pool habis di tengah undian.
  | { type: 'draw-result'; winners: LotteryWinner[]; remaining: number; requested: number }
  // State terkini setelah setiap perubahan (draw/undo/void/reset/pengaturan),
  // agar Present yang baru dibuka di tengah acara langsung sinkron.
  | {
      type: 'state-snapshot';
      pool: LotteryPoolParticipant[];
      winners: LotteryWinner[];
      settings: LotterySettings;
      muted: boolean;
    }
  // Perintah tampilan dari Control: kembali ke layar siaga, tampilkan papan
  // seluruh pemenang, atau ulangi pengumuman terakhir.
  | { type: 'screen'; mode: LotteryScreenMode }
  // Present saat mount meminta Control mengirim ulang state-snapshot.
  | { type: 'request-snapshot' }
  // Present MEMINTA undian dijalankan (spasi / presenter remote di panggung).
  // Control yang memutuskan dan memanggil API.
  | { type: 'request-draw' };

export interface LotteryChannel {
  post: (message: LotteryMessage) => void;
  close: () => void;
}

/**
 * Buka channel dan daftarkan handler. Panggil `close()` saat unmount.
 *
 * Bila browser tidak mendukung BroadcastChannel, kembalikan objek no-op:
 * halaman tetap berfungsi penuh sendiri-sendiri, hanya sinkronisasi antar-tab
 * yang tidak aktif.
 */
export function openLotteryChannel(onMessage: (message: LotteryMessage) => void): LotteryChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => undefined, close: () => undefined };
  }
  const bc = new BroadcastChannel(CHANNEL_NAME);
  bc.onmessage = (e: MessageEvent<LotteryMessage>) => onMessage(e.data);
  return {
    post: (message) => bc.postMessage(message),
    close: () => {
      bc.onmessage = null;
      bc.close();
    },
  };
}
