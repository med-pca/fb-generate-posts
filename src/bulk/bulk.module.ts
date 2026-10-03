import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { BulkController } from './bulk.controller';
import { BulkService } from './bulk.service';

@Module({
  imports: [AccessModule],
  controllers: [BulkController],
  providers: [BulkService],
})
export class BulkModule {}
