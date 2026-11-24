const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { listUsers } = require("../controllers/userController");
router.get("/", protect, listUsers);
module.exports = router;
