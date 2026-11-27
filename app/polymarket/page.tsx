import { redirect } from 'next/navigation';
import { PM_DEFAULT_STRATEGY } from '../../lib/polymarket-strategies';

export default function PolymarketIndex() {
  redirect(`/polymarket/${PM_DEFAULT_STRATEGY.slug}`);
}
