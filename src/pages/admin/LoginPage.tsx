import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { Alert, Button, Card, Field, Input, Logo } from '../../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-12">
      <Link to="/" className="mb-6 text-slate-800">
        <Logo className="text-xl" />
      </Link>
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Login Panitia</h1>
        <p className="mt-1 text-sm text-slate-500">Masuk untuk mengelola pendaftaran reuni.</p>

        {error && (
          <div className="mt-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="panitia@email.com"
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Kata Sandi" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Masuk
          </Button>
        </form>

        <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-600">Akun demo:</p>
          <p>Email: admin@spportal.id</p>
          <p>Kata sandi: admin123</p>
        </div>
      </Card>

      <Link to="/" className="mt-6 text-sm font-semibold text-slate-500 hover:text-brand-700">
        ← Kembali ke halaman publik
      </Link>
    </div>
  );
}
