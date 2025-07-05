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
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    // biome-ignore lint/suspicious/noConsole: <explanation>
    console.log(Date.now(), "start", threadId);

    await db.connect("mongodb://127.0.0.1:27017/test?replicaSet=rs0");
    const Mutex = db.model("Mutex", MutexSchema(db));
    await Mutex.ensureIndexes(); //to avoid test db problems and a good practice
    const delay = Math.round(Math.random() * 1e3);
    let unlock;
    try {
      unlock = await Mutex.lock({
        lockName: "lock1" //required
      });
      const start = Date.now();
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      // biome-ignore lint/suspicious/noConsole: <explanation>
      console.log(Date.now(), "locked", threadId, delay);
      //do your stuff.
      if (Math.random() > 0.5) throw new Error("function fails");
      await Promise.delay(delay);
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      // biome-ignore lint/suspicious/noConsole: <explanation>
      console.log(Date.now(), "done", threadId, Date.now() - start);
      await unlock(); //await needed because we disconnect immediately
    } catch (e) {
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      // biome-ignore lint/suspicious/noConsole: <explanation>
      if (e.code === "LOCK_TAKEN") console.log(Date.now(), "lock taken, bye", threadId);
      else {
        //release the lock
        if (typeof unlock === "function") await unlock();
        // biome-ignore lint/suspicious/noConsoleLog: <explanation>
        // biome-ignore lint/suspicious/noConsole: <explanation>
        console.log(Date.now(), "error", threadId, delay, e.message);
      }
    } finally {
      await db.disconnect();
    }
  }
}
main();
