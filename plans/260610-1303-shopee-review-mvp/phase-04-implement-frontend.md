# Phase 4 — Next.js Frontend: Public Deal Listing + Admin Panel + SEO

## Context Links
- [Research: Next.js 15 Setup](../reports/researcher-02-nestjs-nextjs-setup.md)
- [Brainstorm: UI Design](../reports/brainstorm-260610-1303-shopee-review-deal-aggregator.md)
- [Phase 3: API Endpoints](phase-03-implement-backend.md)

## Overview
- **Priority**: P1
- **Status**: completed
- **Effort**: 7h
- **Mô tả**: Next.js 15 App Router — trang public hiển thị deals newsfeed default + card grid toggle, admin panel under `/admin/*` (login + paste URL + manual fallback + local image upload + CRUD deals), SEO.

## Key Insights
<!-- Updated: Validation Session 1 - Dual view: grid + newsfeed (default), admin image upload, graceful scrape -->
- App Router + Server Components cho SEO (SSR by default)
- ISR `revalidate: 300` (5 phút) cho deal listing — cân bằng freshness vs performance
- shadcn/ui cho component library (Button, Card, Input, Dialog, etc.)
- Admin panel = `/admin/*`; protected layout + client-side JWT check, API vẫn được JWT guard bảo vệ
- **Dual view: Newsfeed (default) + Card Grid + toggle chuyển đổi**
- **Admin: Thêm option upload ảnh thủ công** (ngoài auto-scrape từ Shopee CDN)
- **Scrape form: Graceful degrade** — điền được gì thì điền, admin edit phần còn lại
- Click tracking: frontend POST `/api/deals/:id/click` → nhận affiliate URL → `window.open()`

## Requirements
### Functional
- **Public pages**:
  - Homepage: newsfeed default + card grid toggle, filter by category, sort, search
  - Deal detail page: full info + "Mua ngay" button
  - Category filter sidebar/tabs
- **Admin pages**:
  - Login page
  - Dashboard (stats overview)
  - Deal list (all statuses, edit/archive actions)
  - Create deal: paste URL → scrape → review/edit form → publish
- **SEO**:
  - Dynamic meta tags per page
  - JSON-LD structured data (Product schema)
  - Sitemap.xml auto-generated
  - robots.txt

### Non-functional
- LCP < 2s
- Mobile responsive (Tailwind)
- Lighthouse SEO score > 90

## Architecture
```
apps/frontend/src/
├── app/
│   ├── layout.tsx              # Root layout (fonts, metadata)
│   ├── page.tsx                # Homepage — newsfeed default + grid toggle
│   ├── deals/
│   │   └── [id]/
│   │       └── page.tsx        # Deal detail page
│   ├── admin/
│   │   ├── layout.tsx          # Admin layout (auth check, sidebar)
│   │   ├── login/
│   │   │   └── page.tsx        # Login form
│   │   ├── dashboard/
│   │   │   └── page.tsx        # Stats overview
│   │   └── deals/
│   │       ├── page.tsx        # Admin deal list
│   │       └── create/
│   │           └── page.tsx    # Create deal (scrape + form)
│   ├── sitemap.ts              # Dynamic sitemap
│   └── robots.ts               # Robots config
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── deal-card.tsx           # Deal card component
│   ├── deal-grid.tsx           # Grid container
│   ├── deal-feed.tsx           # Newsfeed/default view
│   ├── deal-view-toggle.tsx    # View mode toggle
│   ├── deal-filters.tsx        # Category tabs + sort + search
│   ├── deal-detail.tsx         # Full deal info
│   ├── admin/
│   │   ├── admin-sidebar.tsx   # Admin nav sidebar
│   │   ├── deal-form.tsx       # Create/edit deal form
│   │   ├── scrape-url-input.tsx # URL paste + scrape button
│   │   ├── image-upload-input.tsx # Local image upload
│   │   ├── deal-table.tsx      # Admin deal list table
│   │   └── stats-cards.tsx     # Dashboard stat cards
│   └── shared/
│       ├── header.tsx          # Public header/nav
│       ├── footer.tsx          # Footer
│       └── price-display.tsx   # Price formatting VNĐ
├── lib/
│   ├── api.ts                  # API client (fetch wrapper)
│   ├── auth.ts                 # JWT token management
│   ├── format.ts               # Price/date formatting utils
│   └── constants.ts            # API URLs, config
└── types/
    └── deal.ts                 # Frontend type definitions
```

## Related Code Files
### Create
- `apps/frontend/src/app/layout.tsx`
- `apps/frontend/src/app/page.tsx`
- `apps/frontend/src/app/deals/[id]/page.tsx`
- `apps/frontend/src/app/admin/layout.tsx`
- `apps/frontend/src/app/admin/login/page.tsx`
- `apps/frontend/src/app/admin/dashboard/page.tsx`
- `apps/frontend/src/app/admin/deals/page.tsx`
- `apps/frontend/src/app/admin/deals/create/page.tsx`
- `apps/frontend/src/app/sitemap.ts`
- `apps/frontend/src/app/robots.ts`
- `apps/frontend/src/components/deal-card.tsx`
- `apps/frontend/src/components/deal-grid.tsx`
- `apps/frontend/src/components/deal-feed.tsx`
- `apps/frontend/src/components/deal-view-toggle.tsx`
- `apps/frontend/src/components/deal-filters.tsx`
- `apps/frontend/src/components/deal-detail.tsx`
- `apps/frontend/src/components/admin/admin-sidebar.tsx`
- `apps/frontend/src/components/admin/deal-form.tsx`
- `apps/frontend/src/components/admin/scrape-url-input.tsx`
- `apps/frontend/src/components/admin/image-upload-input.tsx`
- `apps/frontend/src/components/admin/deal-table.tsx`
- `apps/frontend/src/components/admin/stats-cards.tsx`
- `apps/frontend/src/components/shared/header.tsx`
- `apps/frontend/src/components/shared/footer.tsx`
- `apps/frontend/src/components/shared/price-display.tsx`
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/auth.ts`
- `apps/frontend/src/lib/format.ts`
- `apps/frontend/src/lib/constants.ts`
- `apps/frontend/src/types/deal.ts`

### Modify
- `apps/frontend/next.config.ts` — env variables, rewrites
- `apps/frontend/tailwind.config.ts` — custom theme colors

## Implementation Steps

### Step 1: Install shadcn/ui + dependencies

```bash
cd apps/frontend
pnpm add clsx tailwind-merge lucide-react
npx shadcn@latest init
# Choose: New York style, Zinc color, CSS variables: yes
npx shadcn@latest add button card input label badge dialog select tabs table textarea separator dropdown-menu
```

### Step 2: Types + Constants

`apps/frontend/src/types/deal.ts`:
```typescript
export interface Deal {
  id: number;
  title: string;
  description: string | null;
  note: string | null;
  originalUrl: string;
  affiliateUrl: string;
  originalPrice: number;
  salePrice: number;
  discountPercent: number;
  images: string[];
  shopName: string | null;
  shopRating: number | null;
  soldCount: number | null;
  categoryId: number | null;
  category: Category | null;
  tags: string[];
  voucherCode: string | null;
  expiresAt: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  totalDeals: number;
  activeDeals: number;
  totalClicks: number;
  todayClicks: number;
}

export interface ScrapedDealData {
  title: string | null;
  originalUrl: string;
  affiliateUrl: string;
  originalPrice: number | null;
  salePrice: number | null;
  discountPercent: number | null;
  images: string[];
  shopName: string | null;
  shopRating: number | null;
  soldCount: number | null;
  source: 'api' | 'browser' | 'manual';
  warnings: string[];
}
```

`apps/frontend/src/lib/constants.ts`:
```typescript
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
// Internal URL for server-side fetches (Docker service name)
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL || API_URL;
export const SITE_NAME = 'shopee.review';
export const SITE_DESCRIPTION = 'Tổng hợp deal hot Shopee mỗi ngày — tiết kiệm thời gian, mua sắm thông minh';
```

### Step 3: API Client

`apps/frontend/src/lib/api.ts`:
```typescript
import { API_URL, API_INTERNAL_URL } from './constants';
import { Deal, PaginatedResponse, Category, DashboardStats, ScrapedDealData } from '@/types/deal';

// Server-side calls use internal URL, client-side use public URL
function getBaseUrl(isServer = false) {
  return isServer ? API_INTERNAL_URL : API_URL;
}

// Public API (no auth)
export async function getDeals(params?: Record<string, string>, isServer = false): Promise<PaginatedResponse<Deal>> {
  const searchParams = new URLSearchParams(params);
  const res = await fetch(`${getBaseUrl(isServer)}/deals?${searchParams}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error('Failed to fetch deals');
  return res.json();
}

export async function getDeal(id: number, isServer = false): Promise<Deal> {
  const res = await fetch(`${getBaseUrl(isServer)}/deals/${id}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error('Deal not found');
  return res.json();
}

export async function getCategories(isServer = false): Promise<Category[]> {
  const res = await fetch(`${getBaseUrl(isServer)}/categories`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}

export async function trackClick(dealId: number): Promise<{ affiliateUrl: string }> {
  const res = await fetch(`${API_URL}/deals/${dealId}/click`, { method: 'POST' });
  if (!res.ok) throw new Error('Click tracking failed');
  return res.json();
}

// Admin API (requires JWT)
function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function adminLogin(username: string, password: string): Promise<{ access_token: string }> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json();
}

export async function scrapeUrl(token: string, url: string): Promise<ScrapedDealData> {
  const res = await fetch(`${API_URL}/admin/deals/scrape`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Scrape failed');
  return res.json();
}

export async function createDeal(token: string, data: Partial<Deal>): Promise<Deal> {
  const res = await fetch(`${API_URL}/admin/deals`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Create deal failed');
  return res.json();
}

export async function getAdminDeals(token: string, params?: Record<string, string>): Promise<PaginatedResponse<Deal>> {
  const searchParams = new URLSearchParams(params);
  const res = await fetch(`${API_URL}/admin/deals?${searchParams}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch admin deals');
  return res.json();
}

export async function updateDeal(token: string, id: number, data: Partial<Deal>): Promise<Deal> {
  const res = await fetch(`${API_URL}/admin/deals/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Update deal failed');
  return res.json();
}

export async function archiveDeal(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_URL}/admin/deals/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Archive deal failed');
}

export async function getAdminStats(token: string): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/admin/deals/stats`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function uploadDealImage(token: string, file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/admin/uploads/deal-image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error('Image upload failed');
  return res.json();
}
```

### Step 4: Auth helpers

`apps/frontend/src/lib/auth.ts`:
```typescript
'use client';

const TOKEN_KEY = 'shopee_review_admin_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;

  try {
    // Decode JWT payload to check expiry
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
```

### Step 5: Format utilities

`apps/frontend/src/lib/format.ts`:
```typescript
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}
```

### Step 6: Root Layout

`apps/frontend/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — Deal Hot Shopee Mỗi Ngày`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'vi_VN',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

### Step 7: Homepage — Deal Grid (Server Component)

`apps/frontend/src/app/page.tsx`:
```tsx
import { getDeals, getCategories } from '@/lib/api';
import { DealViewToggle } from '@/components/deal-view-toggle';
import { DealFilters } from '@/components/deal-filters';
import { Header } from '@/components/shared/header';
import { Footer } from '@/components/shared/footer';

export const revalidate = 300;

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const filterParams: Record<string, string> = {};
  if (params.category) filterParams.categoryId = params.category;
  if (params.sort) filterParams.sortBy = params.sort;
  if (params.search) filterParams.search = params.search;

  const [dealsRes, categories] = await Promise.all([
    getDeals(filterParams, true),
    getCategories(true),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">Deal Hot Hôm Nay</h1>
        <DealFilters categories={categories} />
        <DealViewToggle deals={dealsRes.data} meta={dealsRes.meta} defaultView="feed" />
      </main>
      <Footer />
    </div>
  );
}
```

`apps/frontend/src/components/deal-view-toggle.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { DealFeed } from './deal-feed';
import { DealGrid } from './deal-grid';
import type { Deal, PaginatedResponse } from '@/types/deal';

interface Props {
  deals: Deal[];
  meta: PaginatedResponse<Deal>['meta'];
  defaultView?: 'feed' | 'grid';
}

export function DealViewToggle({ deals, meta, defaultView = 'feed' }: Props) {
  const [view, setView] = useState(defaultView);

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border bg-white p-1">
        <button className={view === 'feed' ? 'px-3 py-1 rounded bg-orange-500 text-white' : 'px-3 py-1'} onClick={() => setView('feed')}>Feed</button>
        <button className={view === 'grid' ? 'px-3 py-1 rounded bg-orange-500 text-white' : 'px-3 py-1'} onClick={() => setView('grid')}>Grid</button>
      </div>
      {view === 'feed' ? <DealFeed deals={deals} meta={meta} /> : <DealGrid deals={deals} meta={meta} />}
    </div>
  );
}
```

`apps/frontend/src/components/deal-feed.tsx`:
```tsx
import { DealCard } from './deal-card';
import type { Deal, PaginatedResponse } from '@/types/deal';

interface Props {
  deals: Deal[];
  meta: PaginatedResponse<Deal>['meta'];
}

export function DealFeed({ deals, meta }: Props) {
  if (deals.length === 0) {
    return <p className="text-center text-gray-500 py-12">Chưa có deal nào. Quay lại sau nhé!</p>;
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} variant="feed" />
      ))}
      {meta.totalPages > 1 && (
        <p className="text-center text-sm text-gray-500">Trang {meta.page}/{meta.totalPages} - {meta.total} deals</p>
      )}
    </div>
  );
}
```

### Step 8: Deal Card Component

`apps/frontend/src/components/deal-card.tsx`:
```tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatPrice, formatNumber, timeAgo } from '@/lib/format';
import { trackClick } from '@/lib/api';
import type { Deal } from '@/types/deal';

interface Props {
  deal: Deal;
  variant?: 'grid' | 'feed';
}

export function DealCard({ deal, variant = 'grid' }: Props) {
  const handleBuyClick = async () => {
    try {
      const { affiliateUrl } = await trackClick(deal.id);
      window.open(affiliateUrl, '_blank');
    } catch {
      // Fallback: open affiliate URL directly
      window.open(deal.affiliateUrl, '_blank');
    }
  };

  const mainImage = deal.images?.[0];

  return (
    <Card className={variant === 'feed' ? 'overflow-hidden hover:shadow-md transition-shadow' : 'overflow-hidden hover:shadow-lg transition-shadow'}>
      <Link href={`/deals/${deal.id}`}>
        <div className="relative aspect-square">
          {mainImage && (
            <Image src={mainImage} alt={deal.title} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
          )}
          {deal.discountPercent > 0 && (
            <Badge className="absolute top-2 right-2 bg-red-500">-{deal.discountPercent}%</Badge>
          )}
        </div>
      </Link>
      <CardContent className="p-3">
        <Link href={`/deals/${deal.id}`}>
          <h3 className="font-medium text-sm line-clamp-2 mb-2 hover:text-blue-600">{deal.title}</h3>
        </Link>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-red-600 font-bold text-lg">{formatPrice(deal.salePrice)}</span>
          {deal.originalPrice > deal.salePrice && (
            <span className="text-gray-400 line-through text-xs">{formatPrice(deal.originalPrice)}</span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
          {deal.shopName && <span>{deal.shopName}</span>}
          {deal.soldCount && <span>Đã bán {formatNumber(deal.soldCount)}</span>}
        </div>
        {deal.tags?.length > 0 && (
          <div className="flex gap-1 mb-3 flex-wrap">
            {deal.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}
        <Button onClick={handleBuyClick} className="w-full bg-orange-500 hover:bg-orange-600">
          Mua ngay
        </Button>
      </CardContent>
    </Card>
  );
}
```

### Step 9: Deal Grid + Filters

`apps/frontend/src/components/deal-grid.tsx`:
```tsx
import { DealCard } from './deal-card';
import type { Deal, PaginatedResponse } from '@/types/deal';

interface Props {
  deals: Deal[];
  meta: PaginatedResponse<Deal>['meta'];
}

export function DealGrid({ deals, meta }: Props) {
  if (deals.length === 0) {
    return <p className="text-center text-gray-500 py-12">Chưa có deal nào. Quay lại sau nhé!</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
      {meta.totalPages > 1 && (
        <div className="flex justify-center mt-8 gap-2">
          {/* Simple pagination — enhance in Phase 2 */}
          <p className="text-sm text-gray-500">
            Trang {meta.page}/{meta.totalPages} — {meta.total} deals
          </p>
        </div>
      )}
    </div>
  );
}
```

`apps/frontend/src/components/deal-filters.tsx`:
```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Category } from '@/types/deal';

interface Props {
  categories: Category[];
}

export function DealFilters({ categories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get('category');

  const setFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="mb-6 space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button
          variant={!activeCategory ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('category', null)}
        >
          Tất cả
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={activeCategory === String(cat.id) ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('category', String(cat.id))}
          >
            {cat.icon} {cat.name}
          </Button>
        ))}
      </div>
      <Input
        placeholder="Tìm deal..."
        defaultValue={searchParams.get('search') || ''}
        onChange={(e) => {
          // Debounce in production
          if (e.target.value.length > 2 || e.target.value.length === 0) {
            setFilter('search', e.target.value || null);
          }
        }}
        className="max-w-sm"
      />
    </div>
  );
}
```

### Step 10: Deal Detail Page

`apps/frontend/src/app/deals/[id]/page.tsx`:
```tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDeal } from '@/lib/api';
import { DealDetail } from '@/components/deal-detail';
import { Header } from '@/components/shared/header';
import { Footer } from '@/components/shared/footer';
import { SITE_NAME } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const deal = await getDeal(Number(id), true);
    return {
      title: deal.title,
      description: deal.note || `Giảm ${deal.discountPercent}% — chỉ còn ${deal.salePrice.toLocaleString()}đ`,
      openGraph: {
        title: deal.title,
        description: deal.note || undefined,
        images: deal.images?.[0] ? [{ url: deal.images[0] }] : [],
        siteName: SITE_NAME,
      },
    };
  } catch {
    return { title: 'Deal không tồn tại' };
  }
}

export default async function DealPage({ params }: Props) {
  const { id } = await params;
  let deal;
  try {
    deal = await getDeal(Number(id), true);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6">
        <DealDetail deal={deal} />
        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: deal.title,
              image: deal.images,
              description: deal.description || deal.note,
              offers: {
                '@type': 'Offer',
                price: deal.salePrice,
                priceCurrency: 'VND',
                availability: 'https://schema.org/InStock',
              },
            }),
          }}
        />
      </main>
      <Footer />
    </div>
  );
}
```

### Step 11: Admin Layout + Login

`apps/frontend/src/app/admin/layout.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { AdminSidebar } from '@/components/admin/admin-sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname !== '/admin/login' && !isAuthenticated()) {
      router.replace('/admin/login');
    } else {
      setReady(true);
    }
  }, [pathname, router]);

  if (!ready) return null;

  // Login page = no sidebar
  if (pathname === '/admin/login') return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-6 bg-gray-50">{children}</main>
    </div>
  );
}
```

`apps/frontend/src/app/admin/login/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminLogin } from '@/lib/api';
import { setToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { access_token } = await adminLogin(username, password);
      setToken(access_token);
      router.push('/admin/dashboard');
    } catch {
      setError('Sai tài khoản hoặc mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Step 12: Admin Create Deal Page (Scrape + Form)

`apps/frontend/src/components/admin/scrape-url-input.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { scrapeUrl } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { ScrapedDealData } from '@/types/deal';

interface Props {
  onScraped: (data: ScrapedDealData) => void;
}

export function ScrapeUrlInput({ onScraped }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScrape = async () => {
    const token = getToken();
    if (!token || !url.trim()) return;

    setLoading(true);
    setError('');
    try {
      const data = await scrapeUrl(token, url.trim());
      onScraped(data);
    } catch (err) {
      setError('Scrape thất bại — form nhập tay đã được mở');
      onScraped({
        title: null,
        originalUrl: url.trim(),
        affiliateUrl: '',
        originalPrice: null,
        salePrice: null,
        discountPercent: null,
        images: [],
        shopName: null,
        shopRating: null,
        soldCount: null,
        source: 'manual',
        warnings: ['Scrape failed; admin must fill missing fields manually'],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Dán Shopee product URL vào đây..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
        />
        <Button onClick={handleScrape} disabled={loading || !url.trim()}>
          {loading ? 'Đang scrape...' : 'Scrape'}
        </Button>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
```

`apps/frontend/src/components/admin/image-upload-input.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadDealImage } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface Props {
  images: string[];
  onChange: (images: string[]) => void;
}

export function ImageUploadInput({ images, onChange }: Props) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    const token = getToken();
    if (!token || !file) return;
    setUploading(true);
    try {
      const { url } = await uploadDealImage(token, file);
      onChange([...images, url]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        {images.map((image) => (
          <Button key={image} type="button" variant="secondary" size="sm" onClick={() => onChange(images.filter((x) => x !== image))}>
            {image}
          </Button>
        ))}
      </div>
      {uploading && <p className="text-sm text-gray-500">Đang upload...</p>}
    </div>
  );
}
```

`apps/frontend/src/app/admin/deals/create/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrapeUrlInput } from '@/components/admin/scrape-url-input';
import { ImageUploadInput } from '@/components/admin/image-upload-input';
import { createDeal } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { ScrapedDealData } from '@/types/deal';

export default function CreateDealPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<Partial<ScrapedDealData> & {
    note?: string;
    voucherCode?: string;
    expiresAt?: string;
    status?: string;
    tags?: string[];
  }>({});
  const [loading, setLoading] = useState(false);

  const handleScraped = (data: ScrapedDealData) => {
    setFormData({ ...data, status: 'DRAFT' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      await createDeal(token, formData as any);
      router.push('/admin/deals');
    } catch {
      alert('Tạo deal thất bại');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Tạo Deal Mới</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>1. Paste Shopee URL</CardTitle></CardHeader>
        <CardContent>
          <ScrapeUrlInput onScraped={handleScraped} />
        </CardContent>
      </Card>

      {formData.originalUrl && (
        <Card>
          <CardHeader><CardTitle>2. Review & Edit</CardTitle></CardHeader>
          <CardContent>
	            <form onSubmit={handleSubmit} className="space-y-4">
	              {formData.warnings?.length ? (
	                <p className="rounded bg-yellow-50 p-3 text-sm text-yellow-700">{formData.warnings.join(', ')}</p>
	              ) : null}
	              <div>
	                <Label>Shopee URL</Label>
	                <Input value={formData.originalUrl || ''} onChange={(e) => updateField('originalUrl', e.target.value)} required />
	              </div>
	              <div>
	                <Label>Affiliate URL</Label>
	                <Input value={formData.affiliateUrl || ''} onChange={(e) => updateField('affiliateUrl', e.target.value)} required />
	              </div>
	              <div>
                <Label>Tên sản phẩm</Label>
                <Input value={formData.title || ''} onChange={(e) => updateField('title', e.target.value)} required />
              </div>
              <div className="grid grid-cols-3 gap-4">
	                <div>
	                  <Label>Giá gốc</Label>
	                  <Input type="number" min={0} value={formData.originalPrice ?? ''} onChange={(e) => updateField('originalPrice', Number(e.target.value))} required />
	                </div>
	                <div>
	                  <Label>Giá sale</Label>
	                  <Input type="number" min={0} value={formData.salePrice ?? ''} onChange={(e) => updateField('salePrice', Number(e.target.value))} required />
	                </div>
                <div>
                  <Label>% Giảm</Label>
                  <Input type="number" value={formData.discountPercent || 0} onChange={(e) => updateField('discountPercent', Number(e.target.value))} />
                </div>
              </div>
	              <div>
	                <Label>Ảnh sản phẩm</Label>
	                <ImageUploadInput
	                  images={formData.images || []}
	                  onChange={(images) => updateField('images', images)}
	                />
	              </div>
	              <div>
	                <Label>Ghi chú (lý do nên mua)</Label>
                <Textarea value={formData.note || ''} onChange={(e) => updateField('note', e.target.value)} placeholder="VD: Giá tốt nhất 30 ngày, freeship..." />
              </div>
              <div>
                <Label>Voucher code</Label>
                <Input value={formData.voucherCode || ''} onChange={(e) => updateField('voucherCode', e.target.value)} />
              </div>
              <div>
                <Label>Hết hạn</Label>
                <Input type="datetime-local" value={formData.expiresAt || ''} onChange={(e) => updateField('expiresAt', e.target.value)} />
              </div>
              <div>
                <Label>Trạng thái</Label>
                <Select value={formData.status || 'DRAFT'} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Nháp</SelectItem>
                    <SelectItem value="ACTIVE">Hiển thị</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? 'Đang lưu...' : 'Tạo Deal'}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Hủy
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### Step 13: Shared Components (Header, Footer, Price Display)

`apps/frontend/src/components/shared/header.tsx`:
```tsx
import Link from 'next/link';
import { SITE_NAME } from '@/lib/constants';

export function Header() {
  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-orange-500">
          {SITE_NAME}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:text-orange-500">Deals</Link>
        </nav>
      </div>
    </header>
  );
}
```

`apps/frontend/src/components/shared/footer.tsx`:
```tsx
import { SITE_NAME } from '@/lib/constants';

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 py-6 mt-8">
      <div className="container mx-auto px-4 text-center text-sm text-gray-500">
        <p>{SITE_NAME} — Tổng hợp deal hot Shopee mỗi ngày</p>
        <p className="mt-1">Chúng tôi có thể nhận hoa hồng từ các link affiliate</p>
      </div>
    </footer>
  );
}
```

`apps/frontend/src/components/shared/price-display.tsx`:
```tsx
import { formatPrice } from '@/lib/format';

interface Props {
  original: number;
  sale: number;
  discountPercent: number;
  size?: 'sm' | 'lg';
}

export function PriceDisplay({ original, sale, discountPercent, size = 'sm' }: Props) {
  const saleClass = size === 'lg' ? 'text-2xl' : 'text-lg';
  const origClass = size === 'lg' ? 'text-base' : 'text-xs';

  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-red-600 font-bold ${saleClass}`}>{formatPrice(sale)}</span>
      {original > sale && (
        <>
          <span className={`text-gray-400 line-through ${origClass}`}>{formatPrice(original)}</span>
          <span className="text-red-500 text-xs font-semibold">-{discountPercent}%</span>
        </>
      )}
    </div>
  );
}
```

### Step 14: SEO — Sitemap + Robots

`apps/frontend/src/app/sitemap.ts`:
```typescript
import { MetadataRoute } from 'next';
import { API_INTERNAL_URL } from '@/lib/constants';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://shopee.review';

  // Fetch all active deals
  let dealUrls: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_INTERNAL_URL}/deals?limit=1000`);
    const { data } = await res.json();
    dealUrls = data.map((deal: { id: number; updatedAt: string }) => ({
      url: `${baseUrl}/deals/${deal.id}`,
      lastModified: new Date(deal.updatedAt),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch {}

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    ...dealUrls,
  ];
}
```

`apps/frontend/src/app/robots.ts`:
```typescript
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin'],
    },
    sitemap: 'https://shopee.review/sitemap.xml',
  };
}
```

### Step 15: Admin Sidebar + Dashboard + Deal Table

`apps/frontend/src/components/admin/admin-sidebar.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { removeToken } from '@/lib/auth';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/deals', label: 'Quản lý Deals' },
  { href: '/admin/deals/create', label: 'Tạo Deal Mới' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    removeToken();
    router.push('/admin/login');
  };

  return (
    <aside className="w-56 bg-white border-r min-h-screen p-4 flex flex-col">
      <h2 className="font-bold text-lg mb-6 text-orange-500">Admin</h2>
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded text-sm ${
              pathname === item.href ? 'bg-orange-50 text-orange-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Button variant="ghost" size="sm" onClick={handleLogout} className="mt-4">
        Đăng xuất
      </Button>
    </aside>
  );
}
```

`apps/frontend/src/app/admin/dashboard/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminStats } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { DashboardStats } from '@/types/deal';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const token = getToken();
    if (token) getAdminStats(token).then(setStats).catch(console.error);
  }, []);

  if (!stats) return <p>Loading...</p>;

  const cards = [
    { label: 'Tổng deals', value: stats.totalDeals },
    { label: 'Deals active', value: stats.activeDeals },
    { label: 'Tổng clicks', value: stats.totalClicks },
    { label: 'Clicks hôm nay', value: stats.todayClicks },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{c.label}</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{c.value.toLocaleString()}</p></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

`apps/frontend/src/app/admin/deals/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminDeals, archiveDeal, updateDeal } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatPrice, timeAgo } from '@/lib/format';
import type { Deal } from '@/types/deal';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  DRAFT: 'bg-yellow-100 text-yellow-800',
  EXPIRED: 'bg-gray-100 text-gray-800',
  ARCHIVED: 'bg-red-100 text-red-800',
};

export default function AdminDealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);

  const fetchDeals = async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await getAdminDeals(token, { limit: '100' });
      setDeals(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchDeals(); }, []);

  const handlePublish = async (id: number) => {
    const token = getToken();
    if (!token) return;
    await updateDeal(token, id, { status: 'ACTIVE' } as any);
    fetchDeals();
  };

  const handleArchive = async (id: number) => {
    const token = getToken();
    if (!token) return;
    await archiveDeal(token, id);
    fetchDeals();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý Deals</h1>
        <Link href="/admin/deals/create">
          <Button>+ Tạo Deal Mới</Button>
        </Link>
      </div>
      <div className="bg-white rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left p-3">Tên</th>
              <th className="text-left p-3">Giá</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Clicks</th>
              <th className="text-left p-3">Ngày tạo</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.id} className="border-b hover:bg-gray-50">
                <td className="p-3 max-w-xs truncate">{deal.title}</td>
                <td className="p-3">{formatPrice(deal.salePrice)}</td>
                <td className="p-3">
                  <Badge className={STATUS_COLORS[deal.status]}>{deal.status}</Badge>
                </td>
                <td className="p-3">{deal.clickCount}</td>
                <td className="p-3 text-gray-500">{timeAgo(deal.createdAt)}</td>
                <td className="p-3 space-x-2">
                  {deal.status === 'DRAFT' && (
                    <Button size="sm" variant="outline" onClick={() => handlePublish(deal.id)}>Publish</Button>
                  )}
                  {deal.status !== 'ARCHIVED' && (
                    <Button size="sm" variant="destructive" onClick={() => handleArchive(deal.id)}>Archive</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 16: Deal Detail Component

`apps/frontend/src/components/deal-detail.tsx`:
```tsx
'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PriceDisplay } from '@/components/shared/price-display';
import { trackClick } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { Deal } from '@/types/deal';

interface Props {
  deal: Deal;
}

export function DealDetail({ deal }: Props) {
  const handleBuyClick = async () => {
    try {
      const { affiliateUrl } = await trackClick(deal.id);
      window.open(affiliateUrl, '_blank');
    } catch {
      window.open(deal.affiliateUrl, '_blank');
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-8 max-w-5xl">
      {/* Images */}
      <div className="space-y-2">
        {deal.images?.[0] && (
          <div className="relative aspect-square rounded-lg overflow-hidden">
            <Image src={deal.images[0]} alt={deal.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
          </div>
        )}
        {deal.images?.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {deal.images.slice(1, 5).map((img, i) => (
              <div key={i} className="relative aspect-square rounded overflow-hidden">
                <Image src={img} alt="" fill className="object-cover" sizes="25vw" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{deal.title}</h1>
        <PriceDisplay original={deal.originalPrice} sale={deal.salePrice} discountPercent={deal.discountPercent} size="lg" />

        {deal.tags?.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {deal.tags.map((tag) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
        )}

        {deal.note && (
          <p className="text-gray-600 bg-orange-50 p-3 rounded text-sm">{deal.note}</p>
        )}

        {deal.voucherCode && (
          <div className="border border-dashed border-orange-300 p-3 rounded bg-orange-50">
            <span className="text-sm text-gray-600">Mã giảm giá: </span>
            <span className="font-mono font-bold text-orange-600">{deal.voucherCode}</span>
          </div>
        )}

        <div className="text-sm text-gray-500 space-y-1">
          {deal.shopName && <p>Shop: {deal.shopName} {deal.shopRating && `(${deal.shopRating} ⭐)`}</p>}
          {deal.soldCount && <p>Đã bán: {formatNumber(deal.soldCount)}</p>}
        </div>

        <Button onClick={handleBuyClick} size="lg" className="w-full bg-orange-500 hover:bg-orange-600 text-lg py-6">
          Mua ngay trên Shopee
        </Button>

        {deal.description && (
          <div className="mt-4">
            <h3 className="font-medium mb-2">Mô tả</h3>
            <p className="text-sm text-gray-600 whitespace-pre-line">{deal.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

## Todo List
- [x] Install shadcn/ui + Tailwind setup
- [x] Create types, constants, API client, auth helpers, format utils
- [x] Create root layout + metadata
- [x] Create homepage (newsfeed default + grid toggle + filters + categories)
- [x] Create deal card component
- [x] Create deal feed + deal view toggle components
- [x] Create deal detail page (SSR + SEO + JSON-LD)
- [x] Create admin layout under `/admin/*` (auth check + sidebar)
- [x] Create login page
- [x] Create dashboard page (stats cards)
- [x] Create admin deal list page (table + actions)
- [x] Create admin create deal page (scrape URL + edit form + manual fallback + local image upload)
- [x] Create Header, Footer, PriceDisplay shared components
- [x] Create sitemap.ts + robots.ts
- [x] Test mobile responsive
- [x] Test SEO meta tags + structured data

## Success Criteria
- Homepage hiển thị deal cards, filter by category, search hoạt động
- Homepage default là newsfeed; grid view toggle hoạt động
- Deal detail page SSR render đúng, meta tags + JSON-LD present
- Admin routes nằm dưới `/admin/*`; robots block `/admin`
- Admin login → JWT → redirect `/admin/dashboard`
- Admin paste URL → scrape → review → publish deal thành công
- Nếu scrape fail, form nhập tay vẫn mở và cho upload ảnh local
- Admin deal list dùng `/api/admin/deals` và thấy draft/archived
- "Mua ngay" button → track click → redirect affiliate URL
- Sitemap.xml + robots.txt accessible
- Mobile responsive (2-col grid trên mobile, 4-5 col desktop)

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| SSR fetch fail khi API chưa chạy | Medium | Error boundary, fallback UI, try-catch |
| Image CDN blocked/slow | Low | Next.js Image optimization + Shopee CDN reliable |
| JWT token expire giữa session | Low | isAuthenticated() check expiry, redirect `/admin/login` |
| Manual fallback submit missing required fields | Medium | Required inputs for title/originalUrl/affiliateUrl/prices before create |
| Local upload broken by missing volume | Medium | Phase 5 persistent uploads volume required |
| shadcn/ui breaking changes | Low | Lock version, pin dependencies |
| SEO indexing chậm | Medium | Sitemap submit Google Search Console, Cloudflare cache |

## Security Considerations
- Admin routes client-side protected (JWT check) plus backend JWT guards — acceptable cho single admin MVP
- No sensitive data in client bundle (API URL public, JWT in localStorage)
- CORS: backend whitelist frontend origin
- robots.txt block `/admin`
- Affiliate disclosure in footer (compliance)

## Next Steps
- Phase 5: Docker Compose production + Cloudflare setup + domain config
