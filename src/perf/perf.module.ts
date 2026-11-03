import { Global, Module } from '@nestjs/common';
import { PerfController } from './perf.controller';
import { PerfService } from './perf.service';
import { ShortCacheService } from './short-cache.service';

@Global()
@Module({ controllers: [PerfController], providers: [PerfService, ShortCacheService], exports: [PerfService, ShortCacheService] })
export class PerfModule {}
