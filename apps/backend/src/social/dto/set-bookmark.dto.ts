import { IsBoolean } from 'class-validator';

/** Idempotent desired end-state for PUT /posts/:id/bookmark (not a toggle —
 * see SocialService.setBookmark for why). */
export class SetBookmarkDto {
  @IsBoolean()
  bookmarked!: boolean;
}
