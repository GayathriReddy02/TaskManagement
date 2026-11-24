require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Pass --confirm to create or promote an administrator");
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");

  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (
    !name ||
    name.length > 80 ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72
  ) {
    throw new Error(
      "Set ADMIN_NAME, a valid ADMIN_EMAIL, and ADMIN_PASSWORD (8–72 characters)",
    );
  }

  await mongoose.connect(process.env.MONGO_URI);
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.findOneAndUpdate(
    { email },
    {
      $set: { name, password: passwordHash, role: "admin", isActive: true },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
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
