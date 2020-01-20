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
