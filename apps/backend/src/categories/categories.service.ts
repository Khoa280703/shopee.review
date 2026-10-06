import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  create(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: { name: dto.name, slug: dto.slug, icon: dto.icon, sortOrder: dto.sortOrder },
    });
  }

  update(id: number, dto: UpdateCategoryDto) {
    // Map fields explicitly — never spread the DTO into Prisma `data`. Prisma's
    // generated nested-write input (`posts.connect/update/updateMany/deleteMany`)
    // would otherwise accept ANY key a client sends, allowing writes to unrelated
    // rows through the category's relations.
    return this.prisma.category.update({
      where: { id },
      data: { name: dto.name, slug: dto.slug, icon: dto.icon, sortOrder: dto.sortOrder },
    });
  }

  async delete(id: number) {
    await this.prisma.post.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
    return this.prisma.category.delete({ where: { id } });
  }
}
