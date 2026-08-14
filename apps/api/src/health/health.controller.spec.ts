import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns a successful health response', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = module.get(HealthController);

    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
