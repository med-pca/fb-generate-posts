import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('pings the database and reports ok', async () => {
      await expect(appController.health()).resolves.toEqual({
        status: 'ok',
        database: 'connected',
      });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('propagates a database failure', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
      await expect(appController.health()).rejects.toThrow(
        'connection refused',
      );
    });
  });
});
