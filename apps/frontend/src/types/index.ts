export interface UserSummary {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon?: string | null;
  sortOrder?: number;
}

export interface ProductMeta {
  shopName?: string | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  discountPercent?: number | null;
  rating?: number | null;
  soldCount?: number | null;
  [key: string]: unknown;
}

export interface Post {
  id: number;
  userId: number;
  title: string;
  content?: string | null;
  productUrl: string;
  affiliateUrl: string;
  productMeta?: ProductMeta | null;
  images: string[];
  categoryId?: number | null;
  likeCount: number;
  commentCount: number;
  clickCount: number;
  shareCount?: number;
  createdAt: string;
  updatedAt?: string;
  user: UserSummary;
  category?: Category | null;
}

export interface UserProfile {
  id: number;
  username: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  totalClicks: number;
  followersCount: number;
  followingCount: number;
  totalPosts: number;
  createdAt: string;
  isFollowing: boolean;
  isSelf: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  emailVerified: boolean;
  affiliateId?: string | null;
  totalClicks: number;
  followersCount: number;
  followingCount: number;
  isAdmin?: boolean;
  createdAt: string;
}

export interface Comment {
  id: number;
  userId: number;
  postId: number;
  parentId?: number | null;
  content: string;
  createdAt: string;
  user: UserSummary;
  replies?: Comment[];
  replyCount?: number;
}

export type NotificationType = 'LIKE' | 'COMMENT' | 'FOLLOW' | 'MENTION' | 'NEW_POST';

export interface AppNotification {
  id: number;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: UserSummary;
  post?: { id: number; title: string } | null;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: number | null;
}

export interface ScrapedProduct {
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

export interface UserStats {
  totalClicks: number;
  totalPosts: number;
  followersCount: number;
  followingCount: number;
}

export interface PostStat {
  id: number;
  title: string;
  clickCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

export interface ClickChart {
  period: string;
  data: { date: string; clicks: number }[];
  total: number;
}
