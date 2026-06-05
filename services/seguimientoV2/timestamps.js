function nowUtc() {
  return new Date().toISOString();
}

function encodeTimestampFilter(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return encodeURIComponent(new Date().toISOString());
  }
  return encodeURIComponent(date.toISOString());
}

module.exports = {
  nowUtc,
  encodeTimestampFilter,
};
