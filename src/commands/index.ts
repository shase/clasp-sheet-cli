import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { WebAppExecutionAdapter } from '../webapp.js';
import { loadConfig, resolveConfigPath, saveConfig } from '../config.js';
import { parseSpreadsheetRef } from '../spreadsheet.js';
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
    .option('--spreadsheet-id <id>', 'default target Spreadsheet ID (optional; pass --url per command instead)')
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
    .option('--url <sheetUrl|id>', 'target spreadsheet URL or ID (overrides config)')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const configPath = resolveConfigPath(options.config);
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);

      const spreadsheetId = resolveSpreadsheet(options.url, config).spreadsheetId;

      const spinner = ora('Checking Apps Script backend').start();
      const ping = await adapter.invoke<{ ok: boolean; timestamp: string }>('ping', []);
      const list = await adapter.invoke<{ count: number }>('listSheets', [spreadsheetId]);
      spinner.stop();

      console.log(chalk.cyan('Config'));
      console.log(`  file: ${configPath}`);
      console.log(`  claspProjectPath: ${config.claspProjectPath}`);
      console.log(`  scriptId: ${config.scriptId}`);
      console.log(`  spreadsheetId: ${spreadsheetId}`);
      console.log(`  defaultSheet: ${config.defaultSheet ?? '-'}`);
      console.log(chalk.cyan('Backend'));
      console.log(`  ping: ${ping.ok ? 'ok' : 'fail'} (${ping.timestamp})`);
      console.log(`  sheets: ${list.count}`);
    });

  program
    .command('list')
    .description('List sheets in the target spreadsheet')
    .option('--url <sheetUrl|id>', 'target spreadsheet URL or ID (overrides config)')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const { spreadsheetId } = resolveSpreadsheet(options.url, config);
      const result = await adapter.invoke<{ sheets: Array<{ name: string }> }>('listSheets', [spreadsheetId]);
      console.log(formatJson(result));
    });

  program
    .command('read')
    .description('Read a range from a sheet')
    .option('--range <a1>', 'A1 range, for example A1:C20', 'A1:Z1000')
    .option('--sheet <name>', 'sheet name')
    .option('--url <sheetUrl|id>', 'target spreadsheet URL or ID (overrides config; gid selects the tab)')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const ref = resolveSpreadsheet(options.url, config);
      const sheet = await resolveSheet(adapter, ref, options.sheet, config.defaultSheet);
      const result = await adapter.invoke('readRange', [ref.spreadsheetId, sheet, options.range]);
      console.log(formatJson(result));
    });

  program
    .command('append')
    .description('Append rows to a sheet')
    .option('--sheet <name>', 'sheet name')
    .option('--json <path>', 'path to JSON file')
    .option('--inline <json>', 'inline JSON string')
    .option('--url <sheetUrl|id>', 'target spreadsheet URL or ID (overrides config; gid selects the tab)')
    .option('--config <path>', 'config file path')
    .action(async (options: JsonInputOptions & { sheet?: string; url?: string; config?: string }) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const ref = resolveSpreadsheet(options.url, config);
      const sheet = await resolveSheet(adapter, ref, options.sheet, config.defaultSheet);
      const rows = await readJsonInput(options);
      const result = await adapter.invoke('appendRows', [ref.spreadsheetId, sheet, rows]);
      console.log(formatJson(result));
    });

  program
    .command('update')
    .description('Update a specific range in a sheet')
    .requiredOption('--range <a1>', 'A1 range, for example B2:D10')
    .option('--sheet <name>', 'sheet name')
    .option('--json <path>', 'path to JSON file')
    .option('--inline <json>', 'inline JSON string')
    .option('--url <sheetUrl|id>', 'target spreadsheet URL or ID (overrides config; gid selects the tab)')
    .option('--config <path>', 'config file path')
    .action(async (options: JsonInputOptions & { range: string; sheet?: string; url?: string; config?: string }) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const ref = resolveSpreadsheet(options.url, config);
      const sheet = await resolveSheet(adapter, ref, options.sheet, config.defaultSheet);
      const values = await readJsonInput(options);
      const result = await adapter.invoke('updateRange', [ref.spreadsheetId, sheet, options.range, values]);
      console.log(formatJson(result));
    });

  program
    .command('clear')
    .description('Clear a range in a sheet')
    .requiredOption('--range <a1>', 'A1 range, for example A2:Z100')
    .option('--sheet <name>', 'sheet name')
    .option('--url <sheetUrl|id>', 'target spreadsheet URL or ID (overrides config; gid selects the tab)')
    .option('--config <path>', 'config file path')
    .action(async (options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const ref = resolveSpreadsheet(options.url, config);
      const sheet = await resolveSheet(adapter, ref, options.sheet, config.defaultSheet);
      const result = await adapter.invoke('clearRange', [ref.spreadsheetId, sheet, options.range]);
      console.log(formatJson(result));
    });

  program
    .command('create <name>')
    .description('Create a new sheet')
    .option('--url <sheetUrl|id>', 'target spreadsheet URL or ID (overrides config)')
    .option('--config <path>', 'config file path')
    .action(async (name, options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const { spreadsheetId } = resolveSpreadsheet(options.url, config);
      const result = await adapter.invoke('createSheet', [spreadsheetId, name]);
      console.log(formatJson(result));
    });

  program
    .command('delete <name>')
    .description('Delete an existing sheet')
    .option('--url <sheetUrl|id>', 'target spreadsheet URL or ID (overrides config)')
    .option('--config <path>', 'config file path')
    .action(async (name, options) => {
      const config = await loadConfig(options.config);
      const adapter = createAdapter(config);
      const { spreadsheetId } = resolveSpreadsheet(options.url, config);
      const result = await adapter.invoke('deleteSheet', [spreadsheetId, name]);
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

interface ResolvedSpreadsheet {
  spreadsheetId: string;
  gid?: number;
  /** True when the spreadsheet came from --url rather than the config default. */
  overridden: boolean;
}

function resolveSpreadsheet(url: string | undefined, config: ToolConfig): ResolvedSpreadsheet {
  if (url) {
    const ref = parseSpreadsheetRef(url);
    return { spreadsheetId: ref.spreadsheetId, gid: ref.gid, overridden: true };
  }
  if (config.spreadsheetId) {
    return { spreadsheetId: config.spreadsheetId, overridden: false };
  }
  throw new CliError('Target spreadsheet is missing.', 'Pass --url <sheetUrl|id> or set spreadsheetId in config.');
}

async function resolveSheet(
  adapter: ExecutionAdapter,
  ref: ResolvedSpreadsheet,
  sheetOption: string | undefined,
  defaultSheet: string | undefined
): Promise<string> {
  if (sheetOption) {
    return sheetOption;
  }

  if (ref.gid !== undefined) {
    const { sheets } = await adapter.invoke<{ sheets: Array<{ name: string; sheetId: number }> }>('listSheets', [
      ref.spreadsheetId
    ]);
    const match = sheets.find((sheet) => sheet.sheetId === ref.gid);
    if (!match) {
      throw new CliError(`No sheet found for gid=${ref.gid}.`, 'Pass --sheet <name> explicitly or check the URL.');
    }
    return match.name;
  }

  // defaultSheet only applies to the config's own spreadsheet, not a --url override.
  if (!ref.overridden && defaultSheet) {
    return defaultSheet;
  }

  throw new CliError(
    'Sheet name is missing.',
    'Provide --sheet <name>, include a gid in --url, or set defaultSheet in config.'
  );
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
