function assertString_(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(name + ' must be a non-empty string');
  }
}

function assertRows_(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('rows must be a non-empty array');
  }
  for (var i = 0; i < rows.length; i++) {
    if (!Array.isArray(rows[i])) {
      throw new Error('each row must be an array');
    }
  }
}

function assertValues2d_(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('values must be a non-empty 2D array');
  }
  for (var i = 0; i < values.length; i++) {
    if (!Array.isArray(values[i])) {
      throw new Error('values must be a 2D array');
    }
  }
}

function toErrorResult_(error) {
  return {
    ok: false,
    message: error && error.message ? error.message : String(error)
  };
}
