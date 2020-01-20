"use strict";
const Q = require("q");
function create({db, model = "Multer", collection = "__mutexes", clean = false, chainable = false, TTL = 0}) {
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
  const Model = db.model(model, schema);
  let cleaned;
  if (clean) cleaned = Model.deleteMany();
  const start = Date.now();
  let res = {
    lock({lockName = "mutex", fn, maxTries = 1, timeout = 0, delay = 200}) {
      let stop = false;
      const free = () => Model.deleteOne({_id: lockName});
      let lock = [...Array(maxTries).keys()].reduce((p, id) => {
        return p.catch(() => {
          if (id === 0) {
            return Model.create({_id: lockName});
          }
          return Q.delay(delay).then(() => {
            return !stop && Model.create({_id: lockName});
          });
        });
      }, Q.reject());
      lock = timeout ? Q(lock).timeout(timeout) : lock;
      return lock
        .then(() => {
          if (fn) return Q(fn()).finally(free);
          return free;
        })
        .catch(err => {
          err.timeout = Date.now() - start;
          stop = true;
          return Q.reject(err);
        });
    }
  };
  return chainable ? Q(cleaned).then(() => res) : res;
}

module.exports = create;
