import React from 'react';
import { Box, Text } from 'ink';
import { ScanResultVM, ScannedFileVM } from '../../../shared/view-models/index.js';

interface ScanResultCardProps {
    vm: ScanResultVM;
}

const MAX_FILES = 5;

function FileSection({ label, files }: { label: string; files: ScannedFileVM[] }) {
    if (files.length === 0) return null;
    const shown = files.slice(0, MAX_FILES);
    return (
        <Box flexDirection="column">
            <Text color="cyan">{label} <Text dimColor>({files.length})</Text></Text>
            {shown.map(f => (
                <Text key={f.path} dimColor>   • {f.path}</Text>
            ))}
            {files.length > MAX_FILES && (
                <Text dimColor>   ... and {files.length - MAX_FILES} more</Text>
            )}
        </Box>
    );
}

const ScanResultCard: React.FC<ScanResultCardProps> = ({ vm }) => {
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} marginY={1}>
            <Text bold color="green">📁 Scan Results</Text>
            <Text dimColor>Project: {vm.projectName ?? vm.baseDir}  ·  Total: {vm.totalFiles} files</Text>
            <Box flexDirection="column" marginTop={1}>
                <FileSection label="R Scripts"   files={vm.rScripts} />
                <FileSection label="R Markdown"  files={vm.rMarkdown} />
                <FileSection label="R Data"      files={vm.rData} />
                <FileSection label="Data Files"  files={vm.dataFiles} />
                <FileSection label="Documents"   files={vm.documents} />
                <FileSection label="R Project"   files={vm.rProject} />
            </Box>
        </Box>
    );
};

export default ScanResultCard;
