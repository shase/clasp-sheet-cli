#!/usr/bin/env node

import process from 'node:process';
import { Command } from 'commander';
import chalk from 'chalk';
import { registerCommands } from './commands/index.js';
import { CliError } from './types.js';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('sheet')
    .description('Manipulate Google Sheets through Apps Script via clasp run')
    .version('0.1.0');

  registerCommands(program);

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  if (error instanceof CliError) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (error.suggestion) {
      console.error(chalk.yellow(`Suggestion: ${error.suggestion}`));
    }
    process.exitCode = 1;
    return;
  }

  const fallback = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`Unexpected error: ${fallback}`));
  process.exitCode = 1;
});
