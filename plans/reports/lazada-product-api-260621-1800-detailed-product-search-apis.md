# Lazada Product & Search API - Detailed Reference

## Kết luận nhanh

**KHÔNG có public search API theo keyword dành cho consumer** (không cần seller token).

- Tất cả Product API đều yêu cầu `access_token` (seller token từ OAuth)
- `GetProducts` chỉ trả về sản phẩm **trong store của seller đang đăng nhập**, không phải toàn catalog
- `GetProductItem` tương tự - cần seller token, chỉ lấy item thuộc store đó
- `searchProductWithPage` (Sponsored Solutions API) cũng cần seller token, và chỉ phục vụ mục đích chạy quảng cáo, không phải consumer search
- Chỉ có `GetCategoryTree` và `GetBrandByPages` là **No Authorization Required** (không cần seller token) - nhưng chỉ trả về taxonomy/danh mục, không phải product data

---

## Product API Endpoints

### 1. GetProducts
- **URL:** `/products/get`
- **Method:** GET
- **Mô tả:** Lấy danh sách sản phẩm của seller hiện tại (không phải toàn bộ catalog Lazada)
- **Có cần seller token?:** YES (Authorization Required)
- **Parameters:**
  - `filter` (String, No): Lọc theo status: all, live, inactive, deleted, pending, rejected, sold-out
  - `update_before` (String, No): ISO 8601 date
  - `create_before` (String, No): ISO 8601 date
  - `offset` (String, No): Deprecated, max 10000
  - `create_after` (String, No): ISO 8601 date
  - `update_after` (String, No): ISO 8601 date
  - `limit` (String, No): Max 50
  - `options` (String, No): Options=1 để lấy thêm stock info
  - `sku_seller_list` (String, No): JSON array, max 100 SKUs
- **Response:** `data` (Object) - product list
- **Endpoints:** `https://api.lazada.vn/rest`, `https://api.lazada.sg/rest`, etc.
- **Ghi chú:** Chỉ trả sản phẩm thuộc store của access_token. Không thể query toàn bộ catalog.

---

### 2. GetProductItem
- **URL:** `/product/item/get`
- **Method:** GET
- **Mô tả:** Lấy chi tiết 1 sản phẩm bằng ItemId. `seller_sku` đã bị deprecated từ 15/11/2023.
- **Có cần seller token?:** YES (Authorization Required)
- **Parameters:**
  - `item_id` (Number, Yes): Item ID - phải là item thuộc store của seller đó
  - `seller_sku` (String, No): Deprecated
- **Response:** `data` (Object) - product detail
- **Ghi chú quan trọng:** Item phải thuộc store đang đăng nhập. Nếu dùng item_id của store khác → lỗi `EDIT_ITEM_NOT_BELONG_SELLER`. KHÔNG thể query product của bất kỳ seller nào bằng item_id.

---

### 3. GetCategoryTree
- **URL:** `/category/tree/get`
- **Method:** GET
- **Mô tả:** Lấy toàn bộ cây danh mục sản phẩm của hệ thống Lazada
- **Có cần seller token?:** **NO** (No Authorization Required)
- **Parameters:**
  - `language_code` (String, No): en_US (default), en_SG, th_TH, id_ID, vi_VN, fil_PH, ms_MY
- **Response:** Cây danh mục (category taxonomy)
- **Endpoints:** Tất cả quốc gia
- **Ghi chú:** Public API - không cần access_token. Chỉ trả taxonomy, không có product data.

---

### 4. GetCategoryAttributes
- **URL:** `/category/attributes/get`
- **Method:** GET
- **Mô tả:** Lấy danh sách attributes của một category cụ thể
- **Có cần seller token?:** **NO** (No Authorization Required)
- **Parameters:**
  - `primary_category_id` (String, Yes): Category ID
  - `language_code` (String, No): Language code
- **Response:** List of attributes cho category
- **Ghi chú:** Public API - không cần access_token. Phục vụ seller khi tạo sản phẩm.

---

### 5. GetBrandByPages
- **URL:** `/category/brands/query`
- **Method:** GET/POST
- **Mô tả:** Lấy danh sách tất cả brand theo page
- **Có cần seller token?:** **NO** (No Authorization Required)
- **Parameters:**
  - `startRow` (String, Yes): Offset - số brand cần bỏ qua
  - `pageSize` (String, Yes): Số brand mỗi trang, default 40, max 200
- **Response:**
  - `data` (Object)
  - `success` (Boolean)
  - `error_code` (String)
  - `error_msg` (String)
- **Ghi chú:** Public API - không cần access_token. Chỉ trả brand list, không có product.

---

### 6. GetCategorySuggestion
- **URL:** `/product/category/suggestion/get`
- **Method:** GET
- **Mô tả:** Gợi ý category cho product dựa trên tên và hình ảnh
- **Có cần seller token?:** YES (Authorization Required)
- **Parameters:**
  - `product_name` (String, Yes): Tên sản phẩm
  - `image_url` (String, Yes): URL hình ảnh sản phẩm
- **Response:** `data` (Object) - danh sách category suggested
- **Ghi chú:** Dùng cho seller khi tạo sản phẩm, không phải consumer search.

---

### 7. GetProductContentScore
- **URL:** `/product/content/score/get`
- **Method:** GET/POST
- **Mô tả:** Lấy content score của sản phẩm
- **Có cần seller token?:** YES (Authorization Required)
- **Ghi chú:** Phục vụ seller, không phải consumer.

---

### 8. GetQCAlertProducts
- **URL:** `/product/qc/alert/list`
- **Method:** GET
- **Mô tả:** Lấy danh sách sản phẩm có QC alert
- **Có cần seller token?:** YES (Authorization Required)
- **Ghi chú:** Seller tool only.

---

## Product Review API Endpoints

### 9. GetHistoryReviewIdList
- **URL:** `/review/seller/history/list`
- **Method:** GET/POST
- **Mô tả:** Lấy danh sách review ID của seller trong 3 tháng gần nhất
- **Có cần seller token?:** YES (Authorization Required)
- **Parameters:**
  - `item_id` (String, Yes): Product Item ID
  - `order_id` (Number, No): Order ID
  - `start_time` (Number, Yes): Unix timestamp millisecond
  - `end_time` (Number, Yes): Unix timestamp millisecond (max 7 ngày từ start)
  - `current` (Number, Yes): Page number, default=1, max=50
- **Response:** `data` (Object), `success` (Boolean), `error_code`, `error_msg`
- **Ghi chú:** Chỉ lấy reviews của store seller đó, cần biết item_id trước.

---

### 10. GetReviewListByIdList
- **URL:** `/review/seller/list/v2`
- **Method:** GET
- **Mô tả:** Lấy chi tiết review theo danh sách ID
- **Có cần seller token?:** YES (Authorization Required)
- **Parameters:**
  - `id_list` (Number[], Yes): Danh sách review ID, max 10 IDs
- **Response:** `data` (Object), `success` (Boolean)
- **Ghi chú:** Phải lấy ID list từ GetHistoryReviewIdList trước. Seller-only.

---

### 11. SubmitSellerReply
- **URL:** (trong `/review/seller/reply/add`)
- **Method:** GET
- **Mô tả:** Seller reply cho review
- **Có cần seller token?:** YES
- **Ghi chú:** Seller-only management tool.

---

## Sponsored Solutions API - searchProductWithPage

### 12. searchProductWithPage
- **URL:** `/sponsor/solutions/product/searchProductWithPage`
- **Method:** GET/POST
- **Mô tả:** Search product để chọn vào chiến dịch quảng cáo (Sponsored Ads)
- **Có cần seller token?:** YES (Authorization Required)
- **Parameters:**
  - `campaignType` (Number, Yes): Loại campaign
  - `pageSize` (Number, Yes): Kích thước trang
  - `bizCode` (String, Yes): `SD` - sponsoredSearch
  - `placementList` (Number[], Yes): 3=Search Result Page, 4=Just For You Page
  - `campaignObjectLive` (Number, Yes): 1=Traffic, 2=Sales
  - `eligible` (Number, Yes): 1=eligible, 0=ineligible
  - `pageNo` (Number, Yes): Số trang
  - `maxCpc` (String, Yes): Max bid price, -1=no limit
  - `brandName` (String, No): Brand name filter
  - `productName` (String, No): Fuzzy search theo tên
  - `sellerSku` (String, No): SKU filter
  - `categoryId` (Number, No): Category ID filter
  - `itemIdBlackList` (Number[], No): Item IDs cần loại trừ
- **Response:**
  - `result` (Object[]): Product list với `productName`, `itemId`, `retailPrice`, `imageUrl`, `pdpLink`, `inventory`, `cvr`, `ipv`, etc.
  - `totalCount` (Number): Tổng số product
  - `success` (Boolean)
- **Ghi chú:** QUAN TRỌNG - Đây là API search gần nhất với consumer search nhưng:
  1. Vẫn cần seller token
  2. Chỉ search sản phẩm của chính seller đó (để chạy ads)
  3. Không phải consumer-facing search trên toàn catalog

---

## Tổng kết

| API | Cần seller token? | Search/Filter sản phẩm? | Dùng cho? |
|-----|------------------|------------------------|-----------|
| GetProducts | YES | Có (filter by status, date, SKU) | Seller quản lý sản phẩm |
| GetProductItem | YES | Không (cần biết item_id trước) | Seller xem 1 sản phẩm |
| GetCategoryTree | **NO** | Không (chỉ category names) | Public taxonomy |
| GetCategoryAttributes | **NO** | Không (chỉ attributes) | Public attributes |
| GetBrandByPages | **NO** | Không (chỉ brand list) | Public brand list |
| GetCategorySuggestion | YES | Gợi ý category (không phải search sản phẩm) | Seller khi tạo product |
| GetHistoryReviewIdList | YES | Reviews của store mình | Seller quản lý review |
| GetReviewListByIdList | YES | Reviews theo ID | Seller đọc review |
| searchProductWithPage | YES | Có (tìm sản phẩm trong store mình) | Seller chọn sản phẩm để chạy ads |

---

## Câu hỏi chưa giải đáp

1. **Lazada có API dạng public product feed/catalog không?** Không tìm thấy trong Open Platform docs. Có thể tồn tại dạng private partnership API không public.
2. **Lazada Affiliate API?** Một số affiliate platforms có product search API riêng. Cần kiểm tra Lazada Affiliate Program docs riêng.
3. **LazLive API và Content API** không expand được trong browser (có thể cần đăng nhập) - chưa xem được endpoints.
4. **Có thể scrape** thông qua Lazada mobile API (không documented) như `https://member-regional.lazada.vn/...` endpoints mà app mobile dùng, nhưng đây là undocumented/unofficial.
5. **Sponsored Solutions API** có endpoint list đầy đủ nhưng không expand được trong sidebar - chỉ tìm thấy `searchProductWithPage` qua search chức năng. Có thể còn nhiều endpoint khác.
