import { describe, it, expect, beforeEach } from 'vitest';
import {
  submitRegistration,
  voidLotteryWinner,
  updateSessionByToken,
  cancelRegistrationByToken,
  login,
  checkInSession,
  checkInParticipant,
  getLotteryPool,
  getLotteryWinners,
  drawLotteryWinner,
  undoLastLotteryDraw,
  resetLottery,
} from './api.mock';
import { RegistrationClosedError } from './api.errors';
import type { Committee, EventSettings } from '../types';

const LS_EVENT = 'sp.event_settings';
const LS_COMMITTEES = 'sp.committees';
const LS_PASSWORDS = 'sp.passwords';

function seedOpenEvent(overrides: Partial<EventSettings> = {}) {
  const event: EventSettings = {
    id: 'test-event',
    event_name: 'Test Event',
    tagline: '',
    event_date: '',
    location: '',
    address: '',
    maps_query: '',
    registration_deadline: null,
    registration_open: true,
    qr_checkin_enabled: true,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  localStorage.setItem(LS_EVENT, JSON.stringify(event));
}

function seedCommittee(overrides: Partial<Committee> = {}, password = 'correct-password') {
  const committee: Committee = {
    id: 'committee-1',
    name: 'Test Committee',
    email: 'test.committee@example.com',
    role: 'committee',
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
  localStorage.setItem(LS_COMMITTEES, JSON.stringify([committee]));
  localStorage.setItem(LS_PASSWORDS, JSON.stringify({ [committee.email]: password }));
  return committee;
}

const validParticipant = {
  full_name: 'Test Registrant',
  sp_code: 'SP1',
  birth_date: '1990-01-01',
  address: 'Test Address',
};

describe('submitRegistration', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('succeeds with a valid payload', async () => {
    const result = await submitRegistration({
      privacy_consent: true,
      participants: [validParticipant],
    });
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].full_name).toBe('Test Registrant');
    expect(result.manage_token).toBeTruthy();
  });

  it('rejects submissions with the honeypot field filled in', async () => {
    await expect(
      submitRegistration({
        privacy_consent: true,
        participants: [validParticipant],
        website: 'http://spam.example',
      }),
    ).rejects.toThrow();
  });

  it('throws RegistrationClosedError when registration is closed', async () => {
    localStorage.clear();
    seedOpenEvent({ registration_open: false });
    await expect(
      submitRegistration({ privacy_consent: true, participants: [validParticipant] }),
    ).rejects.toBeInstanceOf(RegistrationClosedError);
  });
});

describe('updateSessionByToken', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('adds a new participant (no id), updates an existing one (with id), and removes an omitted one', async () => {
    const session = await submitRegistration({
      privacy_consent: true,
      participants: [
        { ...validParticipant, full_name: 'Keep And Update', sp_code: 'SP1' },
        { ...validParticipant, full_name: 'To Be Removed', sp_code: 'SP1.1' },
      ],
    });
    const [toUpdate, toRemove] = session.participants;
    expect(toRemove).toBeTruthy();

    const updated = await updateSessionByToken(session.manage_token, {
      participants: [
        { ...validParticipant, id: toUpdate.id, full_name: 'Updated Name', sp_code: 'SP1' },
        { ...validParticipant, full_name: 'Newly Added', sp_code: 'SP2' },
        // toRemove intentionally omitted -> should be deleted
      ],
    });

    const names = updated.participants.map((p) => p.full_name).sort();
    expect(names).toEqual(['Newly Added', 'Updated Name']);

    const updatedParticipant = updated.participants.find((p) => p.id === toUpdate.id);
    expect(updatedParticipant?.full_name).toBe('Updated Name');

    expect(updated.participants.some((p) => p.id === toRemove.id)).toBe(false);
  });
});

describe('cancelRegistrationByToken', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('marks all participants of the session as cancelled', async () => {
    const session = await submitRegistration({
      privacy_consent: true,
      participants: [validParticipant],
    });
    const cancelled = await cancelRegistrationByToken(session.manage_token);
    expect(cancelled.participants.every((p) => p.attendance_status === 'cancelled')).toBe(true);
  });

  it('throws for an unknown token', async () => {
    await expect(cancelRegistrationByToken('does-not-exist')).rejects.toThrow();
  });
});

describe('login', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('succeeds with correct credentials', async () => {
    const committee = seedCommittee();
    const session = await login(committee.email, 'correct-password');
    expect(session.token).toBeTruthy();
    expect(session.committee.email).toBe(committee.email);
  });

  it('rejects an incorrect password', async () => {
    const committee = seedCommittee();
    await expect(login(committee.email, 'wrong-password')).rejects.toThrow();
  });

  it('rejects a deactivated account', async () => {
    const committee = seedCommittee({ is_active: false });
    await expect(login(committee.email, 'correct-password')).rejects.toThrow();
  });
});

describe('checkInSession', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('checks in every attending participant of a session and skips cancelled ones', async () => {
    const session = await submitRegistration({
      privacy_consent: true,
      participants: [
        { ...validParticipant, full_name: 'Attending', sp_code: 'SP1' },
        { ...validParticipant, full_name: 'Also Attending', sp_code: 'SP1.1' },
      ],
    });
    // Cancel one participant directly via updateSessionByToken's sibling API is
    // unnecessary here — checkInSession only needs a session id.
    const count = await checkInSession(session.id, true);
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Undian (lottery)
//
// Assertion di bawah sengaja mencerminkan backend/src/lottery.test.ts satu per
// satu: mock dan implementasi Prisma harus berperilaku sama, karena UI yang
// sama berjalan di atas keduanya (DEMO vs REAL). Kalau salah satu berubah,
// pasangannya wajib ikut diperiksa.
// ---------------------------------------------------------------------------

// Ladang PII yang TIDAK BOLEH bocor lewat endpoint undian — nama pemenang
// tayang di layar besar publik saat acara. Mirror FORBIDDEN_PII di
// backend/src/routes/admin.test.ts.
const FORBIDDEN_PII = [
  'whatsapp_number',
  'email',
  'birth_date',
  'address',
  'address_detail',
  'last_occupation',
  'accommodation',
];

/** Daftarkan satu sesi berisi `names` (kode SP unik per orang). */
function registerPeople(names: string[], prefix = 'SP1') {
  return submitRegistration({
    privacy_consent: true,
    participants: names.map((full_name, i) => ({
      ...validParticipant,
      full_name,
      sp_code: `${prefix}.${i + 1}`,
    })),
  });
}

describe('getLotteryPool', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('includes will_attend participants and excludes cancelled ones', async () => {
    await registerPeople(['Hadir Satu', 'Hadir Dua'], 'SP1');
    const cancelledSession = await registerPeople(['Batal'], 'SP2');
    await cancelRegistrationByToken(cancelledSession.manage_token);

    const pool = await getLotteryPool();
    expect(pool.map((p) => p.full_name).sort()).toEqual(['Hadir Dua', 'Hadir Satu']);
  });

  it('ignores check-in status entirely', async () => {
    const session = await registerPeople(['Belum Checkin', 'Sudah Checkin']);
    await checkInParticipant(session.participants[1].id, true);

    const pool = await getLotteryPool();
    expect(pool).toHaveLength(2);
  });

  it('exposes only id/full_name/nickname/sp_code — no PII', async () => {
    await registerPeople(['Satu']);
    const [entry] = await getLotteryPool();
    expect(Object.keys(entry).sort()).toEqual(['full_name', 'id', 'nickname', 'sp_code']);
    for (const field of FORBIDDEN_PII) {
      expect(entry).not.toHaveProperty(field);
    }
  });

  it('excludes participants that already won', async () => {
    await registerPeople(['Satu', 'Dua']);
    const { winner } = await drawLotteryWinner();

    const pool = await getLotteryPool();
    expect(pool.map((p) => p.id)).not.toContain(winner.participant_id);
  });
});

describe('drawLotteryWinner', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('snapshots the winner and records who drew', async () => {
    const committee = seedCommittee({ name: 'Panitia Undian' });
    await login(committee.email, 'correct-password');
    const session = await registerPeople(['Satu']);

    const { winner } = await drawLotteryWinner();
    expect(winner.participant_id).toBe(session.participants[0].id);
    expect(winner.full_name).toBe('Satu');
    expect(winner.sp_code).toBe('SP1.1');
    expect(winner.drawn_by_name).toBe('Panitia Undian');
    for (const field of FORBIDDEN_PII) {
      expect(winner).not.toHaveProperty(field);
    }
  });

  it('shrinks the pool by exactly one per draw', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga']);
    expect(await getLotteryPool()).toHaveLength(3);

    const first = await drawLotteryWinner();
    expect(first.remaining).toBe(2);
    expect(await getLotteryPool()).toHaveLength(2);

    const second = await drawLotteryWinner();
    expect(second.remaining).toBe(1);
    expect(await getLotteryPool()).toHaveLength(1);
  });

  it('never draws the same participant twice, and drains the pool exactly once each', async () => {
    const session = await registerPeople(['Satu', 'Dua', 'Tiga']);
    const drawn: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { winner } = await drawLotteryWinner();
      drawn.push(winner.participant_id);
    }
    expect(new Set(drawn).size).toBe(3);
    expect(drawn.sort()).toEqual(session.participants.map((p) => p.id).sort());
    expect(await getLotteryPool()).toHaveLength(0);
  });

  it('throws once the pool is empty', async () => {
    await registerPeople(['Satu']);
    await drawLotteryWinner();
    await expect(drawLotteryWinner()).rejects.toThrow(/tidak ada peserta tersisa/i);
  });

  it('throws when there are no participants at all', async () => {
    await expect(drawLotteryWinner()).rejects.toThrow(/tidak ada peserta tersisa/i);
  });

  it('keeps the history row intact after the participant is cancelled', async () => {
    const session = await registerPeople(['Satu']);
    const { winner } = await drawLotteryWinner();
    await cancelRegistrationByToken(session.manage_token);

    const [kept] = await getLotteryWinners();
    expect(kept.id).toBe(winner.id);
    expect(kept.full_name).toBe('Satu');
  });
});

describe('drawLotteryWinner — undian ganda', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('mengundi beberapa pemenang berbeda sekaligus', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam']);
    const res = await drawLotteryWinner({ count: 4 });
    expect(res.winners).toHaveLength(4);
    expect(res.requested).toBe(4);
    expect(res.remaining).toBe(2);
    expect(new Set(res.winners.map((w) => w.participant_id)).size).toBe(4);
    // `winner` tetap ada sebagai alias winners[0].
    expect(res.winner).toEqual(res.winners[0]);
  });

  it('menguras sisa pool alih-alih gagal saat peserta kurang', async () => {
    await registerPeople(['Satu', 'Dua']);
    const res = await drawLotteryWinner({ count: 5 });
    expect(res.winners).toHaveLength(2);
    expect(res.requested).toBe(5);
    expect(res.remaining).toBe(0);
  });

  it('menyimpan label babak di setiap baris', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga']);
    const res = await drawLotteryWinner({ count: 2, round_label: '  Hadiah Utama  ' });
    expect(res.winners.every((w) => w.round_label === 'Hadiah Utama')).toBe(true);
    expect((await getLotteryWinners()).every((w) => w.round_label === 'Hadiah Utama')).toBe(true);
  });

  it('memberi satu drawn_at yang sama untuk seluruh batch', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga']);
    const res = await drawLotteryWinner({ count: 3 });
    expect(new Set(res.winners.map((w) => w.drawn_at)).size).toBe(1);
  });
});

describe('voidLotteryWinner', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('mengembalikan satu pemenang tertentu ke pool tanpa menyentuh yang lain', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga', 'Empat']);
    const res = await drawLotteryWinner({ count: 3 });
    const victim = res.winners[1];

    const voided = await voidLotteryWinner(victim.id, 'manual');
    expect(voided.id).toBe(victim.id);
    // Kolom audit tidak pernah ikut keluar.
    expect(Object.keys(voided)).not.toContain('voided_at');
    expect(Object.keys(voided)).not.toContain('void_reason');

    const winners = await getLotteryWinners();
    expect(winners).toHaveLength(2);
    expect(winners.map((w) => w.id)).not.toContain(victim.id);
    expect((await getLotteryPool()).map((p) => p.id)).toContain(victim.participant_id);
  });

  it('menyimpan baris yang dibatalkan di localStorage sebagai bukti', async () => {
    await registerPeople(['Satu']);
    const { winner } = await drawLotteryWinner();
    await voidLotteryWinner(winner.id, 'manual');

    expect(await getLotteryWinners()).toHaveLength(0);
    const raw = JSON.parse(localStorage.getItem('sp.lottery_draws') ?? '[]');
    expect(raw).toHaveLength(1);
    expect(raw[0].voided_at).toBeTruthy();
    expect(raw[0].void_reason).toBe('manual');
  });

  it('menolak id yang tidak dikenal dan pembatalan kedua kali', async () => {
    await registerPeople(['Satu']);
    const { winner } = await drawLotteryWinner();

    await expect(voidLotteryWinner('tidak-ada')).rejects.toThrow(/tidak ditemukan/i);
    await voidLotteryWinner(winner.id);
    await expect(voidLotteryWinner(winner.id)).rejects.toThrow(/tidak ditemukan/i);
  });
});

describe('getLotteryWinners', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('lists winners newest first', async () => {
    await registerPeople(['Satu', 'Dua']);
    const first = await drawLotteryWinner();
    const second = await drawLotteryWinner();

    const winners = await getLotteryWinners();
    expect(winners.map((w) => w.id)).toEqual([second.winner.id, first.winner.id]);
  });
});

describe('resetLottery — jejak audit', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('mengosongkan daftar pemenang tapi tidak menghapus barisnya', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga']);
    await drawLotteryWinner({ count: 2 });

    const { count } = await resetLottery();
    expect(count).toBe(2);
    expect(await getLotteryWinners()).toHaveLength(0);
    expect(await getLotteryPool()).toHaveLength(3);

    const raw = JSON.parse(localStorage.getItem('sp.lottery_draws') ?? '[]');
    expect(raw).toHaveLength(2);
    expect(raw.every((r: { void_reason: string }) => r.void_reason === 'reset')).toBe(true);
  });
});

describe('undoLastLotteryDraw', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('returns the undone participant to the pool', async () => {
    await registerPeople(['Satu', 'Dua']);
    const { winner } = await drawLotteryWinner();
    expect(await getLotteryPool()).toHaveLength(1);

    const undone = await undoLastLotteryDraw();
    expect(undone.map((u) => u.id)).toEqual([winner.id]);

    const pool = await getLotteryPool();
    expect(pool).toHaveLength(2);
    expect(pool.map((p) => p.id)).toContain(winner.participant_id);
    expect(await getLotteryWinners()).toHaveLength(0);
  });

  it('undoes only the most recent draw', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga']);
    const first = await drawLotteryWinner();
    const second = await drawLotteryWinner();

    const undone = await undoLastLotteryDraw();
    expect(undone.map((u) => u.id)).toEqual([second.winner.id]);

    const winners = await getLotteryWinners();
    expect(winners.map((w) => w.id)).toEqual([first.winner.id]);
  });

  it('takes back every winner of a multi-person draw', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga', 'Empat', 'Lima']);
    const early = await drawLotteryWinner();
    const batch = await drawLotteryWinner({ count: 3 });
    expect(batch.winners).toHaveLength(3);

    const undone = await undoLastLotteryDraw();
    expect(undone.map((u) => u.id).sort()).toEqual(batch.winners.map((w) => w.id).sort());
    expect((await getLotteryWinners()).map((w) => w.id)).toEqual([early.winner.id]);
    expect(await getLotteryPool()).toHaveLength(4);
  });

  it('throws when there is nothing to undo', async () => {
    await expect(undoLastLotteryDraw()).rejects.toThrow(/belum ada undian/i);
  });

  it('refuses a second undo once every draw has been taken back', async () => {
    await registerPeople(['Satu', 'Dua']);
    await drawLotteryWinner();
    await undoLastLotteryDraw();
    // Regresi: dengan soft void, baris yang baru dibatalkan tetap yang terbaru.
    // Kalau saringan "masih aktif" hilang, undo kedua menemukannya lagi dan
    // galat ini tidak pernah muncul.
    await expect(undoLastLotteryDraw()).rejects.toThrow(/belum ada undian/i);
  });
});

describe('resetLottery', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('wipes the whole history and restores the full pool', async () => {
    await registerPeople(['Satu', 'Dua', 'Tiga']);
    await drawLotteryWinner();
    await drawLotteryWinner();

    const { count } = await resetLottery();
    expect(count).toBe(2);
    expect(await getLotteryWinners()).toHaveLength(0);
    expect(await getLotteryPool()).toHaveLength(3);
  });

  it('reports 0 when the history is already empty', async () => {
    await registerPeople(['Satu']);
    expect(await resetLottery()).toEqual({ count: 0 });
  });
});
