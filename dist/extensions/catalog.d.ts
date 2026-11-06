export type PresetContext = {
    origin: string;
    apiKey: string;
    nstApiKey: string;
};
export type ExtensionDef = {
    key: string;
    name: string;
    letter: string;
    color: string;
    dir: string;
    role: string;
    installOn: string;
    include?: string[];
    exclude: RegExp;
    preset?: {
        file: string;
        fill: (text: string, ctx: PresetContext) => string;
    };
    kind?: 'chrome' | 'wordpress' | 'agent';
    versionOf?: (read: (path: string) => string | undefined) => string;
    zipRoot?: string;
    installHint?: string;
    nstKey?: 'required' | 'useful';
    nstKeyWhy?: string;
};
export declare function setField(text: string, field: string, value: string): string;
export declare const EXTENSIONS: ExtensionDef[];
