import {Worker, isMainThread, threadId} from "node:worker_threads";

//to support Promise.delay()
import {promiseHelpers} from "@chumager/promise-helpers";
promiseHelpers();

//the mutex schema
import MutexSchema from "../src/index.js";

//es6 doesn't support native __filename
import {URL} from "node:url";
const __filename = new URL("", import.meta.url).pathname;

//no mongoose, no mutex 😬
import db from "mongoose";

function createWorker() {
  const worker = new Worker(__filename, {env: process.env});
  worker.on("error", err => {
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    // biome-ignore lint/suspicious/noConsole: <explanation>
    console.log(Date.now(), "worker error", worker.threadId, err.message);
  });
}
async function main() {
  if (isMainThread) {
    [...new Array(20)].forEach(() => createWorker());
  } else {
    let delay;
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    // biome-ignore lint/suspicious/noConsole: <explanation>
    console.log(Date.now(), "start", threadId);

    await db.connect("mongodb://127.0.0.1:27017/test?replicaSet=rs0");
    const Mutex = db.model("Mutex", MutexSchema(db));
    await Mutex.ensureIndexes(); //to avoid test db problems and a good practice
    let start;
    delay = Math.round(Math.random() * 1e3);
    try {
      const result = await Mutex.waitLock({
        lockName: "lock1",
        timeout: 2000,
        async fn() {
          start = Date.now();
          // biome-ignore lint/suspicious/noConsoleLog: <explanation>
          // biome-ignore lint/suspicious/noConsole: <explanation>
          console.log(Date.now(), "locked", threadId, delay);
          if (Math.random() > 0.5) throw new Error("function fails");
          await Promise.delay(delay); //simulate some execution time.
          return delay * 2; //hard math processing
        }
      });
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      // biome-ignore lint/suspicious/noConsole: <explanation>
      console.log(Date.now(), "done", threadId, result, Date.now() - start);
    } catch (e) {
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      // biome-ignore lint/suspicious/noConsole: <explanation>
      if (e.code === "TIMEOUT") console.log(Date.now(), "timeout, bye...", threadId);
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      // biome-ignore lint/suspicious/noConsole: <explanation>
      else console.log(Date.now(), "error", threadId, delay, e.message);
    } finally {
      await db.disconnect();
    }
  }
}
main();
