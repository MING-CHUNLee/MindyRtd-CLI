// Re-export from domain/values — LibraryInfo/LibraryScanResult are domain value objects
export type {
    LibraryInfo,
    LibraryScanResult,
    LibraryScanOptions,
} from '../../domain/values/library-info';
export {
    createLibraryInfo,
    createLibraryScanResult,
} from '../../domain/values/library-info';
