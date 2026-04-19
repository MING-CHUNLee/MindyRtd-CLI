import React from 'react';
import { Box, Text } from 'ink';
import { LibraryScanResultVM, LibraryInfoVM } from '../../../shared/view-models/index.js';

interface LibraryResultCardProps {
    vm: LibraryScanResultVM;
}

const MAX_USER_PACKAGES = 10;

function PackageRow({ lib }: { lib: LibraryInfoVM }) {
    return (
        <Text>
            <Text>   {lib.name.padEnd(28)}</Text>
            <Text dimColor>{lib.version.padEnd(12)}</Text>
            {lib.isBase
                ? <Text color="blue">base</Text>
                : <Text color="green">user</Text>}
        </Text>
    );
}

const LibraryResultCard: React.FC<LibraryResultCardProps> = ({ vm }) => {
    const userLibs = vm.libraries.filter(l => !l.isBase);
    const shown    = userLibs.slice(0, MAX_USER_PACKAGES);

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} marginY={1}>
            <Text bold color="blue">📦 R Libraries</Text>
            <Text dimColor>R {vm.rVersion}  ·  {vm.totalLibraries} total  ·  {vm.userPackages} user  ·  {vm.basePackages} base</Text>

            <Box flexDirection="column" marginTop={1}>
                <Text dimColor>   {'Package'.padEnd(28)}{'Version'.padEnd(12)}Type</Text>
                <Text dimColor>   {'─'.repeat(48)}</Text>
                {shown.map(lib => <PackageRow key={lib.name} lib={lib} />)}
                {userLibs.length > MAX_USER_PACKAGES && (
                    <Text dimColor>   ... and {userLibs.length - MAX_USER_PACKAGES} more user packages</Text>
                )}
            </Box>
        </Box>
    );
};

export default LibraryResultCard;
