# mongoose-mutex
A mutex node.js module who uses mongoose for locking

## Why
After searching in npm and realize that the only module for mutex with mongoose was deprecated I decided to do one for myself.
The module it's very simple yet powerful, it uses the unique index for `_id` and TTL index to prevent mutex to stay locked forever.

## Install

```sh
pnpm add @chumager/mongoose-mutex
#or
yarn add @chumager/mongoose-mutex
```

## Use
### Basics.
#### With function parameter.
```javascript
import MutexSchema from "@chumager/mongoose-mutex";
//use mongoose to create the model.
const Mutex = mongoose.model("Mutex", MutexSchema);
//ensure indexes in case you need it.
await Mutex.ensureIndexes();

//lock
try {
  const result = await Mutex.lock({
    lockName: "lock", //required
    async fn() {
      //function definition with some data returned
    }
  });
  //there is no need to unlock, the module does it for you...
  console.log("result!!! 😬", result);
}catch(e){
  //check for locking error
  if(e.code !== "LOCK_TAKEN") console.error(e);
}

```
#### Without function parameter.
```javascript
import MutexSchema from "@chumager/mongoose-mutex";
//use mongoose to create the model.
const Mutex = mongoose.model("Mutex", MutexSchema);
//ensure indexes in case you need it.
await Mutex.ensureIndexes();

//lock
try {
  const unlock = await Mutex.lock({
    lockName: "lock" //required
  });
  //do your stuff...
  await unlock(); 
  //await is only needed if you'll disconnect to 
  //the db any time soon to avoid trying to reach the db when disconnected;
}catch(e){
  //release the lock
  if (typeof unlock === "function") await unlock();
  console.log(Date.now(), "error", threadId, delay, e.message);
}

```

### General Usage.
#### Exclusive lock with inner function
Only one process (worker), can take the lock, if a process try to lock and is taken will exit.
In this example the lock take a function as parameter so there is no need to unlock. There is a 50% chance function will fail.
```javascript
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
        lockName: "lock1", //required
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
```
#### Exclusive lock with outher function
Only one process (worker), can take the lock, if a process try to lock and is taken will exit.
In this example the lock doesn't take a function as parameter so you need to unlock checking for errors. There is a 50% chance function will fail.
```javascript
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
    console.log(Date.now(), "start", threadId);

    await db.connect("mongodb://127.0.0.1:27018,127.0.0.1:27019,127.0.0.1:27020/test?replicaSet=rs0");
    const Mutex = db.model("Mutex", MutexSchema(db));
    await Mutex.ensureIndexes(); //to avoid test db problems and a good practice
    const delay = Math.round(Math.random() * 1e3);
    let unlock;
    try {
      unlock = await Mutex.lock({
        lockName: "lock1" //required
      });
      const start = Date.now();
      console.log(Date.now(), "locked", threadId, delay);
      //do your stuff.
      if (Math.random() > 0.5) throw new Error("function fails");
      await Promise.delay(delay);
      console.log(Date.now(), "done", threadId, Date.now() - start);
      await unlock(); //await needed because we disconnect immediately
    } catch (e) {
      if (e.code === "LOCK_TAKEN") console.log(Date.now(), "lock taken, bye", threadId);
      else {
        //release the lock
        if (typeof unlock === "function") await unlock();
        console.log(Date.now(), "error", threadId, delay, e.message);
      }
    } finally {
      await db.disconnect();
    }
  }
}
main();
```
#### Mutex with inner function
Only one process (worker), can take the lock, if a process try to lock and is taken will wait until it could be taken.
In this example the lock take a function as parameter so there is no need to unlock. There is a 50% chance function will fail.
```javascript
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
      const result = await Mutex.waitLock({
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
      console.log(Date.now(), "error", threadId, delay, e.message);
    } finally {
      await db.disconnect();
    }
  }
}
main();
```
#### Mutex with inner function and timeout
Only one process (worker), can take the lock, if a process try to lock and is taken will wait until it could be taken with a timeout.
In this example the lock take a function as parameter so there is no need to unlock. There is a 50% chance function will fail.
```javascript
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
      const result = await Mutex.waitLock({
        lockName: "lock1",
        timeout: 2000,
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
      if (e.code === "TIMEOUT") console.log(Date.now(), "timeout, bye...", threadId);
      else console.log(Date.now(), "error", threadId, delay, e.message);
    } finally {
      await db.disconnect();
    }
  }
}
main();
```
## Why
I don't need a mutex (for now), what I needed was a way to avoid other processes to consume an API, but this way it'll help others developers...

## Mutex.

The Mutex functions allows to define the mongoose model to use to lock.

### Static Model Functions
#### .lock()
Lock function only allows one lock simultaneously and rejects if is taken.
Option | Type | Default | Required | Definition
------ | ---- | ------- | -------- | ----------
options | Object | {TTL: 60} | yes | the options object.
options.lockName | String | undefined | yes | the name of the lock, same locking logic, uses the same lockName.
options.description | String | undefined | no | add a description to the lock document in the db, just for debug.
options.metadata | Object | undefined | no | an object that allows to inserta any data you want to the lock.
options.fn | Function | undefined | no | the function to be executed after lock and unlock after complete.
options.TTL | Number | 60 | no | Number of seconds to wait until the lock is released, uses the mongodb TTL index logic. If you expect your code last more than 60 seconds then you must change this value, otherwise other process will take the lock and eventually the first one will release the second one.

##### Returns.
If there is a fn key in options, then the result will be the fulfilled o rejected value of this function.
If there is no fn key, an unlock function will be returned.
In case there is a lock error, it will reject with an error with core equals to "LOCK_TAKEN"
#### .waitLock()
WaitLock function only allows one lock simultaneously and waits until lock is released or timeout is accomplished.

Option | Type | Default | Required | Definition
------ | ---- | ------- | -------- | ----------
options | Object | {TTL: 60} | yes | the options object.
options.lockName | String | undefined | yes | the name of the lock, same locking logic, uses the same lockName.
options.description | String | undefined | no | add a description to the lock document in the db, just for debug.
options.metadata | Object | undefined | no | an object that allows to inserta any data you want to the lock.
options.fn | Function | undefined | no | the function to be executed after lock and unlock after complete.
options.TTL | Number | 60 | no | Number of seconds to wait until the lock is released, uses the mongodb TTL index logic. If you expect your code last more than 60 seconds then you must change this value, otherwise other process will take the lock and eventually the first one will release the second one.
options.timeout | Number | undefined | no | If the timeout is defined and the lock is taken, waits until timeout ms to take the lock, otherwise reject.

##### Returns.
If there is a fn key in options, then the result will be the fulfilled o rejected value of this function.
If there is no fn key, an unlock function will be returned.
In case there is a timeout, it will reject with an error with core equals to "TIMEOUT"
#### .isLocked(lockName)

##### Returns.
It return if the lock is taken or not, but you have to realize the lock could be taken or released microseconds before it changes, so use it carefully.

### Examples (not code).
- If you have a multi process (workers) service and all want to do one task, you can use ```.lock()``` so only one process will do the task.
- if you need an infinite queue, you can use ```.waitLock()``` so all the task will be serialized.
