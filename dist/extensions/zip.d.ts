export declare function crc32(buf: Buffer): number;
export declare function buildZip(files: Array<{
    path: string;
    data: Buffer;
}>, when?: Date): Buffer<ArrayBuffer>;
