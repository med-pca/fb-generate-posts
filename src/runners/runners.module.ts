import { Module } from '@nestjs/common';
import { ControlController } from './control.controller';
import { PairController } from './pair.controller';
import { RunnersController } from './runners.controller';
import { RunnersService } from './runners.service';

@Module({
  controllers: [RunnersController, ControlController, PairController],
  providers: [RunnersService],
  exports: [RunnersService],
})
export class RunnersModule {}
