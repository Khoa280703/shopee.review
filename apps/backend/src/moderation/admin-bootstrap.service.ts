import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Grants is_admin to the usernames in ADMIN_BOOTSTRAP_USERNAME (comma-separated)
 * on startup. Idempotent: no-op if already admin, warns if the user doesn't
 * exist yet. Replaces manual SQL — there is no self-promotion UI.
 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const raw = process.env.ADMIN_BOOTSTRAP_USERNAME;
    if (!raw) return;

    const usernames = raw.split(',').map((u) => u.trim()).filter(Boolean);
    for (const username of usernames) {
      try {
        const result = await this.prisma.user.updateMany({
          where: { username, isAdmin: false },
          data: { isAdmin: true },
        });
        if (result.count > 0) {
          this.logger.log(`Granted admin to "${username}"`);
        } else {
          const exists = await this.prisma.user.findUnique({
            where: { username },
            select: { id: true },
          });
          if (!exists) {
            this.logger.warn(`ADMIN_BOOTSTRAP_USERNAME "${username}" not found (yet)`);
          }
        }
      } catch (error) {
        this.logger.error(
          `Admin bootstrap failed for "${username}": ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }
}
