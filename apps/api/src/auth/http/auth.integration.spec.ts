import cookieParser from 'cookie-parser';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, it } from 'vitest';
import request from 'supertest';

import { AuthModule } from '../auth.module';
import { PrismaService } from '../../prisma/prisma.service';

describe('Authentication flow', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const prismaMock = {
      $connect: async () => {},
      $disconnect: async () => {},
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = module.createNestApplication();

    app.use(cookieParser());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds with 401 when accessing /auth/me without a session', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
