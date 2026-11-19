import { Suspense } from 'react';
import AnalysisShell from '../../components/AnalysisShell';

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="px-4 py-4 text-sm text-hl-secondary">Loading analysis…</div>}>
      <AnalysisShell>{children}</AnalysisShell>
    </Suspense>
  );
}
