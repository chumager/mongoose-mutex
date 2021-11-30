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
  //check for locking error
  if(e.code !== "LOCK_TAKEN") console.error(e);
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

