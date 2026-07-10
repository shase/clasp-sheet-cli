/**
 * HTTP entry points for clasp-sheet-cli (GCP-less mode).
 *
 * Mirrors the same RPC contract the CLI used with `clasp run`:
 *   request  : { fn: string, params: any[], token?: string }
 *   response : { ok: true, result: any } | { ok: false, error: string }
 *
 * Deployed as a Web App (executeAs: USER_DEPLOYING, access: ANYONE_ANONYMOUS),
 * so no GCP project / Apps Script API / scripts.run is required.
 *
 * Optional shared secret: set Script Property SHEET_TOOL_TOKEN to require a
 * matching `token` on every call.
 */

var DISPATCH_ = {
  ping: ping,
  listSheets: listSheets,
  readRange: readRange,
  appendRows: appendRows,
  updateRange: updateRange,
  clearRange: clearRange,
  createSheet: createSheet,
  deleteSheet: deleteSheet
};

function doPost(e) {
  return handleRequest_(e);
}

function doGet(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    var payload = parseRequest_(e);

    var expected = PropertiesService.getScriptProperties().getProperty('SHEET_TOOL_TOKEN');
    if (expected && payload.token !== expected) {
      return jsonOutput_({ ok: false, error: 'unauthorized' });
    }

    var fn = Object.prototype.hasOwnProperty.call(DISPATCH_, payload.fn) ? DISPATCH_[payload.fn] : null;
    if (!fn) {
      return jsonOutput_({ ok: false, error: 'unknown function: ' + payload.fn });
    }

    var result = fn.apply(null, payload.params || []);
    return jsonOutput_({ ok: true, result: result });
  } catch (error) {
    return jsonOutput_({ ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function parseRequest_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  var params = e && e.parameter ? e.parameter : {};
  return {
    fn: params.fn,
    params: params.params ? JSON.parse(params.params) : [],
    token: params.token
  };
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
