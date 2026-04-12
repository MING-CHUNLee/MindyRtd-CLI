export interface LocaleData {
    role: {
        title: string;
        description: string;
        tasks: { title: string; items: string[] };
        language: { title: string; description: string; options: string[]; note: string };
    };
    environment: {
        title: string;
        basicInfo: {
            title: string;
            rVersion: string;
            rHome: string;
            libraryPaths: string;
            totalPackages: string;
            base: string;
            user: string;
        };
        keyPackages: { title: string; installed: string };
        userPackages: { title: string; more: string };
    };
    capabilities: {
        title: string;
        intro: string;
        analysis: { title: string; available: string; notAvailable: string };
        specific: { title: string };
        warning: string;
        categories: Record<string, string>;
    };
    files: {
        title: string;
        project: {
            title: string;
            name: string;
            type: string;
            workingDir: string;
            noProject: string;
            na: string;
        };
        stats: {
            title: string;
            rScripts: string;
            rMarkdown: string;
            rData: string;
            total: string;
            files: string;
        };
        available: { title: string };
    };
    constraints: {
        title: string;
        safety: {
            title: string;
            never: string;
            askFirst: string;
            showDiff: string;
            items: {
                noDelete: string;
                noSystem: string;
                confirmInstall: string;
                confirmModify: string;
            };
        };
        error: { title: string; items: string[] };
        style: { title: string; items: string[] };
        output: { title: string; codeFormat: string; explanation: string };
    };
    custom: { title: string };
    minimal: { note: string };
}
