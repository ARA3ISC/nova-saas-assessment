import { Body, Controller, Post } from '@nestjs/common';
import { PlatformBootstrapService } from '../application/platform-bootstrap.service';

@Controller('platform/bootstrap')
export class PlatformBootstrapController {
  constructor(private readonly bootstrap: PlatformBootstrapService) {}
  @Post() async create(@Body() body: { email: string; password: string; bootstrapToken: string }) {
    await this.bootstrap.bootstrap(body);
    return { accepted: true };
  }
}
