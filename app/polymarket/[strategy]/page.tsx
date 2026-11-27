import { notFound } from 'next/navigation';
import PolymarketStrategyView from '../../../components/PolymarketStrategyView';
import { PM_STRATEGIES, pmStrategyBySlug } from '../../../lib/polymarket-strategies';

export function generateStaticParams() {
  return PM_STRATEGIES.map((s) => ({ strategy: s.slug }));
}

export default function PolymarketStrategyPage({ params }: { params: { strategy: string } }) {
  const strategy = pmStrategyBySlug(params.strategy);
  if (!strategy) notFound();
  return <PolymarketStrategyView slug={strategy.slug} />;
}
