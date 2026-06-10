import { useEffect, useState } from 'react';
import {
  createCommittee,
  deleteCommittee,
  listCommittees,
  setCommitteeActive,
  updateCommittee,
} from '../../lib/api';
import type { Committee } from '../../types';
import { useAuth } from '../../lib/auth';
import { formatDate, isValidEmail } from '../../lib/format';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageLoader, Select } from '../../components/ui';

type FormState = { name: string; email: string; password: string; role: Committee['role'] };
const EMPTY_FORM: FormState = { name: '', email: '', password: '', role: 'committee' };

export default function CommitteesPage() {
  const { committee: me } = useAuth();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Tambah
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  // Ubah
  const [editing, setEditing] = useState<Committee | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Hapus
  const [deleting, setDeleting] = useState<Committee | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function load() {
    listCommittees()
      .then(setCommittees)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function openAdd() {
    setAddForm(EMPTY_FORM);
    setAddError(null);
    setShowAdd(true);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!addForm.name.trim() || !isValidEmail(addForm.email) || addForm.password.length < 6) {
      setAddError('Lengkapi nama, email valid, dan kata sandi minimal 6 karakter.');
      return;
    }
    setAddSaving(true);
    try {
      await createCommittee(addForm);
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
      load();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAddSaving(false);
    }
  }

  function openEdit(c: Committee) {
    setEditing(c);
    setEditError(null);
    setEditForm({ name: c.name, email: c.email, password: '', role: c.role });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError(null);
    if (!editForm.name.trim() || !isValidEmail(editForm.email)) {
      setEditError('Lengkapi nama dan email yang valid.');
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      setEditError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    setEditSaving(true);
    try {
      await updateCommittee(editing.id, {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        password: editForm.password || undefined,
      });
      setEditing(null);
      load();
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditSaving(false);
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

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      await deleteCommittee(deleting.id);
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Akun Panitia</h1>
          <p className="text-sm text-slate-500">
            Kelola akun panitia: tambah, ubah, aktif/nonaktif, dan hapus. Hanya super-admin.
          </p>
        </div>
        <Button onClick={openAdd}>+ Tambah Panitia</Button>
      </div>

      <div className="space-y-3">
        {committees.map((c) => (
          <Card key={c.id} className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                  Ubah
                </Button>
                {c.id !== me?.id && (
                  <>
                    <Button
                      size="sm"
                      variant={c.is_active ? 'outline' : 'primary'}
                      loading={busyId === c.id}
                      onClick={() => toggle(c)}
                    >
                      {c.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setDeleting(c);
                        setDeleteError(null);
                      }}
                    >
                      Hapus
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tambah */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Tambah Akun Panitia">
        <form onSubmit={add} className="space-y-4">
          {addError && <Alert variant="error">{addError}</Alert>}
          <Field label="Nama" required>
            <Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            />
          </Field>
          <Field label="Kata Sandi" required hint="Minimal 6 karakter.">
            <Input
              type="password"
              value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Peran" required>
            <Select
              value={addForm.role}
              onChange={(e) => setAddForm({ ...addForm, role: e.target.value as Committee['role'] })}
            >
              <option value="committee">Panitia</option>
              <option value="super_admin">Super Admin</option>
            </Select>
          </Field>
          <div className="flex gap-3">
            <Button type="button" variant="outline" fullWidth onClick={() => setShowAdd(false)}>
              Batal
            </Button>
            <Button type="submit" fullWidth loading={addSaving}>
              Tambah
            </Button>
          </div>
        </form>
      </Modal>

      {/* Ubah */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Ubah Akun Panitia">
        <form onSubmit={saveEdit} className="space-y-4">
          {editError && <Alert variant="error">{editError}</Alert>}
          <Field label="Nama" required>
            <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </Field>
          <Field label="Kata Sandi Baru" hint="Kosongkan jika tidak ingin mengubah. Minimal 6 karakter.">
            <Input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Peran" required>
            <Select
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Committee['role'] })}
            >
              <option value="committee">Panitia</option>
              <option value="super_admin">Super Admin</option>
            </Select>
          </Field>
          <div className="flex gap-3">
            <Button type="button" variant="outline" fullWidth onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button type="submit" fullWidth loading={editSaving}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Hapus */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Hapus Akun Panitia">
        {deleteError && (
          <div className="mb-4">
            <Alert variant="error">{deleteError}</Alert>
          </div>
        )}
        <p className="text-slate-700">
          Yakin ingin menghapus akun <strong>{deleting?.name}</strong> ({deleting?.email})? Tindakan ini
          tidak dapat dibatalkan.
        </p>
        <div className="mt-5 flex gap-3">
          <Button type="button" variant="outline" fullWidth onClick={() => setDeleting(null)}>
            Batal
          </Button>
          <Button type="button" variant="danger" fullWidth loading={deleteBusy} onClick={confirmDelete}>
            Hapus
          </Button>
        </div>
      </Modal>
    </div>
  );
}
