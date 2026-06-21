import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryPostsDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  cursor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  categoryId?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['createdAt', 'clickCount', 'likeCount'])
  sortBy?: 'createdAt' | 'clickCount' | 'likeCount' = 'createdAt';
}

export class ScrapeUrlDto {
  @IsString()
  url!: string;
}
