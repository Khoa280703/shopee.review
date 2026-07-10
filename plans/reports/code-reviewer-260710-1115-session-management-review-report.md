# Đánh giá code: Quản lý phiên đăng nhập (session management)

Commit `f34f16a` + working tree. Auth-flow, blast radius cao. Chỉ báo cáo, không sửa code.

## Phạm vi
- Backend: auth.service.ts, jwt.strategy.ts, auth.controller.ts, current-user.decorator.ts, Session model + migration
- Frontend: settings/page.tsx, lib/api.ts
- Tham chiếu: social.gateway.ts, retention.service.ts, auth.module.ts, main.ts

## Đánh giá tổng thể
Thiết kế đúng và chặt: revocation per-device hoạt động thật, ownership được scope, route ordering đúng,
logout không bao giờ fail, CSRF posture hợp lý. Không có lỗi Critical. Một khoảng trống vận hành
(sessions không được dọn) và một khoảng trống parity ở WebSocket là đáng xử lý.

---

## Critical
Không có.

## High

### H1 — Bảng `sessions` tăng vô hạn + PII (IP/UA) không có retention  [CONFIRMED]
- `auth.service.ts:89` mỗi lần login tạo 1 row; chỉ xóa khi logout/revoke/đổi mật khẩu.
- Người dùng đóng trình duyệt (không logout) → row tồn tại vĩnh viễn, kể cả sau khi JWT hết hạn 30d (`auth.module.ts:24`).
- `retention.service.ts:56-68` chỉ quét `click_logs` và `notifications`, KHÔNG đụng `sessions`.
- Hệ quả kép: (1) bảng phình không giới hạn; (2) IP/UA là PII lưu vô thời hạn — trong khi IP ở `click_logs`
  đã bị age-out sau 90d, IP session thì không (lệch chuẩn compliance nội bộ); (3) danh sách "phiên đăng nhập"
  hiển thị cả những phiên có token đã hết hạn > 30d → gây hiểu nhầm (user thấy 5 thiết bị nhưng chỉ 1 còn sống).
- Fix: thêm vào `runRetention()` một bước xóa session `createdAt < now - 30d` (khớp TTL của JWT).
  Ví dụ: `prisma.session.deleteMany({ where: { createdAt: { lt: cutoff30d } } })`.

## Medium

### M1 — WS gateway thiếu kiểm tra session revocation (parity gap)  [CONFIRMED]
- `social.gateway.ts:45-59` verify JWT trực tiếp, replicate check `tokenVersion` + `bannedAt` nhưng KHÔNG check
  session row (`sid`) tồn tại. Comment ở dòng 50-52 nói "replicate revocation checks" nhưng thực tế bỏ sót per-device revoke.
- Hệ quả: revoke 1 thiết bị qua `DELETE /auth/sessions/:id` → HTTP của thiết bị đó bị 401, nhưng WebSocket của nó
  vẫn authenticated cho tới khi JWT hết hạn 30d hoặc bump tokenVersion.
- Tác động THẤP trên thực tế: `client.data.userId` (dòng 60) hiện không gate emit nào (chỉ set, không dùng ở
  handler broadcast — room là public read-only). Nhưng đây là bug tiềm ẩn nếu sau này có emit gated theo userId.
- Fix: nếu `payload.sid` có, thêm `session.findUnique` như jwt.strategy; không có → anonymous.

### M2 — `revokeOtherSessions` fallback `?? ''` sẽ xóa CẢ phiên hiện tại  [Lý thuyết]
- `auth.service.ts:151`: `id: { not: currentSessionId ?? '' }`. Nếu `currentSessionId` undefined → không row nào có id `''`
  → deleteMany xóa TẤT CẢ phiên của user (kể cả phiên đang gọi).
- Chỉ xảy ra khi token không có `sid`. Trên thực tế mọi token mới đều có `sid` (mọi đường signing đi qua `setAuthCookie`),
  và token legacy đã bị chặn bởi mismatch `tokenVersion` (`jwt.strategy.ts:55`) trước khi tới được endpoint → không reachable.
- Vẫn nên phòng thủ: nếu `!currentSessionId` thì reject/no-op thay vì rơi vào nhánh xóa-tất-cả.

## Low

### L1 — Thêm 1 query DB mỗi request đã xác thực  [CONFIRMED, chấp nhận được]
- `jwt.strategy.ts:66` thêm `session.findUnique` (theo PK, có index) bên cạnh `user.findUnique`. Chi phí nhỏ.
- Có thể gộp: `session.findUnique({ where:{id:sid}, include:{ user:{ omit:... } } })` lấy cả hai trong 1 query
  khi có `sid`. Cải thiện biên, không bắt buộc theo YAGNI.

### L2 — Nhánh token không `sid` bỏ qua session-check  [không khai thác được]
- `jwt.strategy.ts:65` skip check khi thiếu `sid`. Không phải bypass thực: token legacy đã chết vì `tokenVersion`
  (migration bump toàn bộ user lên 1, legacy `ver` = 0). Comment giải thích đúng. Ghi nhận, không cần sửa.

### L3 — `req.ip` sau proxy  [thông tin]
- `main.ts:24` trust proxy = loopback/linklocal/uniquelocal. Nếu deploy sau CDN/LB public khác dải, `session.ip`
  có thể ghi IP proxy thay vì client. Không phải lỗi bảo mật, chỉ ảnh hưởng độ chính xác hiển thị.

---

## Các điểm đã xác minh ĐÚNG (không phải lỗi)
- **Revocation:** token có `sid`, session bị xóa → 401 (`jwt.strategy.ts:65-72`). ĐÚNG.
- **Route ordering:** `sessions/others` khai báo trước `sessions/:id` (`auth.controller.ts:200,206`) → `others`
  không bị bắt làm `:id`. ĐÚNG.
- **Ownership:** `revokeSession` scope `{id, userId}` (`auth.service.ts:141`) → user A không xóa được session user B (count 0 → 404). ĐÚNG.
- **logout OptionalJwtAuthGuard:** `handleRequest` nuốt lỗi, trả undefined (`optional-jwt-auth.guard.ts`) →
  token hết hạn/thu hồi vẫn clear cookie, logout không fail. ĐÚNG.
- **changePassword:** bump tokenVersion → deleteMany sessions → setAuthCookie (session mới, ver mới). Thứ tự ĐÚNG,
  thiết bị hiện tại giữ đăng nhập, thiết bị khác bị đá. ĐÚNG.
- **resetPassword:** xóa hết session, không tạo mới → phải đăng nhập lại mọi nơi. ĐÚNG CHỦ ĐÍCH (flow unauthenticated, comment xác nhận).
- **Frontend:** `revokeOtherSessions` giữ `s.current` (`settings/page.tsx:59`) khớp backend, không stale.
- **CSRF:** cookie `sameSite:'lax'` + httpOnly; DELETE/POST cross-site không mang cookie → state-changing được bảo vệ.
  CORS allowlist + credentials. Posture hợp lý cho cookie-auth.

## Hành động đề xuất (ưu tiên)
1. (H1) Thêm dọn session > 30d vào `runRetention()` — vừa chặn phình bảng vừa age-out PII.
2. (M1) Thêm session-check vào `social.gateway.ts` để parity với HTTP revocation.
3. (M2) Phòng thủ `revokeOtherSessions`: no-op/reject khi thiếu `currentSessionId`.
4. (L1) Cân nhắc gộp query khi có `sid` (tùy chọn).

## Câu hỏi chưa giải quyết
- Có yêu cầu compliance cụ thể về thời gian lưu IP session không? (quyết định TTL cho H1).
- WS `userId` có kế hoạch gate emit riêng-tư trong tương lai không? (nâng M1 lên nếu có).

Status: DONE_WITH_CONCERNS
Findings: Critical 0 | High 1 | Medium 2 | Low 3
