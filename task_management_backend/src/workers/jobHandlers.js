const {record} = require('../services/activityService');
const {notificationService} = require('../services/notificationService');
const {generate} = require('../services/exportService');
module.exports={activity:({event,payload})=>record(event,payload),notification:({event,payload})=>notificationService.handle(event,payload),report:generate};
