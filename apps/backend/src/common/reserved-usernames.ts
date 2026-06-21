export const RESERVED_USERNAMES = [
  'create',
  'feed',
  'search',
  'dashboard',
  'settings',
  'auth',
  'admin',
  'api',
  'r',
  'login',
  'register',
  'logout',
  'verify',
  'about',
  'help',
  'explore',
  'notifications',
  'u',
  'category',
  'terms',
  'privacy',
  'contact',
  'support',
  'static',
  '_next',
];

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.includes(username.toLowerCase());
}
