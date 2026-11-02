import { Global, Module } from '@nestjs/common';
import { PerfController } from './perf.controller';
import { PerfService } from './perf.service';

@Global()
@Module({ controllers: [PerfController], providers: [PerfService], exports: [PerfService] })
export class PerfModule {}
