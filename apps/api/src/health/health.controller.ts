import { Controller, Get } from '@nestjs/common';
import { createHealthResponse } from '@nova/shared';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return createHealthResponse();
  }
}
