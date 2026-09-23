'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
export type BalanceState = { active: boolean; balance: number; pending: number; partial: number; stale?: boolean } | null;

// One poller per chat page, shared by the header and room settings.
export function useLiveStarBalance(generating: boolean): BalanceState {
  const [balance, setBalance] = useState<BalanceState>(null);
  useEffect(() => {
    let stopped = false, busy = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (stopped || busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const response = await fetch('/api/stars?balanceOnly=1', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('balance');
        const data = await response.json();
        if (typeof data.active !== 'boolean' || !Number.isFinite(data.balance)) throw new Error('balance');
        if (!stopped) setBalance({ active: data.active, balance: data.balance, pending: data.pending || 0, partial: data.partial || 0 });
      } catch {
        if (!stopped) setBalance(previous => previous ? { ...previous, stale: true } : null);
      } finally { busy = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    window.addEventListener('stars-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true; controller.abort(); window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('stars-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [generating]);
  return balance;
}
export default function LiveStarBalance({ value }: { value: BalanceState }) {
  const amount = value?.active ? (value.balance / 1e6).toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '—';
  const title = !value ? '잔액을 확인하고 있습니다. 눌러서 별 내역을 확인해 주세요.' : value.stale ? '잔액 갱신이 지연되고 있습니다. 마지막 확인 금액입니다.' : !value.active ? '나의 별에서 현재 잔액을 등록해 주세요.' : `계산 완료된 잔액입니다.${value.partial || value.pending ? ' 부분 사용량 또는 미계산 내역이 있습니다.' : ''} 눌러서 별 내역과 충전 등록을 확인하세요.`;
  return <Link href="/stars" title={title} aria-label={`별 잔액 ${amount}${value?.stale ? ', 갱신 지연' : ''}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 tabular-nums">
    <Star aria-hidden="true" className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
    <span className="truncate">{amount}별{value?.stale ? ' · 갱신 지연' : ''}</span>
  </Link>;
}
