import { UpdateJoinStatusDto } from './dto/update-join-status.dto';
import { GroupsService } from './groups.service';
export declare class GroupJoinController {
    private readonly groups;
    constructor(groups: GroupsService);
    list(profileExternalId: string, status?: string): Promise<{
        id: string;
        externalId: string | null;
        name: string;
        url: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
        joinCheckedAt: Date | null;
        joinError: string | null;
    }[]>;
    updateStatus(profileExternalId: string, groupId: string, dto: UpdateJoinStatusDto): Promise<{
        groupId: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
        joinCheckedAt: Date | null;
        joinError: string | null;
    }>;
}
