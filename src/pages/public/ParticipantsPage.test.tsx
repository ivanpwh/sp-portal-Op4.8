import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ParticipantsPage from './ParticipantsPage';
import type { PublicSpIndukGroup } from '../../types';

// Urutan dalam data contoh ini SENGAJA bukan urutan abjad dan sengaja memuat
// beda huruf besar/kecil: itulah yang membedakan pengurutan sadar-lokal dari
// perbandingan kode karakter, yang akan melempar "andi" ke belakang "Zulkifli".
const GROUPS: PublicSpIndukGroup[] = [
  {
    induk: 'SP2',
    participants: [
      { full_name: 'Zulkifli Anwar', nickname: '', sp_code: 'SP2', whatsapp_number: null, email: null },
      { full_name: 'andi Saputra', nickname: '', sp_code: 'SP2.1', whatsapp_number: null, email: null },
      { full_name: 'Dewi Anggraini', nickname: '', sp_code: 'SP2.2', whatsapp_number: null, email: null },
    ],
  },
  {
    induk: 'SP4',
    participants: [
      { full_name: 'Yoso Pramono', nickname: '', sp_code: 'SP4', whatsapp_number: null, email: null },
      { full_name: 'Bambang Wijaya', nickname: '', sp_code: 'SP4.1', whatsapp_number: null, email: null },
    ],
  },
];

vi.mock('../../lib/api', () => ({
  getPublicParticipants: vi.fn(async () => GROUPS),
}));

async function renderPage() {
  render(
    <MemoryRouter>
      <ParticipantsPage />
    </MemoryRouter>,
  );
  await waitForElementToBeRemoved(() => screen.queryByText(/Memuat…/i));
}

/** Nama peserta pada satu kelompok, urut seperti yang benar-benar dirender. */
function namesIn(induk: string): string[] {
  const heading = screen.getByRole('button', { name: new RegExp(`${induk}\\b`) });
  const card = heading.closest('div');
  return within(card as HTMLElement)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('p')?.textContent?.trim() ?? '');
}

describe('ParticipantsPage — urutan peserta', () => {
  it('bawaannya mengikuti urutan kode SP dari server', async () => {
    await renderPage();
    expect(namesIn('SP2')).toEqual(['Zulkifli Anwar', 'andi Saputra', 'Dewi Anggraini']);
  });

  it('opsi Nama A–Z mengurutkan di dalam tiap kelompok', async () => {
    await renderPage();
    await userEvent.selectOptions(screen.getByLabelText(/urutkan peserta/i), 'name');

    expect(namesIn('SP2')).toEqual(['andi Saputra', 'Dewi Anggraini', 'Zulkifli Anwar']);
    expect(namesIn('SP4')).toEqual(['Bambang Wijaya', 'Yoso Pramono']);
  });

  /**
   * Yang diurutkan hanya isi kelompok. Kelompok SP Induk itu sendiri tetap pada
   * urutan kode SP — itulah kerangka halaman ini, dan mengacaknya akan membuat
   * orang kehilangan tempat yang sudah dihafalnya.
   */
  it('tidak mengubah urutan kelompok SP Induk', async () => {
    await renderPage();
    // Kode induknya diambil dari span monospace-nya sendiri, bukan dari seluruh
    // teks tombol — teks tombol menyambung dengan jumlah orangnya, sehingga
    // "SP2" + "3 orang" terbaca "SP23".
    const indukOrder = () =>
      screen
        .getAllByRole('button', { expanded: true })
        .map((b) => b.querySelector('span.font-mono')?.textContent);

    expect(indukOrder()).toEqual(['SP2', 'SP4']);
    await userEvent.selectOptions(screen.getByLabelText(/urutkan peserta/i), 'name');
    expect(indukOrder()).toEqual(['SP2', 'SP4']);
  });

  // Pengurutan berlaku atas hasil pencarian, bukan atas seluruh daftar.
  it('bekerja bersama pencarian', async () => {
    await renderPage();
    await userEvent.type(screen.getByLabelText(/cari peserta/i), 'a');
    await userEvent.selectOptions(screen.getByLabelText(/urutkan peserta/i), 'name');

    expect(namesIn('SP2')).toEqual(['andi Saputra', 'Dewi Anggraini', 'Zulkifli Anwar']);
  });
});
