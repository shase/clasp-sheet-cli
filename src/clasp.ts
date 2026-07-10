import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { CliError, type DoctorCheck, type ExecutionAdapter, type ToolConfig } from './types.js';

type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export class ClaspExecutionAdapter implements ExecutionAdapter {
  private readonly config: ToolConfig;

  constructor(config: ToolConfig) {
    this.config = config;
  }

  async invoke<T = unknown>(functionName: string, params: unknown[]): Promise<T> {
    const args = ['run', functionName, '--params', JSON.stringify(params)];
    const result = await this.runClasp(args, true);

    if (result.exitCode !== 0) {
      throw this.mapError(result.stdout, result.stderr);
    }

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    const parsed = this.extractJson(output);

    if (parsed === undefined) {
      throw new CliError(
        'Failed to parse clasp run output as JSON.',
        'Check Apps Script return values and avoid logging non-JSON output.'
      );
    }

    return parsed as T;
  }

  async doctor(): Promise<DoctorCheck[]> {
    const checks: DoctorCheck[] = [];

    const versionResult = await this.runClasp(['--version'], false);
    if (versionResult.exitCode !== 0) {
      checks.push({
        id: 'clasp-installed',
        status: 'fail',
        message: 'clasp is not installed or not available in PATH.',
        suggestion: 'Install with: npm install -g @google/clasp'
      });
      return checks;
    }
    checks.push({
      id: 'clasp-installed',
      status: 'pass',
      message: `clasp detected (${versionResult.stdout.trim() || 'version unknown'})`
    });

    const claspConfigPath = path.join(this.config.claspProjectPath, '.clasp.json');
    const hasClaspConfig = await fileExists(claspConfigPath);
    if (!hasClaspConfig) {
      checks.push({
        id: 'clasp-config',
        status: 'fail',
        message: '.clasp.json was not found in claspProjectPath.',
        suggestion: 'Run clasp create or clasp clone in that directory, then retry.'
      });
    } else {
      checks.push({
        id: 'clasp-config',
        status: 'pass',
        message: '.clasp.json found.'
      });

      const localScriptId = await readClaspScriptId(claspConfigPath);
      if (!localScriptId) {
        checks.push({
          id: 'script-id-match',
          status: 'warn',
          message: 'Could not read scriptId from .clasp.json.',
          suggestion: 'Ensure .clasp.json contains scriptId.'
        });
      } else if (localScriptId !== this.config.scriptId) {
        checks.push({
          id: 'script-id-match',
          status: 'fail',
          message: 'config scriptId does not match .clasp.json scriptId.',
          suggestion: 'Update .sheet-tool.json or .clasp.json so both script IDs are identical.'
        });
      } else {
        checks.push({
          id: 'script-id-match',
          status: 'pass',
          message: 'scriptId matches .clasp.json.'
        });
      }
    }

    const loginStatus = await this.runClasp(['login', '--status'], false);
    if (loginStatus.exitCode !== 0) {
      checks.push({
        id: 'clasp-login',
        status: 'fail',
        message: 'clasp login status check failed.',
        suggestion: 'Run: clasp login'
      });
    } else {
      checks.push({
        id: 'clasp-login',
        status: 'pass',
        message: 'clasp login looks valid.'
      });
    }

    if (hasClaspConfig) {
      try {
        await this.invoke('ping', []);
        checks.push({
          id: 'script-run',
          status: 'pass',
          message: 'clasp run ping succeeded.'
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        checks.push({
          id: 'script-run',
          status: 'fail',
          message: `clasp run ping failed: ${message}`,
          suggestion:
            'Ensure Apps Script API is enabled, the script is pushed with clasp push, and your account has execution access.'
        });
      }
    }

    return checks;
  }

  private async runClasp(args: string[], useProjectCwd: boolean): Promise<RunResult> {
    const cwd = useProjectCwd ? this.config.claspProjectPath : process.cwd();
    try {
      const { stdout, stderr, exitCode } = await execa('clasp', args, {
        cwd,
        reject: false
      });

      return {
        stdout,
        stderr,
        exitCode: exitCode ?? 1
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
        return {
          stdout: '',
          stderr: 'clasp command not found',
          exitCode: 127
        };
      }
      throw error;
    }
  }

  private extractJson(output: string): unknown {
    const trimmed = output.trim();
    if (!trimmed) {
      return undefined;
    }

    const direct = tryJsonParse(trimmed);
    if (direct !== undefined) return direct;

    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return undefined;
    return tryJsonParse(lines[lines.length - 1]);
  }

  private mapError(stdout: string, stderr: string): CliError {
    const body = [stdout, stderr].filter(Boolean).join('\n');
    const lower = body.toLowerCase();

    if (lower.includes('not found') && lower.includes('clasp')) {
      return new CliError('clasp is not installed.', 'Install with: npm install -g @google/clasp');
    }
    if (lower.includes('login required') || lower.includes('not logged in') || lower.includes('credentials')) {
      return new CliError('clasp is not logged in.', 'Run: clasp login');
    }
    if (lower.includes('unable to parse range') || lower.includes('range')) {
      return new CliError('Range appears invalid.', 'Check A1 notation, for example: A1:C20');
    }
    if (lower.includes('unable to open spreadsheet') || lower.includes('spreadsheet')) {
      return new CliError(
        'Spreadsheet access failed.',
        'Verify spreadsheetId in config and share the sheet with your clasp account.'
      );
    }

    const message = body.trim() || 'Unknown clasp execution error.';
    return new CliError(message, 'Run sheet doctor for detailed diagnostics.');
  }
}

function tryJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readClaspScriptId(claspConfigPath: string): Promise<string | null> {
  try {
    const raw = await readFile(claspConfigPath, 'utf8');
    const parsed = JSON.parse(raw) as { scriptId?: unknown };
    return typeof parsed.scriptId === 'string' && parsed.scriptId.trim() ? parsed.scriptId : null;
  } catch {
    return null;
  }
}
