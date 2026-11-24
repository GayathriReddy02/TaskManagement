const router = require("express").Router();
const { protect } = require("../middleware/auth");
const ctrl = require("../controllers/notificationController");
router.use(protect);
router.get("/", ctrl.list);
router.patch("/read-all", ctrl.markAllRead);
router.patch("/:id/read", ctrl.markRead);
module.exports = router;
