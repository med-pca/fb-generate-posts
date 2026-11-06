import { ValidationOptions } from 'class-validator';
export declare const LANGUAGES: Record<string, string>;
export declare const languageName: (code: string) => string;
export declare const isKnownLanguage: (code: unknown) => boolean;
export declare function loadLanguages(rows: Array<{
    code: string;
    name: string;
}>): void;
export declare function IsKnownLanguage(options?: ValidationOptions): (object: object, propertyName: string) => void;
