class Demo {
  constructor() {
    this.name = "TaskService";
  }
  print() {
    return this.name;
  }
}
const demo = new Demo();
const unbound = demo.print;
try {
  unbound();
} catch (e) {
  console.log("Lost this:", e.message);
}
console.log(
  demo.print.bind(demo)(),
  (() => demo.print())(),
  demo.print.call(demo),
  demo.print.apply(demo, []),
);
