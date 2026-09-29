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
import { CategoriesService } from './categories.service';
import { CategoryDto } from './dto/category.dto';

/** Tout compte connecté lit la liste et y ajoute une catégorie : il en a
 * besoin pour ranger ses groupes et ses sites. Renommer ou supprimer touche
 * les ressources des autres comptes : réservé aux ADMIN. */
@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll() {
    return this.categories.findAll();
  }

  @Post()
  create(@Body() dto: CategoryDto) {
    return this.categories.create(dto.name);
  }

  @Patch(':id')
  @UseGuards(AdminRoleGuard)
  rename(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.categories.rename(id, dto.name);
  }

  @Delete(':id')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary: 'Supprimer une catégorie',
    description:
      'Ses groupes et ses sites deviennent sans catégorie ; rien n’est supprimé.',
  })
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
