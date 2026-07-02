import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService } from '../../auth/mail.service';
import { EMAIL_JOB, EMAIL_QUEUE, type VerifyEmailJob } from '../queue.constants';

// Concurrency 2 — Resend is rate-limited.
@Processor(EMAIL_QUEUE, { concurrency: 2 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<VerifyEmailJob>): Promise<void> {
    switch (job.name) {
      case EMAIL_JOB.VERIFY:
        await this.mail.sendVerificationEmail(job.data.email, job.data.token);
        return;
      default:
        this.logger.warn(`Unknown email job: ${job.name}`);
    }
  }
}
