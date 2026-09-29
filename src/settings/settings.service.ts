import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/** Les réglages globaux. Il n'y a plus d'alimentation automatique : les posts
 * ne naissent que des articles reçus de WordPress (un post ouvert par
 * article, vers les groupes de la catégorie du site). Recréer des variantes
 * pour remplir un stock produisait les doublons qu'on voyait dans les
 * groupes. */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.automationSetting.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });
  }

  update(dto: UpdateSettingsDto) {
    return this.prisma.automationSetting.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...dto },
      update: dto,
    });
  }
}
