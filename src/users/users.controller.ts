import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
// L'ordre compte : le premier attache le compte, le second lit son rôle.
@UseGuards(AdminAuthGuard, AdminRoleGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post()
  @ApiOperation({
    summary: 'Créer un compte',
    description:
      'La réponse porte la clé d’automatisation du compte. C’est la seule ' +
      'occasion de la lire : aucune lecture ultérieure ne la rend.',
  })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.users.update(id, dto, acting);
  }

  @Post(':id/rotate-key')
  @ApiOperation({
    summary: 'Régénérer la clé d’automatisation',
    description:
      'L’ancienne cesse aussitôt de fonctionner. À faire dès qu’une clé a fuité.',
  })
  rotateKey(@Param('id') id: string) {
    return this.users.rotateKey(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.users.remove(id, acting);
  }
}

/** Qui suis-je : lisible par tout compte connecté, pour que l'interface
 * sache quoi montrer. */
@ApiTags('auth')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('me')
export class MeController {
  @Get()
  me(@ActingUser() acting: CurrentUser) {
    return acting;
  }
}
