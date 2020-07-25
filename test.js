"use strict";
const cluster = require("cluster");
//If you play with one process then you don't need this...
//
async function main() {
  if (cluster.isMaster) {
    return [...Array(10).keys()].forEach(() => cluster.fork());
  }
  const Mutex = require(".");
  const {default: promiseHelpers} = require("@chumager/promise-helpers");
  promiseHelpers();
  const db = require("mongoose");
  db.set("useCreateIndex", true);
  console.log("start", cluster.worker.id);

  await db.connect("mongodb://localhost/test", {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log("connected", cluster.worker.id);
  const mutex = await Mutex({
    db, //the mongoose instance to connect to
    TTL: 60, //if exists the TTL for the index.
    model: "Mutex", //the Model name, let you check the Mutex states in you app.
    collection: "__mutexes", //the collection name, to avoid overlap with your collections,
    clean: true, //truncate the collection, to ensure the behavior use chainable also
    chainable: false //first chain the clean and then return the lock function.
  });
  console.log("mutex acquired", cluster.worker.id);
  const a = [];
  //lets the game begin...
  //another mutex trying to get the lock...
  setTimeout(
    () =>
      mutex
        .lock({
          maxTries: 5000,
          fn() {
            a.push("last");
          }
        })
        .then(
          () => console.log(cluster.worker.id, "last", a),
          err => console.error("error in last", cluster.worker.id, err.name, err.code, err.timeout)
        ),
    200
  );
  for (const id of Array(10).keys()) {
    try {
      const free = await mutex.lock({
        lockName: "mutex", //allows you to define several mutex. Default mutex
        maxTries: 1000, //you can define how many times the lock shoud try to acquire. Default 1
        delay: 50, // how much time between tries (in ms). Default 200 ms
        timeout: 0 //the timeout for acquire the lock, 0 means no timeout (Default).
        //you can pass a function directly
        /*
         *fn() {
         *  a.push(id);
         *  return Promise.delay(2000);
         *},
         */
      });
      //you can use the free function to acomplish your task but always remember to call it after you release the lock
      a.push(id);
      console.log("locked", new Date(), cluster.worker.id, id, a.length);
      //if you want to ensure no one else will take the lock for a while, you can delay the "free" call, but remember if you use TTL the document will be deleted eitherway.
      await Promise.delay(100);
      await free();
      //just to show the results...
      console.log("released", new Date(), cluster.worker.id, id);
    } catch (err) {
      //if you want to know why the result is rejected, it could be a mongoose error after several tries, a Q timeout error or an error in your function. Just remember that an error in you function will not release the lock.
      console.error("mutex error", cluster.worker.id, err.name, err.code, err.timeout, id);
    }
  }
  console.log("finish", cluster.worker.id);
  await db.disconnect();
  process.exit(0);
}
main();
