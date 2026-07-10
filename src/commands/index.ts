import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { WebAppExecutionAdapter } from '../webapp.js';
import { loadConfig, resolveConfigPath, saveConfig } from '../config.js';
import { CliError, type DoctorCheck, type ExecutionAdapter, type ToolConfig } from '../types.js';

type JsonInputOptions = {
  json?: string;
  inline?: string;
};

export function registerCommands(program: Command): void {

  program
    .command('init')
    .description('Create local sheet tool configuration')
    .option('--config <path>', 'config file path')
    .option('--clasp-project <path>', 'path to clasp project', './apps-script')
    .requiredOption('--script-id <id>', 'Apps Script project ID')
    .requiredOption('--spreadsheet-id <id>', 'Target Spreadsheet ID')
    .option('--default-sheet <name>', 'default sheet name')
    .requiredOption('--web-app-url <url>', 'Web App /exec URL the CLI calls over HTTP')
    .option('--token <token>', 'shared secret sent with each Web App call (optional)')
    .option('--auth <mode>', 'Web App auth: "clasp" (Bearer token from clasp login) or "none"', 'none')
    .action(async (options) => {
      const written = await saveConfig(
        {
          claspProjectPath: options.claspProject,
          scriptId: options.scriptId,
          spreadsheetId: options.spreadsheetId,
          defaultSheet: options.defaultSheet,
          webAppUrl: options.webAppUrl,
          token: options.token,
          auth: options.auth
        },
        options.config
      );

      console.log(chalk.green(`Configuration saved: ${written}`));
      console.log(chalk.gray('Next: run sheet doctor'));
    });

  program
    .command('doctor')
    .description('Validate Web App configuration and connectivity')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const spinner = ora('Running environment checks').start();
      const checks = await adapter.doctor();
      spinner.stop();
      printDoctorChecks(checks);

      if (checks.some((check) => check.status === 'fail')) {
        throw new CliError('Doctor found failing checks.', 'Resolve failures and run sheet doctor again.');
      }
    });

  program
    .command('status')
    .description('Show config and backend connectivity')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const configPath = resolveConfigPath(options.config);
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);

      const spinner = ora('Checking Apps Script backend').start();
      const ping = await adapter.invoke<{ ok: boolean; timestamp: string }>('ping', []);
      const list = await adapter.invoke<{ count: number }>('listSheets', [config.spreadsheetId]);
      spinner.stop();

      console.log(chalk.cyan('Config'));
      console.log(`  file: ${configPath}`);
      console.log(`  claspProjectPath: ${config.claspProjectPath}`);
      console.log(`  scriptId: ${config.scriptId}`);
      console.log(`  spreadsheetId: ${config.spreadsheetId}`);
      console.log(`  defaultSheet: ${config.defaultSheet ?? '-'}`);
      console.log(chalk.cyan('Backend'));
      console.log(`  ping: ${ping.ok ? 'ok' : 'fail'} (${ping.timestamp})`);
      console.log(`  sheets: ${list.count}`);
    });

  program
    .command('list')
    .description('List sheets in the configured spreadsheet')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const result = await adapter.invoke<{ sheets: Array<{ name: string }> }>('listSheets', [config.spreadsheetId]);
      console.log(formatJson(result));
    });

  program
    .command('read')
    .description('Read a range from a sheet')
    .requiredOption('--range <a1>', 'A1 range, for example A1:C20')
    .option('--sheet <name>', 'sheet name')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const sheet = resolveSheet(options.sheet, config.defaultSheet);
      const result = await adapter.invoke('readRange', [config.spreadsheetId, sheet, options.range]);
      console.log(formatJson(result));
    });

  program
    .command('append')
    .description('Append rows to a sheet')
    .option('--sheet <name>', 'sheet name')
    .option('--json <path>', 'path to JSON file')
    .option('--inline <json>', 'inline JSON string')
    .option('--config <path>', 'config file path')
    .action(async (options: JsonInputOptions & { sheet?: string; config?: string }) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const sheet = resolveSheet(options.sheet, config.defaultSheet);
      const rows = await readJsonInput(options);
      const result = await adapter.invoke('appendRows', [config.spreadsheetId, sheet, rows]);
      console.log(formatJson(result));
    });

  program
    .command('update')
    .description('Update a specific range in a sheet')
    .requiredOption('--range <a1>', 'A1 range, for example B2:D10')
    .option('--sheet <name>', 'sheet name')
    .option('--json <path>', 'path to JSON file')
    .option('--inline <json>', 'inline JSON string')
    .option('--config <path>', 'config file path')
    .action(async (options: JsonInputOptions & { range: string; sheet?: string; config?: string }) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const sheet = resolveSheet(options.sheet, config.defaultSheet);
      const values = await readJsonInput(options);
      const result = await adapter.invoke('updateRange', [config.spreadsheetId, sheet, options.range, values]);
      console.log(formatJson(result));
    });

  program
    .command('clear')
    .description('Clear a range in a sheet')
    .requiredOption('--range <a1>', 'A1 range, for example A2:Z100')
    .option('--sheet <name>', 'sheet name')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const sheet = resolveSheet(options.sheet, config.defaultSheet);
      const result = await adapter.invoke('clearRange', [config.spreadsheetId, sheet, options.range]);
      console.log(formatJson(result));
    });

  program
    .command('create <name>')
    .description('Create a new sheet')
    .option('--config <path>', 'config file path')
    .action(async (name, options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const result = await adapter.invoke('createSheet', [config.spreadsheetId, name]);
      console.log(formatJson(result));
    });

  program
    .command('delete <name>')
    .description('Delete an existing sheet')
    .option('--config <path>', 'config file path')
    .action(async (name, options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const result = await adapter.invoke('deleteSheet', [config.spreadsheetId, name]);
      console.log(formatJson(result));
    });
}

function createAdapter(config: ToolConfig): ExecutionAdapter {
  return new WebAppExecutionAdapter(config);
}

function printDoctorChecks(checks: DoctorCheck[]): void {
  for (const check of checks) {
    const symbol = check.status === 'pass' ? chalk.green('PASS') : check.status === 'warn' ? chalk.yellow('WARN') : chalk.red('FAIL');
    console.log(`${symbol} ${check.id} - ${check.message}`);
    if (check.suggestion) {
      console.log(chalk.gray(`  suggestion: ${check.suggestion}`));
    }
  }
}

function resolveSheet(input: string | undefined, fallback: string | undefined): string {
  const resolved = input ?? fallback;
  if (!resolved) {
    throw new CliError('Sheet name is missing.', 'Provide --sheet <name> or set defaultSheet in config.');
  }
  return resolved;
}

async function readJsonInput(options: JsonInputOptions): Promise<unknown> {
  const provided = [Boolean(options.json), Boolean(options.inline)];
  if (provided.filter(Boolean).length > 1) {
    throw new CliError('Provide only one input source.', 'Use either --json, --inline, or stdin.');
  }

  if (options.json) {
    const raw = await readFile(options.json, 'utf8');
    return parseJson(raw);
  }

  if (options.inline) {
    return parseJson(options.inline);
  }

  if (!process.stdin.isTTY) {
    const raw = await readAllStdin();
    return parseJson(raw);
  }

  throw new CliError('JSON input is missing.', 'Provide --json <file>, --inline <json>, or pipe JSON via stdin.');
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new CliError('Input JSON is invalid.', 'Check JSON syntax and try again.');
  }
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
