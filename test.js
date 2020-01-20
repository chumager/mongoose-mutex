"use strict";
const cluster = require("cluster");
const Q = require("q");

if (cluster.isMaster) {
  Array(10)
    .fill(0)
    .forEach(() => cluster.fork());
} else {
  const Mutex = require(".");
  const db = require("mongoose");

  db.connect("mongodb://localhost/test", {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    const mutex = Mutex({db, TTL: 60});
    let a = [];
    console.log("start", cluster.worker.id);
    setInterval(() => {
      [...Array(10).keys()].forEach(id => {
        mutex
          .lock({
            /*
             *fn() {
             *  a.push(id);
             *  return Q.delay(2000);
             *},
             */
            //maxTries: 6,
            delay: 2000,
            name: id
            //timeout: 7000
          })
          .then(free => {
            a.push(id);
            console.log("locked", new Date(), cluster.worker.id, id, a);
            return Q.delay(120000).then(free);
          })
          .then(() => console.log("resolved", new Date(), cluster.worker.id, id, a))
          .catch(() => {})
          .catch(err => console.error("mutex error", cluster.worker.id, err.name, err.code, err.timeout, id));
      });

      setTimeout(
        () =>
          mutex
            .lock({
              fn() {
                a.push("last");
              },
              name: "last"
            })
            .then(() => console.log(cluster.worker.id, "last", a)),
        200
      );
    }, 3000);
  });
}
