import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
export declare function postGroupIds(prisma: Pick<PrismaService, 'group'>, groupIds: string[], acting: CurrentUser | null): Promise<string[]>;
