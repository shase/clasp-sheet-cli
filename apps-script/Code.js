function ping() {
  return {
    ok: true,
    service: 'apps-script',
    timestamp: new Date().toISOString()
  };
}

function listSheets(spreadsheetId) {
  try {
    return listSheetsInternal_(spreadsheetId);
  } catch (error) {
    throw new Error('listSheets failed: ' + toErrorResult_(error).message);
  }
}

function readRange(spreadsheetId, sheet, range) {
  try {
    return readRangeInternal_(spreadsheetId, sheet, range);
  } catch (error) {
    throw new Error('readRange failed: ' + toErrorResult_(error).message);
  }
}

function appendRows(spreadsheetId, sheet, rows) {
  try {
    return appendRowsInternal_(spreadsheetId, sheet, rows);
  } catch (error) {
    throw new Error('appendRows failed: ' + toErrorResult_(error).message);
  }
}

function updateRange(spreadsheetId, sheet, range, values) {
  try {
    return updateRangeInternal_(spreadsheetId, sheet, range, values);
  } catch (error) {
    throw new Error('updateRange failed: ' + toErrorResult_(error).message);
  }
}

function clearRange(spreadsheetId, sheet, range) {
  try {
    return clearRangeInternal_(spreadsheetId, sheet, range);
  } catch (error) {
    throw new Error('clearRange failed: ' + toErrorResult_(error).message);
  }
}

function createSheet(spreadsheetId, name) {
  try {
    return createSheetInternal_(spreadsheetId, name);
  } catch (error) {
    throw new Error('createSheet failed: ' + toErrorResult_(error).message);
  }
}

function deleteSheet(spreadsheetId, name) {
  try {
    return deleteSheetInternal_(spreadsheetId, name);
  } catch (error) {
    throw new Error('deleteSheet failed: ' + toErrorResult_(error).message);
  }
}
