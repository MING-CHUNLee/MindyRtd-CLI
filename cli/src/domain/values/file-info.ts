/**
 * File metadata type
 */

export interface FileInfo {
    path: string;
    name: string;
    size: number;
    modifiedAt: Date;
    extension: string;
}

export function createFileInfo(props: FileInfo): FileInfo {
    const fileInfo: FileInfo = {
        ...props,
        extension: props.extension.toLowerCase(),
    };
    return Object.freeze(fileInfo);
}
