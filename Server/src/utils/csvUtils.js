function csvCell(value) {
  let text = value == null ? '' : value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join('; ') : String(value);
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
module.exports = {csvCell};
