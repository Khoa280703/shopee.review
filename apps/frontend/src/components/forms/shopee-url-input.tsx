'use client';

import { useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { postsApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import type { ScrapedProduct } from '@/types';

interface Props {
  value: string;
  onChange: (url: string) => void;
  onScraped: (data: ScrapedProduct) => void;
}

export function ShopeeUrlInput({ value, onChange, onScraped }: Props) {
  const t = useTranslations('create');
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
      setError(e instanceof Error ? e.message : t('errors.scrapeFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            scheduleScrape(e.target.value);
          }}
          placeholder={t('urlPlaceholder')}
          className="pl-4 pr-11"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        </span>
      </div>
      {error && <p className="mt-1 text-body-sm text-warning-on">{error}</p>}
    </div>
  );
}
