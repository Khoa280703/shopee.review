import { API_INTERNAL_URL, API_URL } from './constants';
import type {
  AppNotification,
  AuthSession,
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
  UserSummary,
} from '@/types';

function baseUrl(isServer: boolean) {
  return isServer ? API_INTERNAL_URL : API_URL;
}

interface FetchOptions extends RequestInit {
  isServer?: boolean;
  revalidate?: number;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  // `headers` is pulled out of `init` here (not left for the trailing `...init`
  // spread below) — otherwise that spread re-adds the UNMERGED original
  // `init.headers`, silently discarding the Content-Type/Cookie merge just
  // built below (a real bug: see git history for the "apiFetch header
  // override trap").
  const { isServer = false, revalidate, headers: extraHeaders, ...init } = options;
  const headers: Record<string, string> = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(extraHeaders as Record<string, string> | undefined),
  };
  // Forward the visitor's own session cookie on SSR calls so viewer-specific
  // fields (e.g. the profile endpoint's `isFollowing`) are correct on first
  // paint instead of always rendering as anonymous (FE audit H1). Only set
  // when a cookie actually exists so anonymous/crawler SSR — the overwhelming
  // majority of traffic on cached routes like post detail/trending — keeps
  // using Next's fetch Data Cache untouched below.
  let forwardedCookie = false;
  if (isServer) {
    const { cookies } = await import('next/headers');
    const cookieHeader = (await cookies()).toString();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
      forwardedCookie = true;
    }
  }
  const res = await fetch(`${baseUrl(isServer)}${path}`, {
    credentials: 'include',
    headers,
    ...(revalidate !== undefined ? { next: { revalidate } } : {}),
    // A cookie-bearing request is viewer-specific — Next's fetch Data Cache
    // key doesn't include headers, so caching it (even for a `revalidate`
    // caller like postsApi.get) would serve one user's response to another.
    // Default to no-store whenever a cookie went out; `...init` below can
    // still override it if a caller ever has a deliberate reason to.
    ...(forwardedCookie ? { cache: 'no-store' as const } : {}),
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
  forgotPassword: (email: string) =>
    apiFetch<{ success: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    apiFetch<{ success: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  resendVerification: (email: string) =>
    apiFetch<{ success: boolean }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  googleUrl: () => `${API_URL}/auth/google`,
  facebookUrl: () => `${API_URL}/auth/facebook`,
  sessions: () => apiFetch<AuthSession[]>('/auth/sessions'),
  revokeSession: (id: string) =>
    apiFetch<{ success: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () =>
    apiFetch<{ count: number }>('/auth/sessions/others', { method: 'DELETE' }),
};

// ---------- Posts ----------
export const postsApi = {
  list: (params: Record<string, string | number | undefined> = {}, isServer = false) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && sp.set(k, String(v)));
    // no-store on the server: the feed is dynamic and must never be served from a
    // stale Next data-cache entry (a cached-empty result would stick past a seed).
    return apiFetch<CursorPage<Post>>(`/posts?${sp}`, {
      isServer,
      cache: isServer ? 'no-store' : undefined,
    });
  },
  explore: (offset = 0, categoryId?: number, isServer = false) => {
    const sp = new URLSearchParams({ offset: String(offset), limit: '20' });
    if (categoryId) sp.set('categoryId', String(categoryId));
    return apiFetch<CursorPage<Post>>(`/posts/explore?${sp}`, {
      isServer,
      cache: isServer ? 'no-store' : undefined,
    });
  },
  trending: (isServer = false) =>
    apiFetch<Post[]>('/posts/trending', { isServer, revalidate: isServer ? 60 : undefined }),
  get: (id: number, isServer = false) =>
    apiFetch<Post>(`/posts/${id}`, { isServer, revalidate: isServer ? 30 : undefined }),
  // Backend may respond synchronously (ScrapedProduct) or async ({ jobId }).
  // When async (queue enabled), poll the status endpoint until completion.
  scrape: async (url: string): Promise<ScrapedProduct> => {
    const res = await apiFetch<ScrapedProduct | { jobId: string }>('/posts/scrape', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    if (!('jobId' in res)) return res;

    const jobId = res.jobId;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      const status = await apiFetch<{
        status: string;
        data?: ScrapedProduct;
        error?: string;
      }>(`/posts/scrape/${jobId}`);
      if (status.status === 'completed' && status.data) return status.data;
      if (status.status === 'failed') {
        throw new Error(status.error || 'Không lấy được thông tin sản phẩm');
      }
    }
    throw new Error('Quá thời gian chờ lấy thông tin sản phẩm');
  },
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
  posts: (username: string, cursor?: number, isServer = false, hasProduct?: boolean) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', String(cursor));
    if (hasProduct) params.set('hasProduct', 'true');
    const qs = params.toString();
    return apiFetch<CursorPage<Post>>(`/users/${username}/posts${qs ? `?${qs}` : ''}`, { isServer });
  },
  updateMe: (data: { displayName?: string; bio?: string; avatarUrl?: string; affiliateId?: string }) =>
    apiFetch<AuthUser>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  stats: () => apiFetch<UserStats>('/users/me/stats'),
  deleteAccount: () => apiFetch<{ success: boolean }>('/users/me', { method: 'DELETE' }),
};

// ---------- Social ----------
export type ReactionKind = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY';

export const socialApi = {
  followStatus: (username: string) =>
    apiFetch<{ following: boolean }>(`/users/${username}/follow-status`),
  follow: (username: string) =>
    apiFetch<{ following: boolean }>(`/users/${username}/follow`, { method: 'POST' }),
  unfollow: (username: string) =>
    apiFetch<{ following: boolean }>(`/users/${username}/follow`, { method: 'DELETE' }),
  react: (postId: number, type: ReactionKind) =>
    apiFetch<{ type: ReactionKind | null; counts: Record<string, number> }>(
      `/posts/${postId}/reactions`,
      { method: 'PUT', body: JSON.stringify({ type }) },
    ),
  reactionStatus: (postId: number) =>
    apiFetch<{ type: ReactionKind | null; counts: Record<string, number> }>(
      `/posts/${postId}/reactions/me`,
    ),
  // Idempotent set (not a toggle — FE audit H2): the caller states the
  // desired end state, so a stale client can never flip it the wrong way.
  bookmarkStatus: (postId: number) =>
    apiFetch<{ bookmarked: boolean }>(`/posts/${postId}/bookmark`),
  setBookmark: (postId: number, bookmarked: boolean) =>
    apiFetch<{ bookmarked: boolean }>(`/posts/${postId}/bookmark`, {
      method: 'PUT',
      body: JSON.stringify({ bookmarked }),
    }),
  bookmarks: (cursor?: number) =>
    apiFetch<CursorPage<Post>>(`/me/bookmarks${cursor ? `?cursor=${cursor}` : ''}`),
  share: (postId: number) =>
    apiFetch<{ shareCount: number }>(`/posts/${postId}/share`, { method: 'POST' }),
  comments: (postId: number, cursor?: number, isServer = false) =>
    apiFetch<CursorPage<Comment>>(`/posts/${postId}/comments${cursor ? `?cursor=${cursor}` : ''}`, {
      isServer,
    }),
  replies: (postId: number, parentId: number, cursor?: number) =>
    apiFetch<CursorPage<Comment>>(
      `/posts/${postId}/comments/${parentId}/replies${cursor ? `?cursor=${cursor}` : ''}`,
    ),
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
  list: (cursor?: number) =>
    apiFetch<CursorPage<AppNotification>>(
      `/notifications${cursor ? `?cursor=${cursor}` : ''}`,
    ),
  unreadCount: () => apiFetch<{ count: number }>('/notifications/unread-count'),
  markAllRead: () => apiFetch<{ success: boolean }>('/notifications/read-all', { method: 'PATCH' }),
  markRead: (id: number) =>
    apiFetch<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
};

// ---------- Categories ----------
export const categoriesApi = {
  // Categories change rarely (admin-managed) — cache 1h server-side to cut
  // backend load on every SSR page. On-demand tag revalidation isn't used: the
  // app's mutations go client→NestJS directly (bypassing Next), so revalidateTag
  // has nothing to hook; a short time window is the pragmatic, correct choice.
  list: (isServer = false) =>
    apiFetch<Category[]>('/categories', { isServer, revalidate: isServer ? 3600 : undefined }),
};

// ---------- Stats ----------
export const statsApi = {
  posts: () => apiFetch<PostStat[]>('/users/me/posts/stats'),
  chart: (period: '7d' | '30d' = '7d') =>
    apiFetch<ClickChart>(`/users/me/clicks/chart?period=${period}`),
};

// ---------- Moderation ----------
export type ReportTargetType = 'POST' | 'COMMENT' | 'USER';
export type ReportReason = 'SPAM' | 'SCAM' | 'OFFENSIVE' | 'FAKE' | 'OTHER';

export const moderationApi = {
  report: (targetType: ReportTargetType, targetId: number, reason: ReportReason, detail?: string) =>
    apiFetch<{ success: boolean }>('/reports', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId, reason, detail }),
    }),
  block: (username: string) =>
    apiFetch<{ blocked: boolean }>(`/users/${username}/block`, { method: 'POST' }),
  unblock: (username: string) =>
    apiFetch<{ blocked: boolean }>(`/users/${username}/block`, { method: 'DELETE' }),
  listBlocked: () =>
    apiFetch<{ username: string; displayName: string; avatarUrl: string | null }[]>('/me/blocks'),
};

// ---------- Admin ----------
export interface AdminReport {
  id: number;
  targetType: ReportTargetType;
  targetId: number;
  reason: ReportReason;
  detail: string | null;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  reporter: { username: string; displayName: string };
}

export interface DeletedPost {
  id: number;
  title: string;
  deletedAt: string;
  deleteReason: string | null;
  user: UserSummary;
  deletedBy: { username: string; displayName: string } | null;
}

export interface DeletedComment {
  id: number;
  content: string;
  postId: number;
  deletedAt: string;
  deleteReason: string | null;
  user: UserSummary;
  deletedBy: { username: string; displayName: string } | null;
}

export interface LockedUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  suspendedAt: string | null;
  bannedAt: string | null;
}

export const adminApi = {
  listReports: (status = 'PENDING') =>
    apiFetch<AdminReport[]>(`/admin/reports?status=${status}`),
  resolveReport: (id: number, status: 'RESOLVED' | 'DISMISSED') =>
    apiFetch<{ success: boolean }>(`/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  deletePost: (id: number, reason?: string) =>
    apiFetch<{ success: boolean }>(`/admin/posts/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  restorePost: (id: number) =>
    apiFetch<{ success: boolean }>(`/admin/posts/${id}/restore`, { method: 'POST' }),
  deleteComment: (id: number, reason?: string) =>
    apiFetch<{ success: boolean }>(`/admin/comments/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  restoreComment: (id: number) =>
    apiFetch<{ success: boolean }>(`/admin/comments/${id}/restore`, { method: 'POST' }),
  listDeletedPosts: (cursor?: number) =>
    apiFetch<CursorPage<DeletedPost>>(`/admin/posts/deleted${cursor ? `?cursor=${cursor}` : ''}`),
  listDeletedComments: (cursor?: number) =>
    apiFetch<CursorPage<DeletedComment>>(`/admin/comments/deleted${cursor ? `?cursor=${cursor}` : ''}`),
  suspendUser: (id: number) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/suspend`, { method: 'POST' }),
  unsuspendUser: (id: number) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/unsuspend`, { method: 'POST' }),
  banUser: (id: number) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/ban`, { method: 'POST' }),
  unbanUser: (id: number) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/unban`, { method: 'POST' }),
  listLockedUsers: (cursor?: number) =>
    apiFetch<CursorPage<LockedUser>>(`/admin/users/locked${cursor ? `?cursor=${cursor}` : ''}`),
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
