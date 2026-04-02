/**
 * Domain Interface: IRScriptRunner
 *
 * Contract for executing R code.
 * Tools depend on this interface, never on the concrete r-script-runner directly.
 */

export interface IRScriptRunner {
    exec(rCode: string): Promise<{ stdout: string; stderr: string }>;
}
