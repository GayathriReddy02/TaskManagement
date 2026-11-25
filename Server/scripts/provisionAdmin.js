require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../src/models/User");

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Pass --confirm to create or promote an administrator");
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");

  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (
    !name ||
    name.length > 80 ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Set ADMIN_NAME and a valid ADMIN_EMAIL");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new Error("Register the account before promoting it");
  }
  if (!user.password) {
    throw new Error("The account must have a password before promotion");
  }
  user.name = name;
  user.role = "admin";
  user.isActive = true;
  await user.save();
  console.log(`Administrator provisioned (${user.id})`);
}

main()
  .catch((error) => {
    console.error("Admin provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
