import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadServerConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadServerConfig();
  const app = await NestFactory.create(AppModule);

  await app.listen(config.port, config.host);
}

void bootstrap();
