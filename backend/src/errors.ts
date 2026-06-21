// Thrown by route handlers / services; the central error handler in app.ts
// turns it into a JSON response `{ "detail": message }` with the given status.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
