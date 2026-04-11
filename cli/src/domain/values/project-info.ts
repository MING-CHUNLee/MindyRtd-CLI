/**
 * Project metadata type
 */

export interface ProjectInfo {
    name: string;
    path: string;
    type: 'rproj' | 'inferred';
}

export function createProjectInfo(props: ProjectInfo): ProjectInfo {
    return Object.freeze({ ...props });
}
