import { Module } from '@nestjs/common';
import { ControlController } from './control.controller';
import { RunnersController } from './runners.controller';
import { RunnersService } from './runners.service';

@Module({
  controllers: [RunnersController, ControlController],
  providers: [RunnersService],
  exports: [RunnersService],
})
export class RunnersModule {}
