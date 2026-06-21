'use client';

import { useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { postsApi } from '@/lib/api';
import type { ScrapedProduct } from '@/types';

interface Props {
  value: string;
  onChange: (url: string) => void;
  onScraped: (data: ScrapedProduct) => void;
}

export function ShopeeUrlInput({ value, onChange, onScraped }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleScrape(url: string) {
    if (timer.current) clearTimeout(timer.current);
    if (!url.trim()) return;
    timer.current = setTimeout(() => void runScrape(url), 800);
  }

  async function runScrape(url: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await postsApi.scrape(url);
      onScraped(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lấy được thông tin sản phẩm');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            scheduleScrape(e.target.value);
          }}
          placeholder="Dán link sản phẩm Shopee..."
          className="h-11 w-full rounded-lg border border-slate-300 pl-4 pr-11 text-sm outline-none focus:border-orange-500"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        </span>
      </div>
      {error && <p className="mt-1 text-sm text-amber-600">{error}</p>}
    </div>
  );
}
