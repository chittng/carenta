import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';

import { AppConfigService } from '../config/env.js';
import { MailService } from './mail.service.js';
import { createSmtpTransport, MAIL_TRANSPORT, type MailTransport } from './mail.transport.js';

/** Transactional email. Feature modules inject `MailService`. */
@Global()
@Module({
  providers: [
    MailService,
    {
      provide: MAIL_TRANSPORT,
      inject: [AppConfigService],
      useFactory: createSmtpTransport,
    },
  ],
  exports: [MailService],
})
export class MailModule implements OnApplicationShutdown {
  constructor(@Inject(MAIL_TRANSPORT) private readonly transport: MailTransport) {}

  onApplicationShutdown() {
    this.transport.close();
  }
}
