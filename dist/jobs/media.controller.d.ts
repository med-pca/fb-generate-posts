import { StreamableFile } from '@nestjs/common';
import { MediaService } from './media.service';
export declare class MediaController {
    private readonly media;
    constructor(media: MediaService);
    image(url: string): Promise<StreamableFile>;
}
