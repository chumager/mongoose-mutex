import {once} from "events";
import {functions} from "@chumager/promise-helpers";
const {timeout} = functions;
class localPromise extends Promise {}
timeout(localPromise);

function create(db) {
  const Mutex = new db.Schema({
    _id: {
      type: String
    },
    description: {
      type: String
    },
    metadata: {
      type: Object
    },
    expires: {
      type: Date
    }
  });
  Mutex.index({expires: 1}, {expireAfterSeconds: 0});
  Mutex.static({
    async lock({lockName, description, metadata, fn, TTL = 60}) {
      if (!lockName) {
        const error = new Error("no lockName");
        error.code = "NO_LOCKNAME";
        throw error;
      }
      const lockDoc = new this({
        _id: lockName,
        description,
        metadata,
        expires: Date.now() + TTL * 1e3
      });
      async function unlock() {
        await lockDoc.deleteOne();
        return;
      }
      try {
        await lockDoc.save();
        if (fn)
          return fn().finally(async () => {
            await unlock();
          });
        return unlock;
      } catch (e) {
        if (e.code === 11000) {
          const err = new Error(`lock ${lockName} is taken`);
          err.code = "LOCK_TAKEN";
          throw err;
        }
        throw e;
      }
    },
    async waitLock({lockName, description, metadata, fn, timeout, TTL = 60}) {
      if (!lockName) {
        const error = new Error("no lockName");
        error.code = "NO_LOCKNAME";
        throw error;
      }
      const lockDoc = new this({
        _id: lockName,
        description,
        metadata,
        expires: Date.now() + TTL * 1e3
      });
      const watch = this.watch([
        {
          $match: {
            operationType: "delete",
            "documentKey._id": lockName
          }
        }
      ]);
      async function unlock() {
        await lockDoc.deleteOne();
        return;
      }
      async function attempt() {
        try {
          await lockDoc.save();
          await watch.close();
        } catch (e) {
          await once(watch, "change");
          return attempt();
        }
      }
      const result = new localPromise(res => {
        let result = attempt();
        if (timeout) result = result.timeout(timeout);
        res(result);
      })
        .catch(async e => {
          await watch.close();
          throw e;
        })
        .then(() => {
          if (fn)
            return fn().finally(async () => {
              await unlock();
            });
          return unlock;
        });
      return result;
    },
    async isLocked(lockName) {
      return !!(await this.findById(lockName).lean());
    }
  });
  return Mutex;
}
export default create;
