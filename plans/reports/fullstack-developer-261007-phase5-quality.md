# Phase 5 — Chất lượng: ESLint, test, CI

**Plan:** `plans/261006-2207-audit-remediation/plan.md` (phase 5/6)
**Commit base:** `1170b8f` (master)
**Môi trường verify:** server clone `~/working-sources/shopee.review-dev` (homelab), throwaway Postgres `127.0.0.1:55432` (removed sau khi xong)

## Tóm tắt

Thay lint giả (tsc) bằng ESLint 9 flat config thật cho cả backend + frontend, thêm Vitest + Testing Library cho frontend, thêm 5 file test backend cho các module chưa có test thật (posts/users/uploads/search/notifications), cập nhật CI để chạy lint+typecheck+test+build. `pnpm lint/typecheck/test/build` đều xanh từ clean install trên server. Không commit/push — để orchestrator duyệt.

## 1. ESLint

### Backend (`apps/backend/eslint.config.mjs`)
- ESLint 9 flat config, `typescript-eslint` recommended + vài rule type-aware rẻ (`no-floating-promises`, `no-misused-promises`, `await-thenable`) thay vì bật toàn bộ `recommendedTypeChecked` (quá nặng để dọn sạch trong 1 lần trên codebase 100+ file).
- Parser dùng `tsconfig.spec.json` có sẵn trong repo (file rác từ scaffold Nest CLI, chưa ai dùng) — sửa nó thay vì tạo file tsconfig song song: thêm `"exclude": []` (base `tsconfig.json` loại trừ `test/**`, kế thừa `extends` nên ghi đè `include` không tự xoá `exclude` kế thừa — đây là lý do mọi file `.spec.ts` ban đầu bị ESLint báo "not found in project") và mở rộng `"types"` thành `["node","vitest","express","multer"]` (thiếu `express`/`multer` làm mất ambient `Express.Multer.File`).
- Test files được nới `no-explicit-any` vì mock Prisma cố ý ép kiểu lỏng (`as never`), không phải cẩu thả.

### Frontend (`apps/frontend/eslint.config.mjs`)
- `FlatCompat` bọc `next/core-web-vitals` + `next/typescript` (cách chính thức Next.js khuyến nghị cho ESLint 9 flat config — xem Next.js discussion #71806) thay vì tự ráp `@next/eslint-plugin-next` thủ công.
- Scope còn lại `src/**/*.{js,jsx,ts,tsx}` — các file cấu hình root (`next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`, sentry config...) không nằm trong `tsconfig.json include` nên type-aware parser sẽ lỗi "not in project"; giữ nguyên hiện trạng (chúng cũng chưa từng được `next lint`/tsc kiểm tra trước đây).

### Lỗi/cảnh báo lint thật đã sửa
- `apps/frontend/src/app/admin/page.tsx`: 2 lỗi `react/no-unescaped-entities` (dấu `"` thô trong JSX quanh `r.detail`) → escape bằng `&quot;`.
- `apps/frontend/src/lib/safe-next.ts`: 1 cảnh báo "unused eslint-disable directive" — comment `eslint-disable-next-line no-control-regex` từ code cũ không còn tác dụng dưới config mới (rule đó không nằm trong `next/core-web-vitals`/`next/typescript`) → xoá, giữ nguyên comment giải thích ý định.
- `apps/backend/src/social/social.service.ts`: 2 cảnh báo `no-unused-vars` (destructure `deletedById`, `deleteReason` cố ý loại khỏi response nhưng không dùng tên) → đổi tên có tiền tố `_` giữ nguyên hành vi.

### Lỗi type thật bị phát hiện (chỉ lộ ra sau khi đưa `test/**` vào typecheck)
Trước phase này `tsc -p tsconfig.json` loại trừ `test/**`, nên các lỗi type sau tồn tại âm thầm nhiều tuần, không được CI hay editor bắt:
- `test/categories-authz.spec.ts` (2 chỗ): ép kiểu `Prisma__CategoryClient<...> as Promise<{data:...}>` không đủ overlap (TS2352) → sửa thành `as unknown as Promise<...>` theo đúng gợi ý của TS.
- `test/scraper.spec.ts`: object literal mock `{ scrapeProduct: ... }` thiếu field so với `ShopeeApiScraper` thật (TS2345) → ép kiểu qua `unknown`/`never`, import type `ShopeeApiScraper`.
- `test/social-engagement.spec.ts`: gán `prisma.user = {...}` sau khi destructure nhưng type suy ra của mock không có field `user` → thêm `user: { findUnique: vi.fn() }` mặc định vào mock gốc.

Không phải lỗi production — nhưng là bằng chứng rõ việc "lint giả = chỉ chạy tsc trên src" đã bỏ sót toàn bộ test suite khỏi type safety.

## 2. Test frontend (Vitest + Testing Library)

- Thêm `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` vào `apps/frontend/package.json`.
- `vitest.config.ts`: environment `jsdom` (gộp luôn test node-only cũ `safe-next.test.ts`, không cần tách), `setupFiles` trỏ `src/test/vitest-setup.ts` (đăng ký jest-dom matcher + `afterEach(cleanup)` — **bắt buộc** vì dự án dùng import tường minh `describe/it/expect` thay vì `test.globals: true`, nên auto-cleanup mặc định của Testing Library không tự gắn được, gây DOM rò rỉ giữa các test trong cùng file — bug thật tôi gặp và sửa khi chạy lần đầu, biểu hiện là `getByRole('button')` tìm thấy nhiều button từ các lần render trước).
- `src/test/render.tsx`: helper `renderWithProviders` bọc `NextIntlClientProvider` (messages `vi.json`, `now` cố định để tắt cảnh báo `ENVIRONMENT_FALLBACK` của next-intl) + `QueryClientProvider` (retry tắt).

7 file test mới, 30 test case (cộng 8 test `safe-next` có sẵn = 38 tổng):
- `follow-button.test.tsx` (5): server-state không fetch thêm, optimistic toggle, rollback khi lỗi, redirect login khi chưa đăng nhập, ẩn nút trên profile của chính mình.
- `bookmark-button.test.tsx` (3): gửi đúng state đích (idempotent set, không phải toggle cờ), 2 click nhanh gửi đúng 2 state khác nhau, rollback + toast khi lỗi.
- `reaction-button.test.tsx` (4): tin viewer state từ server (không gọi `reactionStatus` — N+1 fix), fallback tự fetch khi thiếu state, tap bật LIKE tăng đếm optimistic, tap lại tắt giảm đếm.
- `comments-section.test.tsx` (6): loading → list, empty state, IME `isComposing` chặn Enter nhưng Enter thường gửi được, gửi thành công chỉ thêm đúng 1 bình luận + xoá input, giữ nguyên text khi gửi lỗi, placeholder "Bình luận đã bị xoá." cho comment cha đã xoá còn reply sống (ẩn nút Xoá/Trả lời).
- `load-more-posts.test.tsx` (4): skeleton khi loading, error kèm nút thử lại (không fallback về "chưa có bài" như bug H3 cũ), `emptyState` chỉ hiện khi loaded+rỗng thật, render đúng danh sách khi có dữ liệu.
- `home-feed-tabs.test.tsx` (3): tab mặc định dùng nguồn explore SSR-seed, tab Following khi chưa đăng nhập hiện CTA login không gọi API feed, khi đã đăng nhập gọi nguồn feed kèm empty-state fallback.
- `admin-page.test.tsx` (5): redirect non-admin, huỷ `window.confirm` → không gọi API xoá bài, xác nhận → gọi đúng API + reload danh sách, action ban user dùng đúng message confirm riêng, resolve report không cần confirm.

## 3. Test backend (module chưa có test thật)

5 file mới, 44 test case (tổng backend 202 test / 20 file, từ 84/9 trước phase này — phần chênh còn lại do Phase 1–3 bổ sung):
- `posts-crud.spec.ts` (8): `create()` chặn chưa xác minh email, chặn URL không phải Shopee (product/affiliate) trước khi đụng DB, tạo thành công kèm fan-out notification; `update()` chặn sửa bài người khác, 404 bài đã xoá mềm, re-validate URL khi đổi, cập nhật đúng khi hợp lệ.
- `users-profile.spec.ts` (8): `findByUsername` 404 user bị ban với người ngoài nhưng tự xem được, 404 khi 2 bên block nhau, trả `isFollowing` đúng; `updateProfile` chỉ ghi field được gửi; `searchUsers` loại user bị ban qua SQL, trả rỗng khi query trống; `deleteAccount` xoá cứng đúng user.
- `uploads-validation.spec.ts` (11): `sniffImageType` nhận diện đúng magic bytes JPEG/PNG/GIF/WEBP, trả null cho nội dung giả (SVG/HTML giả dạng ảnh) và buffer quá ngắn; controller chặn MIME khai báo ngoài allow-list, chặn nội dung không phải ảnh dù MIME khai báo hợp lệ, **chuẩn hoá MIME khai báo sai lệch về đúng loại thật** (hành vi thật của code — không reject, mà sửa nhãn), upload thành công với ảnh JPEG/PNG thật (dùng `sharp` dựng ảnh decode được, không chỉ magic bytes giả).
- `search-fallback.spec.ts` (9): query rỗng không đụng Meili/Postgres; dùng hit Meili rồi lọc lại qua `VISIBLE_POST_WHERE` làm lưới chặn cuối (id đã bị xoá/ban trong Postgres nhưng còn trong index Meili bị loại âm thầm); fallback Postgres FTS khi Meili throw hoặc khi bị tắt; tìm user qua `UsersService` (đã tự loại user bị ban); `MeilisearchService.indexPost` xoá khỏi index (không index lại) bài đã xoá mềm hoặc tác giả bị ban, index bình thường bài hợp lệ, no-op khi bài không còn tồn tại.
- `notifications-delivery.spec.ts` (8): `markRead` 404 khi không phải chủ sở hữu; `unreadCount`/`markAllRead` đúng where-clause; `fanoutNewPost` no-op khi không follower, insert `createMany` inline khi follower ít, chuyển sang queue khi vượt ngưỡng, không throw ra ngoài khi DB lỗi (best-effort).

## 4. CI (`.github/workflows/ci.yml`)

- Thêm bước `pnpm --filter @app/backend lint` và `pnpm --filter @app/frontend lint` (trước `typecheck`).
- Thêm bước `pnpm --filter @app/frontend test` (trước đây chỉ backend test chạy trong CI).
- Giữ nguyên style cũ (step riêng theo từng gói, không gộp qua `turbo` trong CI để log lỗi rõ theo từng bước); giữ nguyên job `frontend-image-guard` và `integration-db` (drift-check) không đổi.
- `actions/setup-node@v4` với `cache: pnpm` đã cache pnpm store sẵn — không cần thêm action cache riêng.
- Đã validate cú pháp bằng `actionlint` (qua Docker `rhysd/actionlint`) trên server — **0 lỗi**.

## 5. Root scripts / turbo

- `apps/backend/package.json`: `lint` → `eslint .`; `typecheck` → `tsc -p tsconfig.spec.json --noEmit` (mở rộng từ `tsconfig.json` để phủ luôn `test/**`, lý do ở mục 1).
- `apps/frontend/package.json`: `lint` → `eslint .` (bỏ `next lint || tsc --noEmit` đã deprecated).
- `turbo.json` không cần đổi — task `lint`/`typecheck`/`test` đã tồn tại đúng kiểu `dependsOn: ["^build"]`.
- `pnpm-lock.yaml`: cập nhật (thêm eslint 9, typescript-eslint, eslint-config-next, @testing-library/*, jsdom + transitive deps). **Đã copy lockfile mới về Mac** và verify `pnpm install --frozen-lockfile` sạch trên server từ `node_modules` xoá trắng.

## Kết quả verify (server clone, clean install)

| Lệnh | Kết quả |
|---|---|
| `pnpm install --frozen-lockfile` (từ `node_modules` xoá trắng) | ✅ |
| `pnpm lint` (turbo, cả 3 gói) | ✅ |
| `pnpm typecheck` (turbo, cả 3 gói) | ✅ |
| `pnpm test` (turbo, cả 3 gói) | ✅ backend 202/202, frontend 38/38, database (typecheck) ✅ |
| `pnpm build` (turbo, cả 3 gói) | ✅ (~73s) |
| `prisma migrate deploy` + `prisma migrate diff --exit-code` trên Postgres throwaway `127.0.0.1:55432` | ✅ "No difference detected" |
| `actionlint` (docker) trên `ci.yml` | ✅ 0 lỗi |

Cảnh báo không chặn build, đã biết từ trước (không thuộc scope phase 5, ghi lại để không nhầm là lỗi mới):
- `next build`: "The Next.js plugin was not detected in your ESLint configuration" — cảnh báo cosmetic đã biết với setup `FlatCompat` (xem Next.js discussion #71806); `next/core-web-vitals`/`next/typescript` vẫn hoạt động thật (đã tự xác nhận qua `eslint .` độc lập bắt được 2 lỗi thật ở admin/page.tsx).
- `jose`/Edge Runtime `DecompressionStream` warning — đã ghi nhận trong báo cáo audit toolchain trước, không thuộc scope.

## Dọn dẹp

- Container Postgres throwaway `shopee-ci-pg` đã `docker rm -f`.
- File tạm `/tmp/ci.yml` trên server đã xoá.
- Không có process nền nào còn chạy.

## File đã sửa/thêm

Sửa: `.github/workflows/ci.yml`, `apps/backend/package.json`, `apps/backend/src/social/social.service.ts`, `apps/backend/test/categories-authz.spec.ts`, `apps/backend/test/scraper.spec.ts`, `apps/backend/test/social-engagement.spec.ts`, `apps/backend/tsconfig.spec.json`, `apps/frontend/package.json`, `apps/frontend/src/app/admin/page.tsx`, `apps/frontend/src/lib/safe-next.ts`, `apps/frontend/vitest.config.ts`, `pnpm-lock.yaml`.

Thêm: `apps/backend/eslint.config.mjs`, `apps/backend/test/{notifications-delivery,posts-crud,search-fallback,uploads-validation,users-profile}.spec.ts`, `apps/frontend/eslint.config.mjs`, `apps/frontend/src/app/admin/admin-page.test.tsx`, `apps/frontend/src/components/post/{home-feed-tabs,load-more-posts}.test.tsx`, `apps/frontend/src/components/social/{bookmark-button,comments-section,follow-button,reaction-button}.test.tsx`, `apps/frontend/src/test/{render.tsx,vitest-setup.ts}`.

## Câu hỏi mở

Không có.

Status: DONE
Summary: ESLint 9 flat config thật cho backend+frontend (thay lint giả bằng tsc), thêm 30 test component frontend (Vitest+Testing Library) và 44 test backend cho posts/users/uploads/search/notifications, CI thêm lint+frontend test; `pnpm lint/typecheck/test/build` xanh từ clean install trên server, `actionlint` 0 lỗi, drift-check Postgres OK.
