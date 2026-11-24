const {setTimeout: sleep} = require('node:timers/promises');
async function retry(fn, retries = 3, delay = 1000, {shouldRetry = e => e?.retryable !== false, onFailure = () => {}, wait = sleep} = {}) {
  if (typeof fn !== 'function' || !Number.isInteger(retries) || retries < 0 || retries > 10 || !Number.isFinite(delay) || delay < 0) throw new TypeError('Invalid retry configuration');
  for (let attempt = 1; ; attempt++) {
    try { return await fn(attempt); }
    catch (error) {
      const again = attempt <= retries && shouldRetry(error);
      const nextDelay = again ? delay * 2 ** (attempt - 1) : null;
      await onFailure(error, attempt, nextDelay);
      if (!again) throw error;
      await wait(nextDelay);
    }
  }
}
module.exports = {retry};
