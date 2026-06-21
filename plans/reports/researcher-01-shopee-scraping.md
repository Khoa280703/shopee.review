# Shopee Vietnam Scraping Research Report
**Date:** 2026-06-10 | **Status:** Complete

## 1. Shopee API v4 Endpoint Accessibility

**Finding:** The v4 API endpoint `https://shopee.vn/api/v4/item/get?itemid={id}&shopid={shop_id}` is **no longer publicly accessible** in 2025-2026.

- **Official API**: Shopee operates two distinct APIs:
  - **Open API** (OAuth 2.0): For seller integration only. Requires partner registration at https://open.shopee.com/
  - **Public API v4**: Used internally by web/mobile clients. NOT officially documented for 3rd-party use.
- **Current endpoints used by web client**: `/api/v4/pdp/get_pc`, `/api/v4/search/search_items`, `/api/v4/shop/rcmd_items`
- **Header requirements**: Dynamic headers required including `af-ac-enc-dat`, `af-ac-enc-sz-token`, `x-csrftoken`, `x-sap-access-f/s/t`, `x-sap-ri` (cryptographically signed by proprietary Shopee JS SDK running in browser)
- **Authentication**: No static bearer token available. Requires active browser session with cookies from authenticated user or SSO login.

**Recommendation:** Treat v4 API as "reverse-engineered internal API" — accessible but unsupported and fragile. Expect breaking changes with DOM/API updates.

---

## 2. Product URL Parsing

**Finding:** Two URL formats exist with consistent ID extraction.

**Standard format:**
```
https://shopee.vn/{product-name}-i.{shopid}.{itemid}
Example: https://shopee.vn/-Mã-ELMALL1TR5-giảm-8-đơn-5TR-Apple-MacBook-Air-(2020)-M1-Chip-13.3-inch-8GB-256GB-SSD-i.88201679.5873954476
Parse: shopid=88201679, itemid=5873954476
```

**Short link format:** shope.ee doesn't preserve IDs directly — requires following redirect to capture target URL before parsing.

**Parsing regex:**
```
-i\.(\d+)\.(\d+)$
Groups: (1)=shopid, (2)=itemid
```

---

## 3. Anti-Bot Measures (Critical)

**Findings:** Shopee implements sophisticated multi-layered protection:

| Layer | Details |
|-------|---------|
| **Rate Limiting** | ~100 req/min per IP/account max. Throttle to 50 req/min for safety. |
| **CAPTCHA** | reCAPTCHA v3 deployed on suspicious activity. Triggers on rapid requests or signature mismatches. |
| **IP Blocking** | Datacenter IPs auto-flagged. Residential/mobile proxies required. Geographic IP misalignment triggers scrutiny. |
| **Fingerprinting** | navigator.webdriver, DevTools detection, timezone/language mismatches, canvas fingerprinting. |
| **Signature Checks** | Proprietary Shopee JS SDK generates request signatures (`af-ac-enc-dat`). SDK runs continuously in browser. |
| **DOM Changes** | CSS selectors and API response structure change frequently (weekly/monthly) — parsing brittle. |

**No hardening possible via headers alone.** Must use browser automation.

---

## 4. Playwright vs Puppeteer Fallback

**Recommendation: Playwright (2026 standard)**

| Feature | Playwright | Puppeteer |
|---------|-----------|-----------|
| **Multi-engine** | Chrome/Firefox/WebKit | Chrome only |
| **Context isolation** | 10+ sessions/process | 1 session/process |
| **Stealth plugin** | `playwright-stealth` (maintained) | `puppeteer-extra-stealth` (deprecated Feb 2025) |
| **Anti-detection** | Better fingerprint spoofing | Outdated detection bypass |

**Implementation strategy:**
1. Launch stealth Playwright instance with fake user profile
2. Navigate to product URL, wait for JS to render
3. Intercept XHR calls to `/api/v4/pdp/get_pc` to extract JSON directly
4. Extract product data from intercepted response (avoids DOM parsing brittleness)
5. Enforce 50 req/min throttle, use rotating residential proxies

**Session reuse:** Export cookies after login, reuse in subsequent sessions to reduce login overhead.

---

## 5. Affiliate Link Format

**Status:** CONFIRMED functional in 2026

**Format:**
```
https://s.shopee.vn/an_redir?origin_link={url_encoded_product_url}&affiliate_id={YOUR_ID}&sub_id={tracking_code}
```

**Encoding:**
- URL-encode the target product link (e.g., `https://shopee.vn/product-i.123.456` → `https%3A%2F%2Fshopee.vn%2F...`)
- Append affiliate_id (from https://affiliate.shopee.vn/)
- Optional sub_id for campaign tracking (up to 5 sub_ids supported)

**Generation:** Use `/generateShortLink` endpoint via Shopee Affiliate platform UI or via reverse-engineered API calls.

---

## 6. Available Product Data Fields

**Core fields accessible via `/api/v4/pdp/get_pc`:**

```json
{
  "itemid": 5873954476,
  "shopid": 88201679,
  "name": "Product name",
  "price": 8999000,  // divide by 100000 for USD equivalent
  "original_price": 9999000,
  "currency": "₫",
  "discount": 10,
  "images": ["url1", "url2"],
  "stock": 42,
  "sold": 1250,
  "historical_sold": 5000,
  "ctime": 1620000000,  // creation timestamp
  "status": 1,
  "rating_star": 4.8,
  "comment_count": 342,
  "liked_count": 512,
  "view_count": 8900,
  "shop_detail": { "name": "", "rating": 4.7 },
  "models": [{ "modelid": "", "name": "SKU variant", "price": 8999000 }],
  "categories": ["category_id_1"],
  "brand": "Apple"
}
```

**Limitations:** Reviews/comments require pagination via separate API calls. Seller shop profile requires `/api/v4/shop/get` endpoint.

---

## Actionable Implementation Priorities

1. **Use Playwright + stealth plugin** for browser automation (mandatory)
2. **Intercept XHR requests** to API endpoints instead of scraping DOM (more stable)
3. **Session/proxy rotation:** Residential proxies + cookie reuse
4. **Rate limit enforcement:** 50 req/min hardcoded
5. **Header generation:** Replicate dynamic headers from browser network tab (consider Charted Sea third-party API for stability)
6. **Affiliate tracking:** Encode product URLs properly before redirecting

---

## Unresolved Questions

- **Charted Sea vs DIY reverse-engineering:** Is third-party API stability worth 3rd-party dependency risk?
- **Real-time inventory accuracy:** How frequently does Shopee sync product data? (affects freshness requirements)
- **Shopee Open API access:** Would registering as seller unlock official API endpoints? (requires business registration)

---

## Sources

- [Shopee API 2026 Guide - api2cart.com](https://api2cart.com/api-technology/shopee-api/)
- [Shopee Open API Documentation - banhang.shopee.vn](https://banhang.shopee.vn/edu/article/8497)
- [GitHub onlineshop - Product data collecting via v4](https://github.com/akherlan/onlineshop)
- [Anti-Bot Bypass Guide - bluetickconsultants.com](https://www.bluetickconsultants.com/how-to-scrape-shopee-at-scale-advanced-anti-bot-bypass-guide/)
- [Shopee Scraper Toolkit 2025 - kameleo.io](https://kameleo.io/blog/shopee-scraper-toolkit)
- [Ultimate Shopee Scraping Guide 2026 - pixelscan.net](https://pixelscan.net/blog/shopee-scraping-guide/)
- [Playwright vs Puppeteer 2026 - scrapewise.ai](https://scrapewise.ai/blogs/playwright-vs-puppeteer-ecommerce-scraping-2026)
- [Charted Sea Shopee Documentation](https://chartedsea.com/docs/scrapers/shopee/)
- [Shopee Affiliate Program - affiliate.shopee.vn](https://affiliate.shopee.vn/)
