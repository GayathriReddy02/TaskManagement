const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const emitter = new EventEmitter();

// Controllers schedule events only AFTER MongoDB write completes.
// Each listener runs independently; a rejected listener is logged.
function publish(event, data) {
  const payload = { ...data, eventId: randomUUID() };
  setImmediate(() => {
    for (const listener of emitter.listeners(event)) {
      Promise.resolve()
        .then(() => listener(payload))
        .catch((err) => {
          console.error(`[event:${event}] listener failed:`, err);
        });
    }
  });
}
module.exports = { emitter, publish };
