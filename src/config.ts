import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { CliError, type ToolConfig } from './types.js';

const configSchema = z.object({
  claspProjectPath: z.string().min(1),
  scriptId: z.string().min(1),
  spreadsheetId: z.string().min(1).optional(),
  defaultSheet: z.string().min(1).optional(),
  webAppUrl: z.string().url().optional(),
  token: z.string().min(1).optional(),
  auth: z.enum(['clasp', 'none']).optional()
});

export const DEFAULT_CONFIG_FILE = '.sheet-tool.json';

export function resolveConfigPath(explicitPath?: string): string {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  return path.resolve(process.cwd(), DEFAULT_CONFIG_FILE);
}

export async function configExists(configPath: string): Promise<boolean> {
  try {
    await access(configPath);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(configPath?: string): Promise<ToolConfig> {
  const resolved = resolveConfigPath(configPath);
  const exists = await configExists(resolved);

  if (!exists) {
    throw new CliError(
      'Configuration file is missing.',
      `Run: sheet init --clasp-project ./apps-script --script-id <SCRIPT_ID> --spreadsheet-id <SPREADSHEET_ID> --web-app-url <EXEC_URL> --auth clasp`
    );
  }

  let parsed: unknown;
  try {
    const raw = await readFile(resolved, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError('Configuration file is not valid JSON.', `Fix or recreate: ${resolved}`);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError(
      'Configuration file has invalid fields.',
      `Expected: claspProjectPath, scriptId, spreadsheetId, optional defaultSheet`
    );
  }

  return {
    ...result.data,
    claspProjectPath: path.resolve(path.dirname(resolved), result.data.claspProjectPath)
  };
}

export async function saveConfig(config: ToolConfig, configPath?: string): Promise<string> {
  const resolved = resolveConfigPath(configPath);
  const validated = configSchema.parse(config);

  const toWrite = {
    ...validated,
    claspProjectPath: path.relative(path.dirname(resolved), path.resolve(validated.claspProjectPath)) || '.'
  };

  await writeFile(resolved, `${JSON.stringify(toWrite, null, 2)}\n`, 'utf8');
  return resolved;
}
