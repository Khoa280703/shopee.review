# Phase 02: Auth System (Email + Google OAuth)

**Links:** [Plan Overview](plan.md) | [Phase 01](phase-01-setup-cleanup-database.md)  
**Depends on:** Phase 01

## Overview
- **Priority:** Critical
- **Status:** Pending
- **Effort:** ~1.5 ngày

Multi-user auth system với email/password + Google OAuth. JWT lưu trong **HttpOnly Cookie** (không dùng localStorage). Email/password signup yêu cầu xác minh email trước khi đăng bài. Google OAuth tự set emailVerified = true. <!-- Updated: Validation Session 1 - HttpOnly Cookie + email verification -->

## Backend: AuthModule

### Files to Create
```
apps/backend/src/auth/
├── auth.module.ts
├── auth.controller.ts        (POST /auth/register, /auth/login, /auth/google, /auth/google/callback)
├── auth.service.ts
├── strategies/
│   ├── jwt.strategy.ts       (validate JWT bearer token)
│   ├── local.strategy.ts     (email/password validation)
│   └── google.strategy.ts    (Google OAuth2)
├── guards/
│   ├── jwt-auth.guard.ts
│   ├── local-auth.guard.ts
│   └── google-auth.guard.ts
└── dto/
    ├── register.dto.ts
    └── login.dto.ts
```

### Key Implementation

**register.dto.ts**
```typescript
export class RegisterDto {
  @IsString() @MinLength(3) @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, { message: 'username chỉ dùng a-z, 0-9, dấu gạch dưới' })
  @NotIn(RESERVED_USERNAMES, { message: 'Username không khả dụng' })  // chặn từ reserved
  username: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(8)
  password: string;

  @IsString() @MinLength(2)
  displayName: string;
}
```

**Reserved username check** <!-- Updated: Validation Session 2 - reserved username blocklist -->
- Import `RESERVED_USERNAMES` từ `common/reserved-usernames.ts` (định nghĩa ở Phase 01)
- Dùng `@NotIn` của class-validator hoặc custom validator; check `username.toLowerCase()`
- Áp dụng cả khi Google OAuth tự sinh username — nếu trùng reserved hoặc đã tồn tại → append số ngẫu nhiên

**auth.service.ts** — Key methods:
```typescript
// HttpOnly Cookie: trả về void, set cookie qua Response object
async register(dto: RegisterDto, res: Response): Promise<void>
async login(user: User, res: Response): Promise<void>
async validateUser(email: string, password: string): Promise<User | null>
async googleLogin(googleUser: GoogleProfile, res: Response): Promise<void>
// googleLogin: upsert user, set emailVerified=true, set HttpOnly Cookie
async sendVerificationEmail(userId: number, email: string): Promise<void>
async verifyEmail(token: string): Promise<void>
```

**Cookie config:**
```typescript
res.cookie('auth_token', jwtToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 ngày
});
```

**Email verification flow (email/password only):**
1. Register → tạo user với `emailVerified: false` → gửi email có link `/auth/verify?token=xxx`
2. User click link → `GET /api/auth/verify?token=xxx` → set `emailVerified: true`
3. Khi tạo post, backend check `user.emailVerified` — nếu false → 403

**jwt.strategy.ts** — Đọc JWT từ cookie thay vì Authorization header:
```typescript
super({
  jwtFromRequest: ExtractJwt.fromExtractors([
    (req) => req?.cookies?.auth_token  // đọc từ HttpOnly cookie
  ]),
  secretOrKey: process.env.JWT_SECRET,
});
```
**Token expiry:** 30 ngày (access token only, không dùng refresh token cho MVP)

**Email sender:** Dùng [Resend](https://resend.com) (free tier: 3000 emails/tháng). Env var: `RESEND_API_KEY`.
<!-- Updated: Validation Session 1 - HttpOnly Cookie + email verification flow -->

### Google OAuth Setup
- Dependencies: `passport-google-oauth20`, `@nestjs/passport`
- Callback URL: `https://shopee.review/api/auth/google/callback`
- Scope: `['email', 'profile']`
- Env vars cần thêm:
  ```
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  ```

### API Endpoints
```
POST /api/auth/register       → set HttpOnly Cookie + { user }  (gửi email verify)
POST /api/auth/login          → set HttpOnly Cookie + { user }
POST /api/auth/logout         → clear cookie
GET  /api/auth/google         → redirect to Google
GET  /api/auth/google/callback → set HttpOnly Cookie → redirect to frontend
GET  /api/auth/verify?token=  → xác minh email
GET  /api/auth/me             → current user info (JWT from cookie required)
```

### Rate Limiting (throttle)
- `POST /auth/register`: 5 requests/15 minutes per IP
- `POST /auth/login`: 10 requests/15 minutes per IP

## Frontend: Auth Pages

### Files to Create
```
apps/frontend/src/app/auth/
├── login/page.tsx            (form email + password + Google button)
├── register/page.tsx         (form username + email + password + displayName)
└── callback/page.tsx         (handle OAuth redirect, store token)
```

**Token storage:** HttpOnly Cookie — JS không đọc được token, browser tự gửi cookie trong mọi request.  
**Auth state:** React context `AuthContext` với `user`, `logout()` (không có `token` vì không accessible từ JS)

```
apps/frontend/src/lib/
├── auth-context.tsx          (AuthProvider, useAuth hook — fetch /api/auth/me để lấy user)
└── api.ts                    (cập nhật: thêm credentials: 'include' thay vì Authorization header)
```

**API calls:** Tất cả fetch cần `credentials: 'include'` để gửi cookie:
```typescript
fetch('/api/...', { credentials: 'include' })
```

### Route Protection
- Tạo `middleware.ts` ở root `apps/frontend/src/`
- Protected routes: `/create`, `/feed`, `/dashboard`, `/settings`
- Check bằng cách gọi `/api/auth/me` — nếu 401 → redirect `/auth/login`
<!-- Updated: Validation Session 1 - HttpOnly Cookie, credentials:include, no localStorage -->

## Environment Variables (mới)
```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
FRONTEND_URL=http://localhost:5166
```

## Todo
- [ ] Install deps: `@nestjs/passport`, `passport`, `passport-local`, `passport-jwt`, `passport-google-oauth20`, `bcrypt`, `resend`, `cookie-parser`
- [ ] Enable `cookie-parser` middleware trong `main.ts`
- [ ] Tạo `AuthModule` với 3 strategies (jwt đọc từ cookie)
- [ ] Implement register → set HttpOnly cookie + gửi email verify
- [ ] Implement `GET /auth/verify` → set emailVerified=true
- [ ] Implement login → set HttpOnly cookie
- [ ] Implement logout → clear cookie
- [ ] Implement Google OAuth → set HttpOnly cookie + emailVerified=true
- [ ] Frontend: login/register pages (không cần handle token)
- [ ] Frontend: AuthContext fetch `/auth/me` để lấy user state
- [ ] Frontend: tất cả fetch dùng `credentials: 'include'`
- [ ] Frontend: middleware.ts redirect dựa trên `/auth/me` response
- [ ] Test: đăng ký email → nhận email verify → click link → đăng bài được
- [ ] Test: đăng nhập Google OAuth → cookie set → `/auth/me` trả user

## Success Criteria
- Đăng ký email/password → nhận email → verify → cookie set → `/api/auth/me` thành công
- Đăng nhập Google OAuth → cookie set, emailVerified=true tự động
- HttpOnly Cookie: không thể đọc từ JS (kiểm tra trong DevTools)
- Routes protected hoạt động đúng (redirect dựa trên /auth/me)
- Rate limiting chặn brute force
