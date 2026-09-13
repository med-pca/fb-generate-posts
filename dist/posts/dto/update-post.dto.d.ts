import { CreatePostDto } from './create-post.dto';
declare const UpdatePostDto_base: import("@nestjs/common").Type<Partial<Omit<CreatePostDto, "profileId" | "groupIds">>>;
export declare class UpdatePostDto extends UpdatePostDto_base {
}
export {};
