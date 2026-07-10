function getSpreadsheet_(spreadsheetId) {
  assertString_(spreadsheetId, 'spreadsheetId');
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error('Unable to open spreadsheet. Check spreadsheetId and permissions.');
  }
}

function getSheetByName_(spreadsheet, sheetName) {
  assertString_(sheetName, 'sheet');
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  return sheet;
}

function readRangeInternal_(spreadsheetId, sheetName, rangeA1) {
  assertString_(rangeA1, 'range');
  var spreadsheet = getSpreadsheet_(spreadsheetId);
  var sheet = getSheetByName_(spreadsheet, sheetName);
  var values = sheet.getRange(rangeA1).getValues();

  return {
    sheet: sheetName,
    range: rangeA1,
    values: values,
    rowCount: values.length,
    colCount: values.length > 0 ? values[0].length : 0
  };
}

function appendRowsInternal_(spreadsheetId, sheetName, rows) {
  assertRows_(rows);
  var spreadsheet = getSpreadsheet_(spreadsheetId);
  var sheet = getSheetByName_(spreadsheet, sheetName);

  var width = rows[0].length;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i].length !== width) {
      throw new Error('all rows must have the same number of columns');
    }
  }

  var startRow = sheet.getLastRow() + 1;
  var startColumn = 1;
  sheet.getRange(startRow, startColumn, rows.length, width).setValues(rows);

  return {
    sheet: sheetName,
    startRow: startRow,
    rowCount: rows.length,
    colCount: width
  };
}

function updateRangeInternal_(spreadsheetId, sheetName, rangeA1, values) {
  assertString_(rangeA1, 'range');
  assertValues2d_(values);

  var spreadsheet = getSpreadsheet_(spreadsheetId);
  var sheet = getSheetByName_(spreadsheet, sheetName);
  var targetRange = sheet.getRange(rangeA1);

  if (targetRange.getNumRows() !== values.length || targetRange.getNumColumns() !== values[0].length) {
    throw new Error('values dimensions must match target range dimensions');
  }

  targetRange.setValues(values);
  return {
    sheet: sheetName,
    range: rangeA1,
    rowCount: values.length,
    colCount: values[0].length
  };
}

function clearRangeInternal_(spreadsheetId, sheetName, rangeA1) {
  assertString_(rangeA1, 'range');
  var spreadsheet = getSpreadsheet_(spreadsheetId);
  var sheet = getSheetByName_(spreadsheet, sheetName);
  sheet.getRange(rangeA1).clearContent();

  return {
    sheet: sheetName,
    range: rangeA1,
    cleared: true
  };
}

function listSheetsInternal_(spreadsheetId) {
  var spreadsheet = getSpreadsheet_(spreadsheetId);
  var sheets = spreadsheet.getSheets().map(function (sheet) {
    return {
      name: sheet.getName(),
      sheetId: sheet.getSheetId(),
      rows: sheet.getMaxRows(),
      columns: sheet.getMaxColumns()
    };
  });

  return {
    spreadsheetId: spreadsheetId,
    count: sheets.length,
    sheets: sheets
  };
}

function createSheetInternal_(spreadsheetId, sheetName) {
  var spreadsheet = getSpreadsheet_(spreadsheetId);
  assertString_(sheetName, 'name');

  if (spreadsheet.getSheetByName(sheetName)) {
    throw new Error('Sheet already exists: ' + sheetName);
  }

  var created = spreadsheet.insertSheet(sheetName);
  return {
    created: true,
    name: created.getName(),
    sheetId: created.getSheetId()
  };
}

function deleteSheetInternal_(spreadsheetId, sheetName) {
  var spreadsheet = getSpreadsheet_(spreadsheetId);
  var sheet = getSheetByName_(spreadsheet, sheetName);

  if (spreadsheet.getSheets().length <= 1) {
    throw new Error('Cannot delete the last remaining sheet');
  }

  spreadsheet.deleteSheet(sheet);
  return {
    deleted: true,
    name: sheetName
  };
}
