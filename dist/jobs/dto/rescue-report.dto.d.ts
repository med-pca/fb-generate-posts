export declare class RescueReportDto {
    profileExternalId: string;
    outcome: 'done' | 'already' | 'failed';
    detail?: string;
    commentExternalId?: string;
}
