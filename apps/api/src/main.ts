import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadServerConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadServerConfig();
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  await app.listen(config.port, config.host);
}

void bootstrap();
