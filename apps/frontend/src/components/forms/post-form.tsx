'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { categoriesApi, postsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Category, ProductMeta, ScrapedProduct } from '@/types';
import { ImageUploader } from './image-uploader';
import { ShopeeUrlInput } from './shopee-url-input';

export function PostForm() {
  const t = useTranslations('create');
  const { user } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);

  const [productUrl, setProductUrl] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [productMeta, setProductMeta] = useState<ProductMeta | undefined>();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => undefined);
  }, []);

  function applyScraped(data: ScrapedProduct) {
    if (data.title && !title) setTitle(data.title);
    if (data.images?.length) setImages((prev) => (prev.length ? prev : data.images.slice(0, 10)));
    setProductMeta({
      shopName: data.shopName,
      originalPrice: data.originalPrice,
      salePrice: data.salePrice,
      discountPercent: data.discountPercent,
      rating: data.shopRating,
      soldCount: data.soldCount,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (user && !user.emailVerified) {
      setError(t('errors.emailNotVerified'));
      return;
    }
    if (!title.trim() || !productUrl.trim() || !affiliateUrl.trim() || images.length === 0) {
      setError(t('errors.missingFields'));
      return;
    }

    setSubmitting(true);
    try {
      const post = await postsApi.create({
        title: title.trim(),
        content: content.trim() || undefined,
        productUrl: productUrl.trim(),
        affiliateUrl: affiliateUrl.trim(),
        images,
        categoryId,
        productMeta,
      });
      router.push(`/${post.user.username}/${post.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {user && !user.emailVerified && (
        <div className="rounded-lg border border-warning-border bg-warning-surface px-4 py-3 text-body-sm text-warning-on">
          {t('emailVerifyNotice')}
        </div>
      )}

      <div>
        <label className="mb-2 block text-body-sm font-medium">{t('productUrlLabel')}</label>
        <ShopeeUrlInput value={productUrl} onChange={setProductUrl} onScraped={applyScraped} />
      </div>

      {productMeta && (
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-body-sm text-on-surface-variant">
          {productMeta.shopName && <p>{t('shopLabel', { shopName: productMeta.shopName })}</p>}
          {productMeta.salePrice != null && (
            <p>
              {t('priceLabel', { price: productMeta.salePrice?.toLocaleString('vi-VN') })}
              {productMeta.discountPercent ? ` (-${productMeta.discountPercent}%)` : ''}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-2 block text-body-sm font-medium">{t('imagesLabel')}</label>
        <ImageUploader images={images} onChange={setImages} />
      </div>

      <div>
        <label className="mb-2 block text-body-sm font-medium">{t('titleLabel')}</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={t('titlePlaceholder')}
        />
      </div>

      <div>
        <label className="mb-2 block text-body-sm font-medium">{t('contentLabel')}</label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder={t('contentPlaceholder')}
        />
      </div>

      <div>
        <label className="mb-2 block text-body-sm font-medium">{t('affiliateUrlLabel')}</label>
        <Input
          value={affiliateUrl}
          onChange={(e) => setAffiliateUrl(e.target.value)}
          placeholder={t('affiliateUrlPlaceholder')}
        />
        <p className="mt-1 text-label-caps text-on-surface-variant">{t('affiliateHint')}</p>
      </div>

      <div>
        <label className="mb-2 block text-body-sm font-medium">{t('categoryLabel')}</label>
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
          className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">{t('categoryPlaceholder')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-body-sm text-error">{error}</p>}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" type="button" onClick={() => router.back()}>
          {t('cancel')}
        </Button>
        <Button type="submit" size="lg" disabled={submitting} className="flex-1">
          {submitting ? t('publishing') : t('publish')}
        </Button>
      </div>
    </form>
  );
}
