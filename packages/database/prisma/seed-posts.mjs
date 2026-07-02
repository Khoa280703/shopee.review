import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://shopee_review:shopee_review_dev@localhost:65432/shopee_review' } },
});

// Picsum photos — stable URLs by ID
const img = (id, w = 800, h = 600) => `https://picsum.photos/id/${id}/${w}/${h}`;

const USERS = [2, 3, 4, 5, 6, 7, 8]; // existing user IDs

// Category IDs will be fetched from DB
let cats = {};

// ─── Post templates ────────────────────────────────────────────────────────────

const POSTS = [
  // ── Type 1: Discussion — có ảnh ───────────────────────────────────────────
  {
    type: 'discussion-with-images',
    title: 'Mọi người hay mua đồ online hay offline? Tôi thấy online tiện hơn nhiều',
    content: 'Từ ngày có Shopee với Lazada tôi hầu như không đi mall nữa. Giao hàng nhanh, giá tốt, lại có đánh giá của người mua trước. Nhược điểm duy nhất là không cầm sờ được sản phẩm trước khi mua 😅\n\nCác bạn thường mua loại gì online? Mình hay mua đồ gia dụng nhỏ với quần áo.',
    images: [img(1081), img(433), img(447)],
    catSlug: 'khac',
    productUrl: '',
    affiliateUrl: '',
    productMeta: null,
  },
  {
    type: 'discussion-with-images',
    title: 'Chia sẻ setup góc học tập của mình — chi phí dưới 2 triệu',
    content: 'Mình vừa sắp xếp lại góc học tập cuối tuần rồi. Tổng chi phí khoảng 1.8 triệu bao gồm đèn bàn, kệ sách mini và tấm lót bàn. Đèn mua trên Shopee giá 250k, chất lượng ổn lắm, ánh sáng vàng ấm không gây mỏi mắt.\n\nNếu bạn cần link sản phẩm cụ thể thì comment nhé mình tag cho!',
    images: [img(3184), img(1166)],
    catSlug: 'gia-dung',
    productUrl: '',
    affiliateUrl: '',
    productMeta: null,
  },
  {
    type: 'discussion-with-images',
    title: 'Trải nghiệm đặt đồ ăn qua Shopee Food — lần đầu thử',
    content: 'Hôm qua thử đặt bún bò qua Shopee Food lần đầu. Giao trong 25 phút, đồ ăn còn nóng, bao bì gọn gàng. Giá bằng đặt trực tiếp không bị mark up.\n\nChỉ tội app hơi lag lúc thanh toán. Nhìn chung 7/10, sẽ dùng lại.',
    images: [img(292), img(431)],
    catSlug: 'do-an',
    productUrl: '',
    affiliateUrl: '',
    productMeta: null,
  },
  {
    type: 'discussion-with-images',
    title: 'Skin care routine buổi tối của mình — đơn giản mà hiệu quả',
    content: 'Mình đang dùng routine 4 bước: tẩy trang → rửa mặt → serum HA → kem dưỡng ẩm. Không có gì fancy cả, toàn đồ bình dân nhưng da thật sự cải thiện rõ rệt sau 1 tháng.\n\nKey là phải consistent, dùng đều đặn mỗi tối.',
    images: [img(3762), img(3762, 400, 400)],
    catSlug: 'lam-dep',
    productUrl: '',
    affiliateUrl: '',
    productMeta: null,
  },

  // ── Type 2: Discussion — không ảnh ────────────────────────────────────────
  {
    type: 'discussion-no-images',
    title: 'Tips nhận voucher Shopee mà ít người biết',
    content: 'Trick nhỏ mình học được: vào game Shopee hằng ngày để tích xu, sau đó đổi xu lấy voucher freeship hoặc giảm giá 50k. Mỗi ngày mất khoảng 5 phút mà tiết kiệm được kha khá.\n\nNgoài ra hay check tab Flash Sale lúc 12h trưa và 20h tối — thường có deal cực tốt.',
    images: [],
    catSlug: 'khac',
    productUrl: '',
    affiliateUrl: '',
    productMeta: null,
  },
  {
    type: 'discussion-no-images',
    title: 'Hỏi: Mọi người có kinh nghiệm mua giày thể thao size lớn (47+) online không?',
    content: 'Chân mình size 47 nên mua giày online rất khó, thường hết hàng hoặc size chart không chuẩn. Ai có kinh nghiệm với shop nào đáng tin trên Shopee cho size lớn không?\n\nMình đang cần giày chạy bộ, budget tầm 500-800k.',
    images: [],
    catSlug: 'the-thao',
    productUrl: '',
    affiliateUrl: '',
    productMeta: null,
  },
  {
    type: 'discussion-no-images',
    title: 'Bảo quản sách như thế nào để không bị ố vàng?',
    content: 'Mình có khá nhiều sách giấy, để một thời gian là bị ố vàng dù cất trong tủ. Tìm hiểu ra thì do độ ẩm và ánh sáng.\n\nGiải pháp: túi hút ẩm đặt trong kệ sách, tránh để gần cửa sổ, không chất sách nằm ngang quá lâu. Ai có tips khác không?',
    images: [],
    catSlug: 'sach',
    productUrl: '',
    affiliateUrl: '',
    productMeta: null,
  },
  {
    type: 'discussion-no-images',
    title: 'Review dịch vụ Shopee Guarantee — đã từng hoàn tiền thành công',
    content: 'Mình vừa hoàn tiền thành công 450k qua Shopee Guarantee. Sản phẩm nhận được khác ảnh, mình chụp ảnh, quay video unboxing rồi mở khiếu nại. Shop phản hồi trong 2 ngày, Shopee xử lý thêm 3 ngày nữa là tiền về ví.\n\nKinh nghiệm: LUÔN quay video lúc mở hàng, đặc biệt với đơn trên 300k.',
    images: [],
    catSlug: 'khac',
    productUrl: '',
    affiliateUrl: '',
    productMeta: null,
  },

  // ── Type 3: Review — có sản phẩm + ảnh ───────────────────────────────────
  {
    type: 'review-with-images',
    title: '⭐⭐⭐⭐⭐ Tai nghe TWS này 300k mà chất như 800k — mua lại lần 3 rồi',
    content: 'Mình đã mua lại lần thứ 3 rồi mà vẫn chọn cái này. Kết nối Bluetooth 5.3 ổn định, pin tai nghe 6h + case 24h. ANC thì không khủng như Sony hay Bose nhưng đủ dùng khi làm việc.\n\nÂm thanh bass vừa, mid rõ, treble không chói. Với 300k thì quá là đáng. Shop giao hàng nhanh, đóng gói cẩn thận.',
    images: [img(325), img(356)],
    catSlug: 'dien-tu',
    productUrl: 'https://shopee.vn/product/tai-nghe-tws-sample',
    affiliateUrl: 'https://shopee.vn/product/tai-nghe-tws-sample?af=sample',
    productMeta: {
      shopName: 'TechZone Official',
      originalPrice: 450000,
      salePrice: 299000,
      discountPercent: 34,
      rating: 4.8,
      soldCount: 12500,
    },
  },
  {
    type: 'review-with-images',
    title: 'Váy maxi hoa nhí này mặc đi biển xịn lắm — size chuẩn, vải nhẹ',
    content: 'Mình mua size M, cao 162 nặng 52kg mặc vừa vặn. Vải voan nhẹ, không bị nhăn khi gấp vào vali. Màu thật khá giống ảnh, chỉ nhạt hơn một chút.\n\nMặc đi biển Đà Nẵng tuần trước được khen nhiều lắm. Giá chỉ 189k mà chụp ảnh rất đẹp.',
    images: [img(1036), img(894), img(936)],
    catSlug: 'thoi-trang',
    productUrl: 'https://shopee.vn/product/vay-maxi-sample',
    affiliateUrl: 'https://shopee.vn/product/vay-maxi-sample?af=sample',
    productMeta: {
      shopName: 'Fashion Store VN',
      originalPrice: 280000,
      salePrice: 189000,
      discountPercent: 32,
      rating: 4.6,
      soldCount: 8900,
    },
  },
  {
    type: 'review-with-images',
    title: 'Máy lọc không khí mini bàn làm việc — dùng 2 tháng rồi review thật',
    content: 'Mua cái này vì phòng trọ hay có mùi ẩm mốc. Dùng 2 tháng thì thấy không khí phòng tươi hơn hẳn, đặc biệt buổi sáng ngủ dậy. Tiếng ồn mức thấp nhất rất nhỏ, không ảnh hưởng giấc ngủ.\n\nBộ lọc HEPA H13 thay 3-6 tháng một lần, giá lọc thay thế 120k. Tổng chi phí vẫn rẻ hơn nhiều so với các thương hiệu lớn.',
    images: [img(3616)],
    catSlug: 'gia-dung',
    productUrl: 'https://shopee.vn/product/may-loc-khong-khi-sample',
    affiliateUrl: 'https://shopee.vn/product/may-loc-khong-khi-sample?af=sample',
    productMeta: {
      shopName: 'HomeLife Store',
      originalPrice: 650000,
      salePrice: 420000,
      discountPercent: 35,
      rating: 4.7,
      soldCount: 3200,
    },
  },
  {
    type: 'review-with-images',
    title: 'Serum vitamin C này 150k mà trắng da thật sự không nói đùa',
    content: 'Mình dùng được 6 tuần rồi. Da sáng hơn rõ rệt, đặc biệt vùng thâm dưới mắt và vết nám nhỏ cũng mờ đi nhiều.\n\nTexture nhẹ, thấm nhanh, không nhờn. Mùi hơi nồng lúc mới bôi nhưng tan rất nhanh. Mình dùng buổi sáng trước kem chống nắng.',
    images: [img(3762), img(1148)],
    catSlug: 'lam-dep',
    productUrl: 'https://shopee.vn/product/serum-vitamin-c-sample',
    affiliateUrl: 'https://shopee.vn/product/serum-vitamin-c-sample?af=sample',
    productMeta: {
      shopName: 'Beauty World Official',
      originalPrice: 220000,
      salePrice: 149000,
      discountPercent: 32,
      rating: 4.5,
      soldCount: 21000,
    },
  },

  // ── Type 4: Review — có sản phẩm, KHÔNG ảnh ──────────────────────────────
  {
    type: 'review-no-images',
    title: 'Sạc dự phòng 20000mAh này đi máy bay nhiều chuyến không lo hết pin',
    content: 'Mua về dùng được 4 tháng, sạc iPhone 15 Pro Max được khoảng 3.5 lần đầy. Cổng USB-C 45W sạc nhanh laptop nhỏ cũng được.\n\nTrọng lượng 320g, hơi nặng so với loại 10000mAh nhưng đi công tác dài ngày thì cần. Không bị pin chai sau 4 tháng. Đáng mua.',
    images: [],
    catSlug: 'dien-tu',
    productUrl: 'https://shopee.vn/product/sac-du-phong-sample',
    affiliateUrl: 'https://shopee.vn/product/sac-du-phong-sample?af=sample',
    productMeta: {
      shopName: 'PowerTech Store',
      originalPrice: 380000,
      salePrice: 259000,
      discountPercent: 32,
      rating: 4.6,
      soldCount: 5600,
    },
  },
  {
    type: 'review-no-images',
    title: 'Vitamin tổng hợp cho người tập gym — uống 3 tháng thấy gì khác biệt?',
    content: 'Mình tập gym 4 buổi/tuần, bắt đầu uống vitamin tổng hợp này từ 3 tháng trước. Cảm nhận rõ nhất là ít mệt mỏi hơn, ngủ ngon hơn và ít bị đau cơ sau tập.\n\nKhông phải thần dược đâu nhưng khi kết hợp với chế độ ăn uống đủ chất thì hiệu quả rõ ràng. Viên to nhưng uống với nhiều nước là được.',
    images: [],
    catSlug: 'suc-khoe',
    productUrl: 'https://shopee.vn/product/vitamin-gym-sample',
    affiliateUrl: 'https://shopee.vn/product/vitamin-gym-sample?af=sample',
    productMeta: {
      shopName: 'HealthPlus Official',
      originalPrice: 320000,
      salePrice: 245000,
      discountPercent: 23,
      rating: 4.4,
      soldCount: 7800,
    },
  },
  {
    type: 'review-no-images',
    title: 'Tã quần Merries size XL — dùng cho bé 11kg, không bị hăm',
    content: 'Bé nhà mình 14 tháng, 11kg. Dùng Merries được 3 tháng không bị hăm lần nào dù thời tiết nóng. Độ thấm hút tốt, có thể mặc ban đêm 8-9 tiếng không cần thay.\n\nGiá hơi cao so với local brand nhưng da bé nhạy cảm thì đáng đầu tư. Mình thường mua pack 50 miếng trên Shopee rẻ hơn siêu thị 30-40k.',
    images: [],
    catSlug: 'me-va-be',
    productUrl: 'https://shopee.vn/product/ta-merries-sample',
    affiliateUrl: 'https://shopee.vn/product/ta-merries-sample?af=sample',
    productMeta: {
      shopName: 'Merries Official VN',
      originalPrice: 285000,
      salePrice: 255000,
      discountPercent: 11,
      rating: 4.9,
      soldCount: 34000,
    },
  },
];

async function main() {
  // Fetch category IDs
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  for (const c of categories) cats[c.slug] = c.id;

  let created = 0;
  for (const [i, p] of POSTS.entries()) {
    const userId = USERS[i % USERS.length];
    const categoryId = cats[p.catSlug] ?? null;

    await prisma.post.create({
      data: {
        userId,
        categoryId,
        title: p.title,
        content: p.content,
        images: p.images,
        productUrl: p.productUrl,
        affiliateUrl: p.affiliateUrl,
        productMeta: p.productMeta ?? undefined,
        likeCount: Math.floor(Math.random() * 200),
        commentCount: Math.floor(Math.random() * 40),
        clickCount: Math.floor(Math.random() * 500),
      },
    });
    created++;
    console.log(`  ✓ [${p.type}] ${p.title.slice(0, 60)}...`);
  }

  console.log(`\nSeeded ${created} posts across ${new Set(POSTS.map(p => p.type)).size} types.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
