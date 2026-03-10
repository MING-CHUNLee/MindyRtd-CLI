import * as diff from 'diff';
import chalk from 'chalk';

export class DiffEngine {
    /**
     * 比較兩個字串並返回帶有顏色的終端機輸出 (Patch 格式簡化版)
     */
    public generateColoredDiff(oldStr: string, newStr: string): string {
        const differences = diff.diffLines(oldStr, newStr);
        let output = '';

        // 若完全相同
        if (differences.length === 1 && !differences[0].added && !differences[0].removed) {
            return chalk.gray('檔案無任何變更。');
        }

        differences.forEach((part) => {
            if (part.added) {
                output += chalk.green(this.prefixLines(part.value, '+ '));
            } else if (part.removed) {
                output += chalk.red(this.prefixLines(part.value, '- '));
            } else {
                output += chalk.gray(this.prefixLines(part.value, '  '));
            }
        });

        return output;
    }

    /**
     * 為每一行加上前綴符號
     */
    private prefixLines(text: string, prefix: string): string {
        return text
            .replace(/\n$/, '')
            .split('\n')
            .map(line => `${prefix}${line}\n`)
            .join('');
    }
}
