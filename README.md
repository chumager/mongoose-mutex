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

```javascript

"use strict";
const cluster = require("cluster");
const Q = require("q");

//If you play with one process then you don't need this...
if (cluster.isMaster) {
  [...Array(10).keys()].forEach(() => cluster.fork());
} else {
  const Mutex = require(".");
  const db = require("mongoose");

  db.connect("mongodb://localhost/test", {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    const mutex = Mutex({
      db, //the mongoose instance to connect to
      TTL: 60, //if exists the TTL for the index.
      model: "Mutex", //the Model name, let you check the Mutex states in you app.
      collection: "__mutexes", //the collection name, to avoid overlap with your collections,
      clean: false, //truncate the collection, to ensure the behavior use chainable also
      chainable: false //first chain the clean and then return the lock function.
    });
    let a = [];
    console.log("start", cluster.worker.id);
    //lets the game begin...
    setInterval(() => {
      [...Array(10).keys()].forEach(id => {
        mutex
          .lock({
            lockName: "mutex", //allows you to define several mutex. Default mutex
            maxTries: 6, //you can define how many times the lock shoud try to acquire. Default 1
            delay: 200, // how much time between tries (in ms). Default 200 ms
            timeout: 7000 //the timeout for acquire the lock, 0 means no timeout (Default).
            //you can pass a function directly
            /*
             *fn() {
             *  a.push(id);
             *  return Q.delay(2000);
             *},
             */
          })
          //you can use the free function to acomplish your task but always remember to call it after you release the lock
          .then(free => {
            a.push(id);
            console.log("locked", new Date(), cluster.worker.id, id, a);
            //if you want to ensure no one else will take the lock for a while, you can delay the "free" call, but remember if you use TTL the document will be deleted eitherway.
            return Q.delay(120000).then(free);
          })
          //just to show the results...
          .then(() => console.log("resolved", new Date(), cluster.worker.id, id, a))
          //if you want to know why the result is rejected, it could be a mongoose error after several tries, a Q timeout error or an error in your function. Just remember that an error in you function will not release the lock.
          .catch(err => console.error("mutex error", cluster.worker.id, err.name, err.code, err.timeout, id));
      });
      //another mutex trying to get the lock...
      setTimeout(
        () =>
          mutex
            .lock({
              fn() {
                a.push("last");
              }
            })
            .then(() => console.log(cluster.worker.id, "last", a)),
        200
      );
    }, 3000);
  });
}
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

if the fn options is given then it returns an error if can't lock or the result (rejectcion) of the fn. If no fn options is given then it returns a promise fullyfiled with the free function to release the lock, remember to use this function only after your code releases the resorurces needed.

