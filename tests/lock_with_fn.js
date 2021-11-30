import {Worker, isMainThread, threadId} from "worker_threads";

//to support Promise.delay()
import {promiseHelpers} from "@chumager/promise-helpers";
promiseHelpers();

//the mutex schema
import MutexSchema from "../src/index.js";

//es6 doesn't support native __filename
import {URL} from "url";
const __filename = new URL("", import.meta.url).pathname;

//no mongoose, no mutex 😬
import db from "mongoose";

function createWorker() {
  const worker = new Worker(__filename, {env: process.env});
  worker.on("error", err => {
    console.log(Date.now(), "worker error", worker.threadId, err.message);
  });
}
async function main() {
  if (isMainThread) {
    [...Array(20).keys()].forEach(() => createWorker());
  } else {
    let delay;
    console.log(Date.now(), "start", threadId);

    await db.connect("mongodb://127.0.0.1:27018,127.0.0.1:27019,127.0.0.1:27020/test?replicaSet=rs0");
    const Mutex = db.model("Mutex", MutexSchema(db));
    await Mutex.ensureIndexes(); //to avoid test db problems and a good practice
    let start;
    delay = Math.round(Math.random() * 1e3);
    try {
      const result = await Mutex.lock({
        lockName: "lock1",
        async fn() {
          start = Date.now();
          console.log(Date.now(), "locked", threadId, delay);
          if (Math.random() > 0.5) throw new Error("function fails");
          await Promise.delay(delay); //simulate some execution time.
          return delay * 2; //hard math processing
        }
      });
      console.log(Date.now(), "done", threadId, result, Date.now() - start);
    } catch (e) {
      if (e.code === "LOCK_TAKEN") console.log(Date.now(), "lock taken, bye", threadId);
      else console.log(Date.now(), "error", threadId, delay, e.message);
    } finally {
      await db.disconnect();
    }
  }
}
main();
