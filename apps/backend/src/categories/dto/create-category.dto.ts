import { IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug chỉ dùng a-z, 0-9, dấu gạch ngang' })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
