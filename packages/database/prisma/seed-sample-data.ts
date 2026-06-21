import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
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

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, icon: category.icon, sortOrder: category.sortOrder },
    });
  }
  console.log(`Seeded ${categories.length} categories`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
