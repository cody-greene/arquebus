'use strict';
const fs = require('fs')
const crypto = require('crypto')
const resolvePath = require('path').resolve

/**
 * Create a helper function for executing Lua scripts on the redis server
 * @see http://redis.io/commands/eval
 * @example
 *   let zremlpush = loadLua('zremlpush')
 *   zremlpush(redis, 2, 'my-sorted-set', 'my-list', 'my-data', console.log)
 * @param {string} file Relative location of the Lua script on disk
 */
module.exports = function loadLua(file) {
  const script = fs.readFileSync(resolvePath(__dirname, file) + '.lua')
  const sha = crypto.createHash('sha1').update(script).digest('hex')
  /**
   * @param {RedisClient} redis
   * @param {number} numkeys See: EVAL & Redis Cluster
   * @param {*} ...args
   * @param {function} done(err, res)
   */
  return function execLua(redis, ...args) {
    const done = args.pop()
    redis.evalsha(sha, ...args, function (err, res) {
      if (err && err.code === 'NOSCRIPT')
        redis.eval(script, ...args, done)
      else done(err, res)
    })
  }
}
