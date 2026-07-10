import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSpreadsheetRef } from './spreadsheet.js';
import { CliError } from './types.js';

test('parses id from a full edit URL with gid', () => {
  const ref = parseSpreadsheetRef(
    'https://docs.google.com/spreadsheets/d/1UtpYvZQQPLbf52nVBYS5iURDZ5uQABgB4Cq2zIhhrSs/edit?gid=1822873528#gid=1822873528'
  );
  assert.equal(ref.spreadsheetId, '1UtpYvZQQPLbf52nVBYS5iURDZ5uQABgB4Cq2zIhhrSs');
  assert.equal(ref.gid, 1822873528);
});

test('parses id from a URL without gid', () => {
  const ref = parseSpreadsheetRef('https://docs.google.com/spreadsheets/d/1ocJfQKsfBEyHw27Xv9IYxq-a8j8KDISlsiiLSrER5gI/edit');
  assert.equal(ref.spreadsheetId, '1ocJfQKsfBEyHw27Xv9IYxq-a8j8KDISlsiiLSrER5gI');
  assert.equal(ref.gid, undefined);
});

test('accepts a bare spreadsheet ID', () => {
  const ref = parseSpreadsheetRef('1ocJfQKsfBEyHw27Xv9IYxq-a8j8KDISlsiiLSrER5gI');
  assert.equal(ref.spreadsheetId, '1ocJfQKsfBEyHw27Xv9IYxq-a8j8KDISlsiiLSrER5gI');
  assert.equal(ref.gid, undefined);
});

test('accepts a bare ID with a gid fragment', () => {
  const ref = parseSpreadsheetRef('1ocJfQKsfBEyHw27Xv9IYxq-a8j8KDISlsiiLSrER5gI#gid=0');
  assert.equal(ref.spreadsheetId, '1ocJfQKsfBEyHw27Xv9IYxq-a8j8KDISlsiiLSrER5gI');
  assert.equal(ref.gid, 0);
});

test('gid=0 is parsed as 0', () => {
  const ref = parseSpreadsheetRef('https://docs.google.com/spreadsheets/d/abc123/edit#gid=0');
  assert.equal(ref.gid, 0);
});

test('throws on empty input', () => {
  assert.throws(() => parseSpreadsheetRef('   '), CliError);
});

test('throws on unparseable input', () => {
  assert.throws(() => parseSpreadsheetRef('not a url or id!!'), CliError);
});
