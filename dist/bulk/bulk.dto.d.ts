export declare class BulkLinkDto {
    profileIds: string[];
    groupIds: string[];
    action: 'link' | 'unlink';
}
export declare class BulkShareDto {
    kind: 'groups' | 'sites';
    ids: string[];
    userIds: string[];
    action: 'grant' | 'revoke';
}
export declare class OptionsQueryDto {
    search?: string;
    categoryId?: string;
}
export declare class BulkMembershipDto {
    profileIds: string[];
    groupIds: string[];
    joinStatus?: 'JOINED' | 'REQUESTED' | 'QUESTIONS' | 'NOT_JOINED';
    preApproved?: boolean;
    linkMissing?: boolean;
}
