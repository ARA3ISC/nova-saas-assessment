import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { PlatformBootstrapService } from './application/platform-bootstrap.service';

async function main(): Promise<void> {
  const email = process.env.PLATFORM_BOOTSTRAP_EMAIL?.trim();
  const password = process.env.PLATFORM_BOOTSTRAP_PASSWORD;
  const bootstrapToken = process.env.PLATFORM_BOOTSTRAP_TOKEN;

  if (!email || !password || !bootstrapToken) {
    throw new Error(
      'PLATFORM_BOOTSTRAP_EMAIL, PLATFORM_BOOTSTRAP_PASSWORD, and PLATFORM_BOOTSTRAP_TOKEN are required',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    await app.get(PlatformBootstrapService).bootstrap({ email, password, bootstrapToken });
  } finally {
    await app.close();
  }
}

void main();
