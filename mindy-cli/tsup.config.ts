import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'tui/index': 'src/tui/index.tsx',
    },
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    splitting: true,
    clean: true,
    dts: false,
    jsx: 'react',
    shims: true,
    define: {
        __PKG_VERSION__: JSON.stringify(pkg.version),
    },
});
