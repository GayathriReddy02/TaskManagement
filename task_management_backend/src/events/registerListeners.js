const { registerActivityListeners } = require("../services/activityService");
const {
  registerNotificationListeners,
} = require("../services/notificationService");
let registered = false;
function registerListeners() {
  if (registered) return;
  registerActivityListeners();
  registerNotificationListeners();
  registered = true;
}
module.exports = { registerListeners };
