import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional moderation note recorded alongside a soft delete, for the audit trail. */
export class DeleteReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
