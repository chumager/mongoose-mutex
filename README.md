# mongoose-mutex
A mutex node.js module who uses mongoose for locking

After searching in npm and realize that the only module for mutex with mongoose was depretated I decided to do one for myself.
The module it's very simple yet powerfull, it uses the uniq index for `_id` and TTL index to prevent mutex to stay locked forever.

## Install
```javascript
yarn add @chumager/mongoose-mutex
```

## Use

### General Usage.
#### Mutex
Only one process (worker), can take the lock and if a process try to lock and is taken will exit.
In this example the lock take a function as parameter so there is no need to unlock. There is a 50% chances the function will fail.
```javascript
//workers needed for test multi process locking
import {Worker, isMainThread, threadId} from "worker_threads";

import {promiseHelpers} from "@chumager/promise-helpers";
promiseHelpers();

import MutexSchema from "./src/index.js";

import {URL} from "url";
const __filename = new URL("", import.meta.url).pathname;

import db from "mongoose";
function createWorker() {
  const worker = new Worker(__filename, {env: process.env});
  worker.on("message", ({type, data}) => {
    switch (type) {
      case "Log":
        process.stderr.write(data);
        break;
    }
  });
  worker.on("error", err => {
    console.log(Date.now(), "worker error", worker.threadId, err.message);
  });
}
async function main() {
  if (isMainThread) {
    [...Array(20).keys()].forEach(() => createWorker());
  } else {
    let delay;
    try {
      console.log(Date.now(), "start", threadId);

      await db.connect(
        // eslint-disable-next-line max-len
        "mongodb://127.0.0.1:27018,127.0.0.1:27019,127.0.0.1:27020/test?replicaSet=rs0&retryWrites=true&readPreference=secondaryPreferred"
      );
      const Mutex = db.model("Mutex", MutexSchema(db));
      //await Mutex.ensureIndexes();
      let start;
      delay = Math.random() * 1e4;
      console.log(Date.now(), "taken", threadId, await Mutex.isLocked("lock1"));
      const unlock = await Mutex.waitLock({
        lockName: "lock1",
        /*
         *async fn() {
         *  console.log(Date.now(), "locked", threadId, delay);
         *  start = Date.now();
         *  await Promise.delay(delay);
         *},
         */
        timeout: 10000
      });
      console.log(Date.now(), "locked", threadId, delay);
      start = Date.now();
      //await Promise.delay(delay);
      await unlock();
      console.log(Date.now(), "done", threadId, Date.now() - start);
    } catch (e) {
      console.log(Date.now(), "error", threadId, delay, e.code, e.message);
    } finally {
      await db.disconnect();
    }
  }
}
main();
```

### Avoid other process to take the resource for a while

```javascript

"use strict";
const cluster = require("cluster");
const Q = require("q");

const Mutex = require("@chumager/mongoose-mutex");
const db = require("mongoose");

db.connect("mongodb://localhost/test", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  const mutex = Mutex({db});
  mutex
    .lock()
    .then(free => {
      Q.delay(120000).then(free); //wait for two minutes before release the lock, or put it inside your task
      //...your task
    })
});
```

## Why
I don't need a mutex (for now), what I needed was a way to avoid other processes to consume an API, but this way it'll help others developers...

## Mutex.

the Mutex functions allows to define the mongoose model to use to lock.

### Options

Option | Default | Definition
------ | ------- | ----------
db | | the mongoose instance to connect to and create the model.
model | "Mutex" | the model name.
collection | "__mutexes" | the collection name, remember to aavoit using an already existing collection.
clean | false | delete the collection after the Mutex model is created.
chainable | false | if true it chains the clean and then return the object with the lock function.
TTL | | if the value exists then it creates the collection with a TTL index for expire field and then define expire as Date with a default of `Date.now() + TTL * 1000`

### Returns.

In case of chainable options equals false, the it returns an object with the lock function, If it's true then returns a Promise with the same object.

## lock.

the locking function.

### Options

Option | Default | Definition
------ | ------- | ----------
lockName | "mutex" | the name of the mutex, this allows you to use several mutex with the same collection.
fn | | if defined then it's called after locking and chained with a final free call.
maxTries | 1 | how many tries before reject the locking, it's one because I needed that way, yo can define `Infinity` it you want to try forever.
timeout | 0 | if greather than 0 then it fails if the time trying to lock it's above that, beware that this timeout is called after the locking process starts and in a local db service the process take about 25 ms, so values below that may not work.
delay | 200 | the time between tries. Remember not to use a low value to avoid over use of resources.

### Returns

if the fn options is given then it returns an error if can't lock or the result (rejectcion) of the fn. If no fn options is given then it returns a promise fullyfiled with the free function to release the lock, remember to use this function only after your code releases the resources needed.

