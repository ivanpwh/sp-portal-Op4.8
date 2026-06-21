// Error khusus yang harus bisa dibedakan komponen (mis. RegisterPage) dari Error
// generik. Didefinisikan terpisah agar identitas kelasnya SAMA di mode demo & real,
// sehingga `instanceof RegistrationClosedError` tetap valid apa pun sumber datanya.

export class RegistrationClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationClosedError';
  }
}
