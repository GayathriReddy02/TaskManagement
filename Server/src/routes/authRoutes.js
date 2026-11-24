const router = require("express").Router();
const { register, login, me, logout } = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { authRateLimit } = require("../middleware/authRateLimit");
router.post("/register", authRateLimit, register);
router.post("/login", authRateLimit, login);
router.post("/logout", logout);
router.get("/me", protect, me);
module.exports = router;
