// Error khusus yang harus bisa dibedakan komponen (mis. RegisterPage) dari Error
// generik. Didefinisikan terpisah agar identitas kelasnya SAMA di mode demo & real,
// sehingga `instanceof RegistrationClosedError` tetap valid apa pun sumber datanya.

export class RegistrationClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationClosedError';
  }
}

/**
 * Ada Kode SP yang sudah terdaftar. Ini PERINGATAN, bukan penolakan akhir:
 * kirim ulang dengan `acknowledge_duplicate: true` untuk melanjutkan.
 *
 * Dibedakan dari Error biasa supaya RegisterPage bisa menampilkan tombol
 * "Lanjutkan" alih-alih sekadar pesan merah buntu.
 */
export class DuplicateSpCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateSpCodeError';
  }
}
