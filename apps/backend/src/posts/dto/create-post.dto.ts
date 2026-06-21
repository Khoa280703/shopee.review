import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsUrl()
  productUrl!: string;

  @IsUrl()
  affiliateUrl!: string;

  @IsOptional()
  @IsObject()
  productMeta?: Record<string, unknown>;

  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(10)
  images!: string[];

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  categoryId?: number;
}
