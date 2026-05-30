import { useEffect, useState } from 'react';
import { createCommittee, listCommittees, setCommitteeActive } from '../../lib/api';
import type { Committee } from '../../types';
import { useAuth } from '../../lib/auth';
import { formatDate, isValidEmail } from '../../lib/format';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageLoader, Select } from '../../components/ui';

export default function CommitteesPage() {
  const { committee: me } = useAuth();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'committee' as Committee['role'] });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    listCommittees()
      .then(setCommittees)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !isValidEmail(form.email) || form.password.length < 6) {
      setError('Lengkapi nama, email valid, dan kata sandi minimal 6 karakter.');
      return;
    }
    setSaving(true);
    try {
      await createCommittee(form);
      setShowAdd(false);
      setForm({ name: '', email: '', password: '', role: 'committee' });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Committee) {
    setBusyId(c.id);
    try {
      await setCommitteeActive(c.id, !c.is_active);
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Akun Panitia</h1>
          <p className="text-sm text-slate-500">Kelola akun panitia. Hanya super-admin yang dapat menambah/menonaktifkan.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>+ Tambah Panitia</Button>
      </div>

      <div className="space-y-3">
        {committees.map((c) => (
          <Card key={c.id} className="!p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-800">{c.name}</p>
                  {c.role === 'super_admin' ? <Badge color="green">Super Admin</Badge> : <Badge>Panitia</Badge>}
                  {!c.is_active && <Badge color="red">Nonaktif</Badge>}
                  {c.id === me?.id && <Badge color="blue">Anda</Badge>}
                </div>
                <p className="truncate text-sm text-slate-500">{c.email}</p>
                <p className="text-xs text-slate-400">Dibuat: {formatDate(c.created_at)}</p>
              </div>
              {c.id !== me?.id && (
                <Button
                  size="sm"
                  variant={c.is_active ? 'outline' : 'primary'}
                  loading={busyId === c.id}
                  onClick={() => toggle(c)}
                >
                  {c.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Tambah Akun Panitia">
        <form onSubmit={add} className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <Field label="Nama" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Kata Sandi" required hint="Minimal 6 karakter.">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Peran" required>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Committee['role'] })}>
              <option value="committee">Panitia</option>
              <option value="super_admin">Super Admin</option>
            </Select>
          </Field>
          <div className="flex gap-3">
            <Button type="button" variant="outline" fullWidth onClick={() => setShowAdd(false)}>Batal</Button>
            <Button type="submit" fullWidth loading={saving}>Tambah</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
