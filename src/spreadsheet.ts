import { CliError } from './types.js';

export interface SpreadsheetRef {
  spreadsheetId: string;
  /** Sheet (tab) id parsed from a `gid=` query/fragment, when present. */
  gid?: number;
}

const URL_ID = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const RAW_ID = /^[a-zA-Z0-9-_]+$/;
const GID = /[?#&]gid=(\d+)/;

/**
 * Accepts either a full Google Sheets URL or a bare spreadsheet ID and returns
 * the spreadsheet ID plus an optional `gid` (sheet/tab id) parsed from the URL.
 */
export function parseSpreadsheetRef(input: string): SpreadsheetRef {
  const value = input.trim();
  if (!value) {
    throw new CliError('Spreadsheet reference is empty.', 'Pass a Google Sheets URL or a spreadsheet ID.');
  }

  const gidMatch = value.match(GID);
  const gid = gidMatch ? Number(gidMatch[1]) : undefined;

  const urlMatch = value.match(URL_ID);
  if (urlMatch) {
    return { spreadsheetId: urlMatch[1], gid };
  }

  // Bare ID, optionally followed by a `?...`/`#...` (e.g. `<id>#gid=0`).
  const idCandidate = value.split(/[?#]/, 1)[0];
  if (RAW_ID.test(idCandidate)) {
    return { spreadsheetId: idCandidate, gid };
  }

  throw new CliError(
    'Could not parse a spreadsheet ID from the input.',
    'Pass a full Google Sheets URL (…/spreadsheets/d/<id>/…) or a bare spreadsheet ID.'
  );
}
