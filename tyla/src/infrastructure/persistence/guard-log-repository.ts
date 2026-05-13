import fs from 'fs';
import { GuardLogEntry } from '../../domain/types/guard-agent';
import { getGuardLogFile } from '../config/paths';

export function appendGuardLog(entry: GuardLogEntry): void {
    const file = getGuardLogFile();
    let entries: GuardLogEntry[] = [];
    if (fs.existsSync(file)) {
        try {
            entries = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch {
            entries = [];
        }
    }
    entries.push(entry);
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8');
}
