import type { CurrentUser } from '../auth/current-user';
import { ImportJsonDto } from './dto/import-json.dto';
import { ImportsService } from './imports.service';
export declare class ImportsController {
    private readonly imports;
    constructor(imports: ImportsService);
    importJson(dto: ImportJsonDto, acting: CurrentUser): Promise<{
        received: number;
        imported: number;
        duplicates: number;
    }>;
}
