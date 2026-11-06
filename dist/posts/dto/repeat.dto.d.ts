export declare class RepeatRuleDto {
    repeatTimes?: number | null;
    repeatEveryHours?: number | null;
}
export declare class BulkRepeatDto extends RepeatRuleDto {
    ids: string[];
}
