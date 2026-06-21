import type { MetadataRoute } from 'next';
import { postsApi } from '@/lib/api';
import { SITE_URL } from '@/lib/constants';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'daily', priority: 0.5 },
  ];

  try {
    const { data } = await postsApi.list({ limit: 50 }, true);
    const postUrls: MetadataRoute.Sitemap = data.map((post) => ({
      url: `${SITE_URL}/${post.user.username}/${post.id}`,
      lastModified: post.updatedAt ? new Date(post.updatedAt) : undefined,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
    return [...base, ...postUrls];
  } catch {
    return base;
  }
}
