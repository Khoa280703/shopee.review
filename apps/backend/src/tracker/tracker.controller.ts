import { Controller, Get, Param, ParseIntPipe, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TrackerService } from './tracker.service';

@Controller('r')
export class TrackerController {
  constructor(private readonly trackerService: TrackerService) {}

  @Get(':postId')
  async trackAndRedirect(
    @Param('postId', ParseIntPipe) postId: number,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const affiliateUrl = await this.trackerService.trackAndResolve(postId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer'],
    });
    res.redirect(302, affiliateUrl);
  }
}
