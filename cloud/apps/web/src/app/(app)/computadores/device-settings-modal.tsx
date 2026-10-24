'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { DeviceSummary } from '@/server/devices';
import { Alert, Button, Input, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';

/** Ajustes de um PC: nome, limites de alerta e remoção. Os limites chegam ao agente em até 1 minuto. */
export function DeviceSettingsModal({
  device,
  onClose,
  onSaved,
  onDeleted,
}: {
  device: DeviceSummary | null;
  onClose: () => void;
  onSaved: (device: DeviceSummary) => void;
  onDeleted: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setError(null);
    setConfirmDelete(false);
  }, [device]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const { device: updated } = await apiFetch<{ device: DeviceSummary }>(`/api/devices/${device.id}`, {
        method: 'PATCH',
        body: {
          name: String(form.get('name') ?? ''),
          maxCpuTempAlert: Number(form.get('maxCpuTempAlert')),
          maxGpuTempAlert: Number(form.get('maxGpuTempAlert')),
          alertsEnabled: form.get('alertsEnabled') === 'on',
        },
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!device) return;
    setSaving(true);
    try {
      await apiFetch(`/api/devices/${device.id}`, { method: 'DELETE' });
      onDeleted(device.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover.');
      setSaving(false);
    }
  }

  return (
    <Modal open={device !== null} onClose={onClose} title="Ajustes do computador">
      {device && (
        <form key={device.id} onSubmit={save} className="flex flex-col gap-4">
          {error && <Alert>{error}</Alert>}
          <Input label="Nome" name="name" defaultValue={device.name} required maxLength={64} />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Alerta da CPU (°C)"
              name="maxCpuTempAlert"
              type="number"
              min={50}
              max={110}
              defaultValue={device.maxCpuTempAlert}
              required
            />
            <Input
              label="Alerta da GPU (°C)"
              name="maxGpuTempAlert"
              type="number"
              min={50}
              max={110}
              defaultValue={device.maxGpuTempAlert}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input
              type="checkbox"
              name="alertsEnabled"
              defaultChecked={device.alertsEnabled}
              className="size-4 accent-[var(--accent)]"
            />
            Avisar quando passar desses limites
          </label>
          <p className="text-xs text-fg-3">O PC passa a usar os novos limites em até 1 minuto.</p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Salvar
            </Button>
          </div>

          <div className="mt-2 border-t border-line pt-4">
            {confirmDelete ? (
              <div className="flex flex-col gap-3">
                <Alert tone="warn">
                  O histórico e os alertas deste PC serão apagados e ele deixa de enviar dados. Para voltar, será
                  preciso parear de novo.
                </Alert>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Manter
                  </Button>
                  <Button type="button" variant="danger" onClick={remove} loading={saving}>
                    Remover de vez
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
                Remover computador
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
