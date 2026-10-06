# Phase 1 — Bảo mật P0: báo cáo triển khai

Plan: `plans/261006-2207-audit-remediation/plan.md` · Nguồn: `plans/reports/code-reviewer-261006-2114-backend-audit.md`

## Phạm vi đã làm

### 1. Categories: AdminGuard + chặn mass-assignment (C1)
- `apps/backend/src/categories/categories.controller.ts`: thêm `AdminGuard` (dùng chung với moderation, `../moderation/admin.guard`) bên cạnh `JwtAuthGuard` cho POST/PATCH/DELETE. `findAll` (GET) giữ public, không guard.
- `apps/backend/src/categories/dto/update-category.dto.ts` (mới): `UpdateCategoryDto extends PartialType(CreateCategoryDto)` — thay cho `Partial<CreateCategoryDto>` (type TS, bị erase lúc runtime, không được `ValidationPipe` strip).
- `apps/backend/src/categories/dto/create-category.dto.ts`: thêm `@MaxLength` cho `name`/`icon`, `@MaxLength` + `@Matches(/^[a-z0-9-]+$/)` cho `slug` (kế thừa sang Update qua `PartialType`).
- `apps/backend/src/categories/categories.service.ts`: `create`/`update` map tường minh `{name, slug, icon, sortOrder}` vào Prisma `data`, không spread DTO/body — chặn đường tiêm nested-write Prisma (`posts.connect/update/updateMany/deleteMany`) mà audit chỉ ra.

### 2. OAuth pre-account-hijack (H1)
- `apps/backend/src/auth/strategies/google.strategy.ts`: đọc `profile._json.email_verified`, thêm field `emailVerified` vào `GoogleProfile`. Mặc định tin cậy (`true`) nếu field thiếu; chỉ `false`/`"false"` mới coi là chưa xác minh.
- `apps/backend/src/auth/auth.service.ts`:
  - `googleLogin`: nếu match theo email (chưa có `googleId`) mà Google báo `email_verified=false` → ném `BadRequestException`, không link, không tạo/sửa gì (giữ nguyên tài khoản cũ).
  - Thêm `linkOAuthAccount()` dùng chung cho Google + Facebook: nếu tài khoản match có `emailVerified=false`, set `passwordHash=null`, `tokenVersion: {increment:1}`, xoá toàn bộ `session` của user đó, rồi mới set `googleId/facebookId` + `emailVerified=true`. Nếu tài khoản đã `emailVerified=true` thì chỉ gắn provider id, không đụng password/session.
  - Facebook áp dụng cùng cơ chế hardening (không có tín hiệu `email_verified` riêng từ Facebook nên không thêm bước từ chối link).
  - Đăng nhập bằng mật khẩu cho tài khoản chưa verify **vẫn hoạt động bình thường** (không đổi `validateUser`/`login`) — đúng quyết định sản phẩm của user.

### 3. Email normalization (M3)
- `apps/backend/src/common/normalize-email.ts` (mới): `normalizeEmail()` = `trim().toLowerCase()`.
- Áp dụng trong `auth.service.ts` tại **mọi** điểm tra cứu/ghi email: `register`, `validateUser` (phục vụ cả login — xem ghi chú dưới), `googleLogin`, `facebookLogin`, `forgotPassword`, `resendVerification`.
- Quyết định kỹ thuật: chuẩn hoá ở **service layer** (không thêm `@Transform` ở DTO). Lý do: route `login` dùng `passport-local` — `LocalAuthGuard` gọi `LocalStrategy.validate()` đọc thẳng `req.body` **trước** khi `ValidationPipe`/`@Transform` của `LoginDto` chạy, nên chuẩn hoá ở DTO sẽ không áp dụng cho nhánh login. Chuẩn hoá tại service là điểm chung duy nhất bao phủ đúng mọi path kể cả login.
- Migration: `packages/database/prisma/migrations/20261006220000_normalize_user_emails/migration.sql` — lowercase+trim toàn bộ `users.email` hiện có; có `DO $$...$$` kiểm tra trùng theo `lower(trim(email))` trước, `RAISE EXCEPTION` nếu có trùng (không âm thầm merge). Giữ nguyên unique constraint hiện tại (không đổi schema.prisma, không chuyển `citext`) theo đúng yêu cầu — unique giờ hiệu quả như case-insensitive vì mọi write đã được chuẩn hoá.
  - Đã test thủ công migration trên container Postgres tạm (xem phần Kiểm thử).

### 4. Throttler double-counting (H2)
- Bỏ `@UseGuards(ThrottlerGuard)` ở route-level, giữ nguyên `@Throttle(...)`, vì `SmartThrottlerGuard` đã đăng ký global (`APP_GUARD` trong `app.module.ts`) và đọc cùng metadata `@Throttle`. Route level guard thêm vào sẽ tạo thêm một guard instance cùng tăng key `generateKey` (class+handler+tracker) → đếm đôi.
- File đã sửa: `auth/auth.controller.ts` (register, forgot-password, reset-password, resend-verification, change-password — giữ `LocalAuthGuard`/`JwtAuthGuard` riêng cho login/change-password), `posts/posts-me.controller.ts` (scrape, create), `social/reactions.controller.ts` (share — giữ `JwtAuthGuard`), `moderation/reports.controller.ts` (create).
- Đã đọc lại hành vi `ThrottlerGuard`/`APP_GUARD` qua chính comment giải thích trong `app.module.ts:149-155` (SmartThrottlerGuard là nguồn duy nhất đọc `@Throttle` cho mọi route) — khớp với kết luận audit; không cần đào thêm source `node_modules` trên server vì đã có bằng chứng rõ trong code + audit.

### 5. Dependencies
- `apps/frontend/package.json`: `next` `^15.5.7` → `^15.5.27` (bản vá bảo mật mới nhất dòng 15.5.x, công bố September 2026 security release — vá CVE-2026-94483 SSRF High + 5 Medium + 1 Low). Không có `eslint-config-next` trong repo nên không cần bump.
- `apps/backend/package.json`: bỏ `@nestjs/serve-static` (dependency chết, không import ở đâu — đã grep xác nhận; cũng là nguồn gốc lỗ hổng High `path-to-regexp`). Bump trực tiếp `multer` `^2.0.2`→`^2.3.0`, `sharp` `^0.35.3`→`^0.35.5`.
- `package.json` (root): thêm `pnpm.overrides` cho các dependency **transitive** (không phải direct dep, không an toàn để bump tay):
  `proxy-addr` (critical, IP-spoofing), `lodash`, `@nestjs/platform-express>multer` (scoped — multer bundled riêng trong `@nestjs/platform-express`, khác với multer direct dep), `minimatch@10>brace-expansion` (scoped theo parent vì `brace-expansion` có 3 major cùng tồn tại trong graph — v1.1.15/v2.1.1/v5.0.6 — override không scope sẽ ép toàn bộ lên v5 và phá consumer đang cần v1/v2), `fast-uri`, `postcss`, `socket.io-parser`, `nanoid`, `browserslist`, `engine.io`, `source-map-js`. Tất cả override đều **cùng major** với bản đang resolve (chỉ bump patch/minor).
- **Kết quả `pnpm audit --prod`** (chạy trên server, Node 22 + pnpm 10.28.2):

  | | Trước | Sau |
  |---|---|---|
  | Critical | 1 | **0** |
  | High | 36 | **1** |
  | Moderate | 19 | 9 |
  | Low | 5 | 3 |
  | Tổng | 61 | 13 |

  - High còn lại duy nhất: **`deepmerge-ts` 7.1.5 → cần ≥8.0.0** (stack exhaustion), chain: `packages/database > @prisma/client > prisma > @prisma/config > deepmerge-ts`. Đây là dependency của **Prisma CLI** (dùng lúc `prisma generate`/`migrate`), không nằm trên đường chạy request của server lúc runtime. 7→8 là **major bump** — vi phạm ràng buộc "override chỉ khi cùng major tương thích" nên **không fix**, để lại làm residual risk đã ghi nhận (sẽ tự hết khi Prisma 7/8 lên bản ổn định và ta nâng cấp Prisma theo lộ trình riêng, ngoài scope Phase 1).
  - Moderate/Low còn lại (qs, body-parser, webpack buildHttp SSRF thấp, baseline-browser-mapping...) **không đụng tới** — nằm ngoài yêu cầu acceptance (chỉ yêu cầu hết critical + giảm tối đa high); nhiều gói trong số này có nhiều major cùng tồn tại (vd. `body-parser` 1.20.4 và 2.3.0, `qs` 6.14.2 và 6.15.3) nên override không scope sẽ rủi ro, để dành cho một lượt dependency-hygiene riêng (không phải P0).

### 6. Test (vitest, theo pattern có sẵn trong `apps/backend/test/*.spec.ts`)
- `test/categories-authz.spec.ts` (mới): kiểm metadata `__guards__` có `JwtAuthGuard`+`AdminGuard` trên create/update/delete (và `findAll` không có guard); `AdminGuard.canActivate` chặn user thường/không có user, cho qua admin; `CategoriesService.create/update` chỉ forward đúng field đã khai báo, không lọt field `posts`/`isAdmin` khi body có mass-assignment payload.
- `test/oauth-account-linking.spec.ts` (mới): Google/Facebook link vào tài khoản chưa verify → xoá password, bump tokenVersion, xoá session; link vào tài khoản đã verify → không đụng password/session; Google báo `email_verified:false` → ném lỗi, không update/không xoá session; `validateUser` vẫn trả user khi `emailVerified=false` (khoá lại quyết định cho phép login chưa verify).
- `test/email-normalization.spec.ts` (mới): `normalizeEmail()` unit test; `register/validateUser/forgotPassword/resendVerification/googleLogin` đều chuẩn hoá trước khi lookup/ghi (assert trực tiếp trên mock Prisma call args).
- Không viết test riêng cho throttler double-counting (chỉ đọc code + comment trong `app.module.ts` đã đủ bằng chứng, không có pattern test đo rate-limit hit count sẵn trong repo; thêm integration test cho throttler cần Redis/thời gian thật, vượt phạm vi unit test hiện có).

## Kiểm thử & build (chạy trên `homelab:~/working-sources/shopee.review-dev`, không chạy gì trên Mac)
- `pnpm --filter @app/database build` (prisma generate + tsc): **pass**.
- `pnpm --filter @app/backend typecheck` (`tsc --noEmit`): **pass, sạch**.
- `pnpm --filter @app/backend test` (vitest): **103/103 pass** (84 baseline + 19 test mới), 12 file test.
- `pnpm --filter @app/backend lint` (= tsc, chưa có ESLint thật — tình trạng có sẵn từ trước, Phase 5 mới setup ESLint): **pass**.
- `pnpm --filter @app/backend build` (`nest build`): **pass**.
- `pnpm --filter @app/frontend build` (`next build`, xác nhận chạy Next.js 15.5.27): **pass**, 20 route generate thành công, chỉ có warning có sẵn từ trước (jose Edge Runtime, @sentry/nextjs `disableLogger` deprecation) — không liên quan thay đổi của tôi.
- `pnpm --filter @app/frontend lint` (`next lint`): **không chạy được** — repo chưa có `eslint.config`, `next lint` rơi vào wizard tương tác hỏi chọn preset ESLint (Strict/Base). Đây là vấn đề **có sẵn từ trước** (đúng như audit backend ghi nhận cho script `lint` của backend — tương tự với frontend), thuộc Phase 5 ("ESLint flat config"), không phải regression do Phase 1. Đã kill process treo, không để lại tiến trình chờ nào.
- Migration `20261006220000_normalize_user_emails`: test thủ công trên container Postgres tạm (`postgres:16-alpine`, bind `127.0.0.1:55432`, tên `shopee-phase1-pg`):
  - `prisma migrate deploy` áp toàn bộ 19 migration (kể cả migration mới) lên schema rỗng: **pass**.
  - Chèn 2 user trùng email sau khi lowercase (`Dup@Example.com` / `dup@example.com`) rồi chạy đúng đoạn `DO $$...$$` trong migration: **đúng như thiết kế, `RAISE EXCEPTION`** báo rõ số lượng trùng, không âm thầm merge.
  - Xoá data test, chèn 1 user email có khoảng trắng + hoa thường (` Carol@Example.COM `), chạy `UPDATE` của migration: kết quả `carol@example.com` — đúng.
  - Container đã `docker rm -f shopee-phase1-pg` sau khi test xong.

## Việc đã bỏ qua / để lại (và lý do)
1. **DTO-level `@Transform` cho email** — không thêm, vì chuẩn hoá ở service layer đã bao phủ đủ mọi path (kể cả login, nơi DTO transform không chạy trước khi Passport đọc `req.body`). Thêm cả hai nơi sẽ trùng lặp logic (vi phạm DRY) mà không tăng độ an toàn.
2. **Facebook `email_verified` check** — không thêm, vì `passport-facebook` không trả tín hiệu tương đương (Facebook chỉ trả email đã xác nhận bởi chính họ, và plan chỉ yêu cầu rule này riêng cho Google). Facebook vẫn được hardening đầy đủ ở bước link (xoá password/session) như Google.
3. **`deepmerge-ts` High còn sót** — cần major bump (7→8), chỉ reachable qua Prisma CLI lúc build/migrate (không phải runtime request path), để lại theo đúng ràng buộc "chỉ override cùng major".
4. **Moderate/Low còn lại trong audit** — ngoài acceptance criteria của Phase 1 (chỉ yêu cầu hết critical + giảm tối đa high), nhiều gói có nhiều major cùng tồn tại nên cần override scoped cẩn thận hơn — để dành việc dependency-hygiene cho một lượt riêng.
5. **ESLint cho frontend (`next lint` wizard)** — vấn đề có sẵn từ trước Phase 1, thuộc Phase 5.
6. Không đụng tới ban/moderation (`bannedAt`, xoá mềm...) theo đúng chỉ đạo — đó là Phase 2.

## Files đã thay đổi
```
apps/backend/package.json
apps/backend/src/auth/auth.controller.ts
apps/backend/src/auth/auth.service.ts
apps/backend/src/auth/strategies/google.strategy.ts
apps/backend/src/categories/categories.controller.ts
apps/backend/src/categories/categories.service.ts
apps/backend/src/categories/dto/create-category.dto.ts
apps/backend/src/categories/dto/update-category.dto.ts        (mới)
apps/backend/src/common/normalize-email.ts                     (mới)
apps/backend/src/moderation/reports.controller.ts
apps/backend/src/posts/posts-me.controller.ts
apps/backend/src/social/reactions.controller.ts
apps/backend/test/categories-authz.spec.ts                     (mới)
apps/backend/test/email-normalization.spec.ts                  (mới)
apps/backend/test/oauth-account-linking.spec.ts                (mới)
apps/frontend/package.json
package.json
pnpm-lock.yaml
packages/database/prisma/migrations/20261006220000_normalize_user_emails/migration.sql  (mới)
```

## Dọn dẹp môi trường
- Container Postgres tạm `shopee-phase1-pg` đã `docker rm -f` sau khi test migration.
- Không khởi động dev server nào trên Mac hay server trong phiên này (chỉ build/test/typecheck một lần, không giữ tiến trình nền).
- Clone `~/working-sources/shopee.review-dev` trên server **được giữ nguyên** cho các phase sau (không xoá).
- Chưa commit, chưa push theo đúng yêu cầu.

## Câu hỏi còn mở
1. Prod hiện có dữ liệu email nào trùng nhau sau khi lowercase không? Cần chạy thử migration (hoặc ít nhất `SELECT lower(trim(email)), count(*) FROM users GROUP BY 1 HAVING count(*)>1`) trên bản backup/staging trước khi deploy thật — chưa chạy trên dữ liệu prod thật vì đây là seed data cô lập, không đụng DB live theo đúng chỉ đạo.
2. `deepmerge-ts`/Prisma CLI major bump (6→7/8 dần) nên xếp vào phase nào (5 — Chất lượng, hay một lượt dependency-hygiene riêng)?

Status: DONE
Summary: Đã triển khai đủ 6 hạng mục Phase 1 (categories AdminGuard + chặn mass-assignment, OAuth link hardening, email normalization + migration, throttler double-count fix, Next.js + dependency audit, test mới); typecheck/test/build backend+frontend đều pass trên server, `pnpm audit --prod` giảm từ 61 xuống 13 lỗ hổng (0 critical, 1 high còn lại là dev-tool-only không thể fix trong giới hạn cùng-major).
