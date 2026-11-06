import { RepeatRuleDto } from './repeat.dto';
export declare class CreatePostDto extends RepeatRuleDto {
    title: string;
    description: string;
    url?: string;
    imageUrl?: string;
    delay: number;
    groupIds: string[];
}
