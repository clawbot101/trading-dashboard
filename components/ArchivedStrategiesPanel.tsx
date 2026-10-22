'use client';

import useSWR, { useSWRConfig } from 'swr';
import { useEffect, useMemo, useState } from 'react';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const payload = await r.json();
  if (!r.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${r.status})`);
  }
  return payload;
};

function displayName(name: string): string {
  return String(name).replace(/_/g, '_\u200b');
}

export default function ArchivedStrategiesPanel() {
  const [open, setOpen] = useState(false);
  const [draftArchived, setDraftArchived] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  const { data, error, isLoading, mutate: mutateLocal } = useSWR(
    open ? '/api/archived-strategies' : null,
    fetcher
  );

  const known: string[] = data?.known ?? [];
  const savedArchived: string[] = data?.archived ?? [];

  useEffect(() => {
    if (!open || !data) return;
    setDraftArchived(new Set(savedArchived));
    setSaveError(null);
  }, [open, data, savedArchived]);

  const visibleCount = useMemo(
    () => known.filter((n) => !draftArchived.has(n)).length,
    [known, draftArchived]
  );

  const dirty = useMemo(() => {
    if (savedArchived.length !== draftArchived.size) return true;
    for (const n of savedArchived) {
      if (!draftArchived.has(n)) return true;
    }
    return false;
  }, [savedArchived, draftArchived]);

  function toggleVisible(name: string, visible: boolean) {
    setDraftArchived((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch('/api/archived-strategies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: [...draftArchived] }),
      });
      const payload = await r.json();
      if (!r.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Save failed');
      }
      await mutateLocal();
      await mutate(() => true, { revalidate: true });
      setOpen(false);
    } catch (e: any) {
      setSaveError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2 py-1 text-[11px] rounded bg-hl-panel text-hl-secondary hover:bg-hl-hover border border-hl-border"
        title="Choose which strategies appear on the dashboard"
      >
        Shown strategies…
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="panel w-full max-w-lg max-h-[85vh] flex flex-col p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="text-sm font-semibold text-hl-text">Shown vs archived</h2>
                <p className="text-[11px] text-hl-muted mt-1 leading-snug">
                  Archived strategies stay in the database and can be restored anytime. They are
                  hidden from totals, charts, and the strategy list.
                </p>
              </div>
              <button
                type="button"
                className="text-hl-muted hover:text-hl-text text-lg leading-none"
                onClick={() => !saving && setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {isLoading && !data ? (
              <div className="py-8 text-center text-sm text-hl-muted">Loading…</div>
            ) : error ? (
              <div className="py-4 text-sm text-hl-loss">Could not load strategy list.</div>
            ) : (
              <>
                <div className="text-[10px] text-hl-secondary mb-2">
                  {visibleCount} shown · {draftArchived.size} archived
                </div>
                <ul className="overflow-y-auto flex-1 border border-hl-border rounded divide-y divide-hl-border min-h-[120px]">
                  {known.map((name) => {
                    const visible = !draftArchived.has(name);
                    return (
                      <li
                        key={name}
                        className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-hl-hover/50"
                      >
                        <input
                          id={`strat-vis-${name}`}
                          type="checkbox"
                          checked={visible}
                          onChange={(e) => toggleVisible(name, e.target.checked)}
                          className="rounded border-hl-border"
                        />
                        <label
                          htmlFor={`strat-vis-${name}`}
                          className="flex-1 cursor-pointer font-mono text-xs break-all"
                        >
                          {displayName(name)}
                        </label>
                        <span
                          className={`text-[10px] uppercase tracking-wide ${
                            visible ? 'text-hl-profit' : 'text-hl-muted'
                          }`}
                        >
                          {visible ? 'Shown' : 'Archived'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {saveError ? (
              <div className="mt-2 text-xs text-hl-loss">{saveError}</div>
            ) : null}

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-hl-border">
              <button
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-sm rounded bg-hl-panel text-hl-secondary hover:bg-hl-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !dirty || !!error}
                onClick={() => void save()}
                className="px-3 py-1.5 text-sm rounded bg-hl-accent text-hl-bg disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
