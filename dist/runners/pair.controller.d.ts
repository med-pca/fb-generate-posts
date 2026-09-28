import type { FastifyRequest } from 'fastify';
import { PairDto } from './dto/pair.dto';
import { RunnersService } from './runners.service';
export declare class PairController {
    private readonly runners;
    constructor(runners: RunnersService);
    pair(dto: PairDto, request: FastifyRequest): Promise<{
        apiBaseUrl: string;
        apiKey: string;
        profileExternalId: string;
        profileName: string;
        profileActive: boolean;
    }>;
}
