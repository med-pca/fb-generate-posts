import { Module } from '@nestjs/common';
import { RescueService } from './rescue.service';

/** 🛟 Le sauvetage du lien : partagé par les lots (le sauveteur) et le
 * vérificateur (qui l'attend avant de supprimer quoi que ce soit). */
@Module({
  providers: [RescueService],
  exports: [RescueService],
})
export class RescueModule {}
