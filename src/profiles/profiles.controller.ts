import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { CreateProfileDto } from './dto/create-profile.dto';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('profiles')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Post()
  create(@Body() dto: CreateProfileDto, @ActingUser() acting: CurrentUser) {
    return this.profiles.create(dto, acting);
  }

  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.profiles.findAll(pagination, acting);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.profiles.findOne(id, acting);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.profiles.update(id, dto, acting);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.profiles.remove(id, acting);
  }
}
