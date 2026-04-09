import React from 'react';
import { Box, Text } from 'ink';
import { RInstallResultVM } from '../../view-models/index.js';

interface RInstallResultCardProps {
    vm: RInstallResultVM;
}

const RInstallResultCard: React.FC<RInstallResultCardProps> = ({ vm }) => {
    return (
        <Box flexDirection="column" borderStyle="round" borderColor={vm.success ? 'green' : 'red'} paddingX={1} marginY={1}>
            <Text bold color={vm.success ? 'green' : 'red'}>
                {vm.success ? '✓' : '✗'} Install: {vm.packageName}
                {vm.version && <Text dimColor>  v{vm.version}</Text>}
            </Text>
            <Text dimColor>{vm.message}</Text>
        </Box>
    );
};

export default RInstallResultCard;
