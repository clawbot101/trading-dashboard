'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeNext } from '../../lib/terminal-auth';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || 'Login failed.');
        return;
      }
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="panel p-6 w-full max-w-sm space-y-4">
        <div>
          <div className="text-lg font-semibold">Algo Terminal</div>
          <div className="text-xs text-hl-secondary">Enter the terminal password.</div>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-hl-hover border border-hl-border rounded px-3 py-2 text-sm font-num"
          placeholder="Password"
        />
        {error ? <div className="text-xs text-hl-loss">{error}</div> : null}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full bg-hl-accent text-hl-bg rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Log in'}
        </button>
        <div className="text-[10px] text-hl-muted">This browser stays logged in for 7 days.</div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
