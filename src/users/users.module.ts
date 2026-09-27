import { Module } from '@nestjs/common';
import { MeController, UsersController } from './users.controller';
import { UsersService } from './users.service';

/** Les comptes de la plateforme. Un ADMIN les gère ; un MANAGER ne voit que
 * le sien, par `/api/me`. */
@Module({
  controllers: [UsersController, MeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
