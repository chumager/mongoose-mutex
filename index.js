"use strict";
const {
  functions: {delay, timeout}
} = require("@chumager/promise-helpers");
class localPromise extends Promise {}
delay(localPromise);
timeout(localPromise);
function create({db, model = "Mutex", collection = "__mutexes", clean = false, chainable = false, TTL = 0}) {
  //base schema
  const schema = new db.Schema(
    {
      _id: {
        type: "String"
      }
    },
    {
      collection
    }
  );
  //in case of using TTL
  if (TTL) {
    schema.index(
      {
        expire: 1
      },
      {
        expireAfterSeconds: 0
      }
    );
    schema.add({
      expire: {
        type: Date,
        default() {
          return Date.now() + TTL * 1000;
        }
      }
    });
  }
  //model creation
  const Model = db.model(model, schema);
  //delete Mutex on start by setting
  let cleaned;
  if (clean) cleaned = Model.deleteMany();
  //returning object
  let res = {
    //function for locking mutex
    lock({lockName = "mutex", fn, maxTries = 1, timeout, delay = 100}) {
      const start = Date.now();
      //stop helps to stop lock loop it timeout.
      let stop = false;
      //release function
      const free = () => Model.deleteOne({_id: lockName});
      let lock = [...Array(maxTries).keys()].reduce((p, id) => {
        //reverse logic, assuming catch
        return p.catch(() => {
          //if first try just create
          const bulk = [
            {
              insertOne: {
                document: {_id: lockName}
              }
            }
          ];
          const bulkOptions = {
            w: "majority",
            j: true
          };
          if (id === 0) {
            return Model.bulkWrite(bulk, bulkOptions);
          }
          //id not first wait until next attempt
          return localPromise.delay(delay).then(() => {
            return !stop && Model.bulkWrite(bulk, bulkOptions);
          });
        });
      }, localPromise.reject());
      //in case of timeout
      lock = timeout ? lock.timeout(timeout) : lock;
      return lock.then(
        () => {
          if (fn) return localPromise.resolve(fn()).finally(free);
          return free;
        },
        err => {
          err.timeout = Date.now() - start;
          stop = true;
          if (/E11000/.test(err.message)) {
            const error = new Error(`unable to acquire lock ${lockName}`);
            error.name = "MutexLockError";
            throw error;
          }
          throw err;
        }
      );
    }
  };
  return chainable ? localPromise(cleaned).then(() => res) : res;
}

module.exports = create;
