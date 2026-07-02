import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────────
const img = (id: number, w = 800, h = 600) => `https://picsum.photos/id/${id}/${w}/${h}`;
const avatar = (seed: string) => `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`;
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ── Categories ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { name: 'Thời trang', slug: 'thoi-trang', icon: '👗', sortOrder: 1 },
  { name: 'Điện tử', slug: 'dien-tu', icon: '📱', sortOrder: 2 },
  { name: 'Gia dụng', slug: 'gia-dung', icon: '🏠', sortOrder: 3 },
  { name: 'Làm đẹp', slug: 'lam-dep', icon: '💄', sortOrder: 4 },
  { name: 'Sức khỏe', slug: 'suc-khoe', icon: '💊', sortOrder: 5 },
  { name: 'Mẹ & Bé', slug: 'me-va-be', icon: '🍼', sortOrder: 6 },
  { name: 'Thể thao', slug: 'the-thao', icon: '⚽', sortOrder: 7 },
  { name: 'Sách', slug: 'sach', icon: '📚', sortOrder: 8 },
  { name: 'Đồ ăn', slug: 'do-an', icon: '🍜', sortOrder: 9 },
  { name: 'Khác', slug: 'khac', icon: '🛍️', sortOrder: 10 },
];

// ── Test users (password: Test@1234 for all) ────────────────────────────────────
const USERS = [
  { username: 'anhnguyen', displayName: 'Anh Nguyễn', email: 'anh@test.com', bio: 'Mê mua sắm online, review đồ điện tử và gia dụng' },
  { username: 'bichpham', displayName: 'Bích Phạm', email: 'bich@test.com', bio: 'Beauty blogger | Chia sẻ skincare & thời trang' },
  { username: 'cuongle', displayName: 'Cường Lê', email: 'cuong@test.com', bio: 'Gym rat | Review đồ thể thao & supplement' },
  { username: 'dieuhoa', displayName: 'Diệu Hoa', email: 'dieu@test.com', bio: 'Mẹ bỉm sữa | Chia sẻ kinh nghiệm nuôi con' },
  { username: 'emtran', displayName: 'Em Trần', email: 'em@test.com', bio: 'Foodie | Hay review đồ ăn và quán xá' },
  { username: 'giangvu', displayName: 'Giang Vũ', email: 'giang@test.com', bio: 'Bookworm | Đọc sách và review' },
  { username: 'hoangthi', displayName: 'Hoàng Thị', email: 'hoang@test.com', bio: 'Thích decor nhà cửa và đồ gia dụng' },
  { username: 'test', displayName: 'Test User', email: 'test@test.com', bio: 'Tài khoản dùng để test' },
];

// ── Posts ──────────────────────────────────────────────────────────────────────
const POSTS_DATA = [
  {
    title: '⭐⭐⭐⭐⭐ Tai nghe TWS 300k mà chất như 800k — mua lại lần 3 rồi',
    content: 'Mình đã mua lại lần thứ 3 rồi mà vẫn chọn cái này. Kết nối Bluetooth 5.3 ổn định, pin tai nghe 6h + case 24h. ANC thì không khủng như Sony hay Bose nhưng đủ dùng khi làm việc.\n\nÂm thanh bass vừa, mid rõ, treble không chói. Với 300k thì quá là đáng. Shop giao hàng nhanh, đóng gói cẩn thận.',
    images: [img(325), img(356)],
    catSlug: 'dien-tu',
    productUrl: 'https://shopee.vn/product/tai-nghe-tws-sample',
    productMeta: { shopName: 'TechZone Official', originalPrice: 450000, salePrice: 299000, discountPercent: 34, rating: 4.8, soldCount: 12500 },
    userIdx: 0,
  },
  {
    title: 'Váy maxi hoa nhí mặc đi biển xịn lắm — size chuẩn, vải nhẹ',
    content: 'Mình mua size M, cao 162 nặng 52kg mặc vừa vặn. Vải voan nhẹ, không bị nhăn khi gấp vào vali. Màu thật khá giống ảnh, chỉ nhạt hơn một chút.\n\nMặc đi biển Đà Nẵng tuần trước được khen nhiều lắm. Giá chỉ 189k mà chụp ảnh rất đẹp.',
    images: [img(1036), img(894), img(936)],
    catSlug: 'thoi-trang',
    productUrl: 'https://shopee.vn/product/vay-maxi-sample',
    productMeta: { shopName: 'Fashion Store VN', originalPrice: 280000, salePrice: 189000, discountPercent: 32, rating: 4.6, soldCount: 8900 },
    userIdx: 1,
  },
  {
    title: 'Serum vitamin C 150k mà trắng da thật sự không nói đùa',
    content: 'Mình dùng được 6 tuần rồi. Da sáng hơn rõ rệt, đặc biệt vùng thâm dưới mắt và vết nám nhỏ cũng mờ đi nhiều.\n\nTexture nhẹ, thấm nhanh, không nhờn. Mùi hơi nồng lúc mới bôi nhưng tan rất nhanh. Mình dùng buổi sáng trước kem chống nắng.',
    images: [img(614), img(821)],
    catSlug: 'lam-dep',
    productUrl: 'https://shopee.vn/product/serum-vitamin-c-sample',
    productMeta: { shopName: 'Beauty World Official', originalPrice: 220000, salePrice: 149000, discountPercent: 32, rating: 4.5, soldCount: 21000 },
    userIdx: 1,
  },
  {
    title: 'Chia sẻ setup góc học tập — chi phí dưới 2 triệu',
    content: 'Mình vừa sắp xếp lại góc học tập cuối tuần rồi. Tổng chi phí khoảng 1.8 triệu bao gồm đèn bàn, kệ sách mini và tấm lót bàn.\n\nĐèn mua trên Shopee giá 250k, chất lượng ổn lắm, ánh sáng vàng ấm không gây mỏi mắt. Nếu bạn cần link sản phẩm cụ thể thì comment nhé mình tag cho!',
    images: [img(202), img(667)],
    catSlug: 'gia-dung',
    productUrl: '',
    productMeta: null,
    userIdx: 6,
  },
  {
    title: 'Máy lọc không khí mini bàn làm việc — dùng 2 tháng rồi review thật',
    content: 'Mua cái này vì phòng trọ hay có mùi ẩm mốc. Dùng 2 tháng thì thấy không khí phòng tươi hơn hẳn, đặc biệt buổi sáng ngủ dậy.\n\nBộ lọc HEPA H13 thay 3-6 tháng một lần, giá lọc thay thế 120k. Tổng chi phí vẫn rẻ hơn nhiều so với các thương hiệu lớn.',
    images: [img(425)],
    catSlug: 'gia-dung',
    productUrl: 'https://shopee.vn/product/may-loc-khong-khi-sample',
    productMeta: { shopName: 'HomeLife Store', originalPrice: 650000, salePrice: 420000, discountPercent: 35, rating: 4.7, soldCount: 3200 },
    userIdx: 6,
  },
  {
    title: 'Skin care routine buổi tối của mình — đơn giản mà hiệu quả',
    content: 'Mình đang dùng routine 4 bước: tẩy trang → rửa mặt → serum HA → kem dưỡng ẩm. Không có gì fancy cả, toàn đồ bình dân nhưng da thật sự cải thiện rõ rệt sau 1 tháng.\n\nKey là phải consistent, dùng đều đặn mỗi tối.',
    images: [img(614)],
    catSlug: 'lam-dep',
    productUrl: '',
    productMeta: null,
    userIdx: 1,
  },
  {
    title: 'Tips nhận voucher Shopee mà ít người biết',
    content: 'Trick nhỏ mình học được: vào game Shopee hằng ngày để tích xu, sau đó đổi xu lấy voucher freeship hoặc giảm giá 50k. Mỗi ngày mất khoảng 5 phút mà tiết kiệm được kha khá.\n\nNgoài ra hay check tab Flash Sale lúc 12h trưa và 20h tối — thường có deal cực tốt.',
    images: [],
    catSlug: 'khac',
    productUrl: '',
    productMeta: null,
    userIdx: 4,
  },
  {
    title: 'Vitamin tổng hợp cho người tập gym — uống 3 tháng thấy gì khác biệt?',
    content: 'Mình tập gym 4 buổi/tuần, bắt đầu uống vitamin tổng hợp này từ 3 tháng trước. Cảm nhận rõ nhất là ít mệt mỏi hơn, ngủ ngon hơn và ít bị đau cơ sau tập.\n\nKhông phải thần dược đâu nhưng khi kết hợp với chế độ ăn uống đủ chất thì hiệu quả rõ ràng.',
    images: [],
    catSlug: 'suc-khoe',
    productUrl: 'https://shopee.vn/product/vitamin-gym-sample',
    productMeta: { shopName: 'HealthPlus Official', originalPrice: 320000, salePrice: 245000, discountPercent: 23, rating: 4.4, soldCount: 7800 },
    userIdx: 2,
  },
  {
    title: 'Tã quần Merries size XL — dùng cho bé 11kg, không bị hăm',
    content: 'Bé nhà mình 14 tháng, 11kg. Dùng Merries được 3 tháng không bị hăm lần nào dù thời tiết nóng. Độ thấm hút tốt, có thể mặc ban đêm 8-9 tiếng không cần thay.\n\nGiá hơi cao so với local brand nhưng da bé nhạy cảm thì đáng đầu tư.',
    images: [],
    catSlug: 'me-va-be',
    productUrl: 'https://shopee.vn/product/ta-merries-sample',
    productMeta: { shopName: 'Merries Official VN', originalPrice: 285000, salePrice: 255000, discountPercent: 11, rating: 4.9, soldCount: 34000 },
    userIdx: 3,
  },
  {
    title: 'Trải nghiệm đặt đồ ăn qua Shopee Food — lần đầu thử',
    content: 'Hôm qua thử đặt bún bò qua Shopee Food lần đầu. Giao trong 25 phút, đồ ăn còn nóng, bao bì gọn gàng. Giá bằng đặt trực tiếp không bị mark up.\n\nChỉ tội app hơi lag lúc thanh toán. Nhìn chung 7/10, sẽ dùng lại.',
    images: [img(292), img(431)],
    catSlug: 'do-an',
    productUrl: '',
    productMeta: null,
    userIdx: 4,
  },
  {
    title: 'Sạc dự phòng 20000mAh đi máy bay nhiều chuyến không lo hết pin',
    content: 'Mua về dùng được 4 tháng, sạc iPhone 15 Pro Max được khoảng 3.5 lần đầy. Cổng USB-C 45W sạc nhanh laptop nhỏ cũng được.\n\nTrọng lượng 320g, hơi nặng so với loại 10000mAh nhưng đi công tác dài ngày thì cần.',
    images: [],
    catSlug: 'dien-tu',
    productUrl: 'https://shopee.vn/product/sac-du-phong-sample',
    productMeta: { shopName: 'PowerTech Store', originalPrice: 380000, salePrice: 259000, discountPercent: 32, rating: 4.6, soldCount: 5600 },
    userIdx: 0,
  },
  {
    title: 'Hỏi: Ai có kinh nghiệm mua giày thể thao size lớn (47+) online không?',
    content: 'Chân mình size 47 nên mua giày online rất khó, thường hết hàng hoặc size chart không chuẩn. Ai có kinh nghiệm với shop nào đáng tin trên Shopee cho size lớn không?\n\nMình đang cần giày chạy bộ, budget tầm 500-800k.',
    images: [],
    catSlug: 'the-thao',
    productUrl: '',
    productMeta: null,
    userIdx: 2,
  },
  {
    title: 'Bảo quản sách như thế nào để không bị ố vàng?',
    content: 'Mình có khá nhiều sách giấy, để một thời gian là bị ố vàng dù cất trong tủ. Tìm hiểu ra thì do độ ẩm và ánh sáng.\n\nGiải pháp: túi hút ẩm đặt trong kệ sách, tránh để gần cửa sổ, không chất sách nằm ngang quá lâu. Ai có tips khác không?',
    images: [],
    catSlug: 'sach',
    productUrl: '',
    productMeta: null,
    userIdx: 5,
  },
  {
    title: 'Review Shopee Guarantee — đã hoàn tiền thành công 450k',
    content: 'Mình vừa hoàn tiền thành công 450k qua Shopee Guarantee. Sản phẩm nhận được khác ảnh, mình chụp ảnh, quay video unboxing rồi mở khiếu nại.\n\nKinh nghiệm: LUÔN quay video lúc mở hàng, đặc biệt với đơn trên 300k.',
    images: [],
    catSlug: 'khac',
    productUrl: '',
    productMeta: null,
    userIdx: 7,
  },
  {
    title: 'Mọi người hay mua đồ online hay offline?',
    content: 'Từ ngày có Shopee với Lazada tôi hầu như không đi mall nữa. Giao hàng nhanh, giá tốt, lại có đánh giá của người mua trước. Nhược điểm duy nhất là không cầm sờ được sản phẩm.\n\nCác bạn thường mua loại gì online?',
    images: [img(1081), img(433)],
    catSlug: 'khac',
    productUrl: '',
    productMeta: null,
    userIdx: 7,
  },
];

// ── Comments ───────────────────────────────────────────────────────────────────
const COMMENTS = [
  'Cảm ơn bạn đã chia sẻ, mình cũng đang cân nhắc mua cái này!',
  'Link sản phẩm cho mình xin với ạ 🙏',
  'Bạn mua ở shop nào vậy? Mình tìm không ra',
  'Mình dùng rồi, xác nhận chất lượng như bạn nói!',
  'Giá này ổn quá, hôm nay sale thêm 10% nữa á',
  'Mình size L thì mua size nào bạn ơi?',
  'Shipping về HCM nhanh không bạn?',
  'Bạn có thể cho mình biết thêm về chất lượng sau khi dùng lâu không?',
  'Mình cũng đang dùng cái này, đồng ý với review của bạn!',
  'Bao giờ có đợt sale nữa nhỉ?',
];

async function main() {
  console.log('🌱 Seeding database...\n');

  // 1. Categories
  console.log('📂 Seeding categories...');
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: cat,
      update: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder },
    });
  }
  console.log(`   ✓ ${CATEGORIES.length} categories\n`);

  // 2. Users
  console.log('👥 Seeding users...');
  const passwordHash = await bcrypt.hash('Test@1234', 10);
  const createdUsers: { id: number }[] = [];

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        bio: u.bio,
        passwordHash,
        emailVerified: true,
        avatarUrl: avatar(u.username),
      },
      update: { displayName: u.displayName, bio: u.bio },
      select: { id: true },
    });
    createdUsers.push(user);
    console.log(`   ✓ @${u.username} (${u.email})`);
  }
  console.log();

  // 3. Follows (each user follows the next 2 users)
  console.log('🤝 Seeding follows...');
  let followCount = 0;
  for (let i = 0; i < createdUsers.length; i++) {
    for (let j = 1; j <= 2; j++) {
      const target = createdUsers[(i + j) % createdUsers.length];
      await prisma.follow.upsert({
        where: { followerId_followingId: { followerId: createdUsers[i].id, followingId: target.id } },
        create: { followerId: createdUsers[i].id, followingId: target.id },
        update: {},
      });
      followCount++;
    }
  }
  // Update counts
  for (const u of createdUsers) {
    const [followers, following] = await Promise.all([
      prisma.follow.count({ where: { followingId: u.id } }),
      prisma.follow.count({ where: { followerId: u.id } }),
    ]);
    await prisma.user.update({ where: { id: u.id }, data: { followersCount: followers, followingCount: following } });
  }
  console.log(`   ✓ ${followCount} follow relationships\n`);

  // 4. Categories map
  const cats = await prisma.category.findMany({ select: { id: true, slug: true } });
  const catMap: Record<string, number> = {};
  for (const c of cats) catMap[c.slug] = c.id;

  // 5. Posts — delete existing seed posts first to avoid duplicates
  console.log('📝 Seeding posts...');
  await prisma.post.deleteMany({
    where: { userId: { in: createdUsers.map((u) => u.id) } },
  });
  const createdPosts: { id: number }[] = [];

  for (const p of POSTS_DATA) {
    const userId = createdUsers[p.userIdx].id;
    const post = await prisma.post.create({
      data: {
        userId,
        categoryId: catMap[p.catSlug] ?? null,
        title: p.title,
        content: p.content,
        images: p.images,
        productUrl: p.productUrl,
        affiliateUrl: p.productUrl ? p.productUrl + '?af=seed' : '',
        productMeta: p.productMeta ?? undefined,
        likeCount: rand(5, 200),
        commentCount: rand(2, 30),
        clickCount: rand(50, 800),
      },
      select: { id: true },
    });
    createdPosts.push(post);
    console.log(`   ✓ "${p.title.slice(0, 55)}..."`);
  }
  console.log();

  // 6. Likes (random users like random posts)
  console.log('❤️  Seeding likes...');
  let likeCount = 0;
  for (const post of createdPosts) {
    const numLikes = rand(2, 6);
    const shuffled = [...createdUsers].sort(() => Math.random() - 0.5).slice(0, numLikes);
    for (const user of shuffled) {
      await prisma.like.upsert({
        where: { userId_postId: { userId: user.id, postId: post.id } },
        create: { userId: user.id, postId: post.id },
        update: {},
      });
      likeCount++;
    }
  }
  console.log(`   ✓ ${likeCount} likes\n`);

  // 7. Comments
  console.log('💬 Seeding comments...');
  let commentCount = 0;
  for (const post of createdPosts) {
    const numComments = rand(1, 4);
    for (let i = 0; i < numComments; i++) {
      const user = createdUsers[rand(0, createdUsers.length - 1)];
      const comment = COMMENTS[rand(0, COMMENTS.length - 1)];
      await prisma.comment.create({
        data: { userId: user.id, postId: post.id, content: comment },
      });
      commentCount++;
    }
  }
  console.log(`   ✓ ${commentCount} comments\n`);

  console.log('✅ Done!\n');
  console.log('Test accounts (password: Test@1234):');
  for (const u of USERS) {
    console.log(`   ${u.email.padEnd(22)} @${u.username}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
