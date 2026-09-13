import { ImportJsonDto } from './dto/import-json.dto';
import { ImportsService } from './imports.service';
export declare class ImportsController {
    private readonly imports;
    constructor(imports: ImportsService);
    importJson(dto: ImportJsonDto): Promise<{
        received: number;
        imported: number;
        duplicates: number;
    }>;
}
