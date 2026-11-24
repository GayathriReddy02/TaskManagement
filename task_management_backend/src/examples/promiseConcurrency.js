// Milestone 6 learning examples. Run with: node src/examples/promiseConcurrency.js
const ok = (v, ms) =>
  new Promise((resolve) => setTimeout(() => resolve(v), ms));
const fail = (msg, ms) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
async function demo() {
  console.log("all", await Promise.all([ok("total", 10), ok("pending", 20)]));
  console.log(
    "allSettled",
    await Promise.allSettled([ok("done", 10), fail("db unavailable", 20)]),
  );
  console.log(
    "race",
    await Promise.race([ok("fast result", 20), ok("slow result", 50)]),
  );
  console.log(
    "any",
    await Promise.any([fail("first failed", 10), ok("fallback result", 30)]),
  );
}
demo().catch(console.error);
