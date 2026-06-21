'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { categoriesApi, postsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Category, ProductMeta, ScrapedProduct } from '@/types';
import { ImageUploader } from './image-uploader';
import { ShopeeUrlInput } from './shopee-url-input';

export function PostForm() {
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
      setError('Vui lòng xác minh email trước khi đăng bài.');
      return;
    }
    if (!title.trim() || !productUrl.trim() || !affiliateUrl.trim() || images.length === 0) {
      setError('Vui lòng nhập tiêu đề, link sản phẩm, link affiliate và ít nhất 1 ảnh.');
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
      setError(e instanceof Error ? e.message : 'Đăng bài thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {user && !user.emailVerified && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Bạn cần xác minh email trước khi đăng bài. Kiểm tra hộp thư của bạn.
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium">🔗 Link sản phẩm Shopee</label>
        <ShopeeUrlInput value={productUrl} onChange={setProductUrl} onScraped={applyScraped} />
      </div>

      {productMeta && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {productMeta.shopName && <p>Shop: {productMeta.shopName}</p>}
          {productMeta.salePrice != null && (
            <p>
              Giá: {productMeta.salePrice?.toLocaleString('vi-VN')}đ
              {productMeta.discountPercent ? ` (-${productMeta.discountPercent}%)` : ''}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium">📸 Ảnh sản phẩm</label>
        <ImageUploader images={images} onChange={setImages} />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">📝 Tiêu đề bài review</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="h-11 w-full rounded-lg border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
          placeholder="Ví dụ: Đánh giá tai nghe XYZ sau 1 tháng dùng"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">💭 Nội dung review</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          maxLength={5000}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-orange-500"
          placeholder="Chia sẻ trải nghiệm thật của bạn..."
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">🏷️ Link affiliate của bạn</label>
        <input
          value={affiliateUrl}
          onChange={(e) => setAffiliateUrl(e.target.value)}
          className="h-11 w-full rounded-lg border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
          placeholder="Dán link affiliate Shopee của bạn"
        />
        <p className="mt-1 text-xs text-slate-400">
          Đăng ký Shopee Affiliate tại affiliate.shopee.vn để lấy link kiếm hoa hồng.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">📁 Danh mục</label>
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
        >
          <option value="">-- Chọn danh mục --</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-11 rounded-lg border border-slate-300 px-5 text-sm font-medium hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="h-11 flex-1 rounded-lg bg-orange-500 px-5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {submitting ? 'Đang đăng...' : 'Đăng bài →'}
        </button>
      </div>
    </form>
  );
}
