const router = require("express").Router();
const { protect, requireRole } = require("../middleware/auth");
const { listUsers } = require("../controllers/userController");
router.get("/", protect, requireRole("admin"), listUsers);
module.exports = router;
