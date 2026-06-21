import { API_INTERNAL_URL, API_URL } from './constants';
import type {
  AppNotification,
  AuthUser,
  Category,
  ClickChart,
  Comment,
  CursorPage,
  Post,
  PostStat,
  ScrapedProduct,
  UserProfile,
  UserStats,
} from '@/types';

function baseUrl(isServer: boolean) {
  return isServer ? API_INTERNAL_URL : API_URL;
}

interface FetchOptions extends RequestInit {
  isServer?: boolean;
  revalidate?: number;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { isServer = false, revalidate, ...init } = options;
  const res = await fetch(`${baseUrl(isServer)}${path}`, {
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    ...(revalidate !== undefined ? { next: { revalidate } } : {}),
    ...init,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message || message;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// ---------- Auth ----------
export const authApi = {
  register: (data: { username: string; email: string; password: string; displayName: string }) =>
    apiFetch<{ user: AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    apiFetch<{ user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => apiFetch<AuthUser>('/auth/me'),
  verify: (token: string) =>
    apiFetch<{ success: boolean }>(`/auth/verify?token=${encodeURIComponent(token)}`),
  googleUrl: () => `${API_URL}/auth/google`,
};

// ---------- Posts ----------
export const postsApi = {
  list: (params: Record<string, string | number | undefined> = {}, isServer = false) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && sp.set(k, String(v)));
    return apiFetch<CursorPage<Post>>(`/posts?${sp}`, { isServer, revalidate: isServer ? 30 : undefined });
  },
  trending: (isServer = false) =>
    apiFetch<Post[]>('/posts/trending', { isServer, revalidate: isServer ? 60 : undefined }),
  get: (id: number, isServer = false) =>
    apiFetch<Post>(`/posts/${id}`, { isServer, revalidate: isServer ? 30 : undefined }),
  scrape: (url: string) =>
    apiFetch<ScrapedProduct>('/posts/scrape', { method: 'POST', body: JSON.stringify({ url }) }),
  create: (data: Partial<Post>) =>
    apiFetch<Post>('/posts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Post>) =>
    apiFetch<Post>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/posts/${id}`, { method: 'DELETE' }),
};

// ---------- Users ----------
export const usersApi = {
  profile: (username: string, isServer = false) =>
    apiFetch<UserProfile>(`/users/${username}`, { isServer }),
  posts: (username: string, cursor?: number, isServer = false) =>
    apiFetch<CursorPage<Post>>(`/users/${username}/posts${cursor ? `?cursor=${cursor}` : ''}`, {
      isServer,
    }),
  updateMe: (data: { displayName?: string; bio?: string; avatarUrl?: string; affiliateId?: string }) =>
    apiFetch<AuthUser>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  stats: () => apiFetch<UserStats>('/users/me/stats'),
};

// ---------- Social ----------
export const socialApi = {
  follow: (username: string) =>
    apiFetch<{ following: boolean }>(`/users/${username}/follow`, { method: 'POST' }),
  unfollow: (username: string) =>
    apiFetch<{ following: boolean }>(`/users/${username}/follow`, { method: 'DELETE' }),
  like: (postId: number) =>
    apiFetch<{ liked: boolean }>(`/posts/${postId}/like`, { method: 'POST' }),
  unlike: (postId: number) =>
    apiFetch<{ liked: boolean }>(`/posts/${postId}/like`, { method: 'DELETE' }),
  likeStatus: (postId: number) =>
    apiFetch<{ count: number; isLiked: boolean }>(`/posts/${postId}/likes/count`),
  comments: (postId: number, cursor?: number, isServer = false) =>
    apiFetch<CursorPage<Comment>>(`/posts/${postId}/comments${cursor ? `?cursor=${cursor}` : ''}`, {
      isServer,
    }),
  addComment: (postId: number, content: string, parentId?: number) =>
    apiFetch<Comment>(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, parentId }),
    }),
  deleteComment: (id: number) => apiFetch<void>(`/comments/${id}`, { method: 'DELETE' }),
};

// ---------- Feed ----------
export const feedApi = {
  get: (cursor?: number) =>
    apiFetch<CursorPage<Post>>(`/feed${cursor ? `?cursor=${cursor}` : ''}`),
};

// ---------- Notifications ----------
export const notificationsApi = {
  list: () => apiFetch<AppNotification[]>('/notifications'),
  unreadCount: () => apiFetch<{ count: number }>('/notifications/unread-count'),
  markAllRead: () => apiFetch<{ success: boolean }>('/notifications/read-all', { method: 'PATCH' }),
};

// ---------- Categories ----------
export const categoriesApi = {
  list: (isServer = false) =>
    apiFetch<Category[]>('/categories', { isServer, revalidate: isServer ? 300 : undefined }),
};

// ---------- Stats ----------
export const statsApi = {
  posts: () => apiFetch<PostStat[]>('/users/me/posts/stats'),
  chart: (period: '7d' | '30d' = '7d') =>
    apiFetch<ClickChart>(`/users/me/clicks/chart?period=${period}`),
};

// ---------- Search ----------
export const searchApi = {
  query: (q: string, type: 'all' | 'posts' | 'users' = 'all', isServer = false) =>
    apiFetch<{ posts: Post[]; users: UserProfile[]; meta: { page: number; limit: number } }>(
      `/search?q=${encodeURIComponent(q)}&type=${type}`,
      { isServer },
    ),
};

// ---------- Uploads ----------
export async function uploadImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/uploads/image`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) throw new ApiError('Upload ảnh thất bại', res.status);
  return res.json();
}
