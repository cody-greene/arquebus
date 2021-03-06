'use strict'
const crypto = require('crypto')
const QUEUE_PREFIX = 'arquebus:queue:'
const DELAYED_JOBS_KEY = 'arquebus:delayed'
const TOKEN_BYTE_LENGTH = 18

const isPosInt = val => Number.isInteger(val) && val > 0
const identity = val => val

/**
 * TODO: find v8 ref explaining why try-catch will de-optimize containing blocks
 * @param {string} src
 * @return {object}
 */
function parseJSON(src) {
  try { return JSON.parse(src) }
  catch (x){ /*ignore*/ }
}

/**
 * Omit falsy values, except 0
 * Array elements may be converted to null
 * @param {string} key
 * @param {*} val
 * @return {*}
 */
function mostlyTruthy(_, val){ if (val || val === 0) return val }

/*
 * Omitting useless (AKA falsy) values can greatly reduce size
 * @param {Object} src
 * @return {string}
 */
function toJSON(src){ return JSON.stringify(src, mostlyTruthy) }

/**
 * Encode some data as url-safe base64
 * @param {Buffer} buf
 * @return {string}
 */
function toSafe64(buf) {
  return buf.toString('base64')
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
    .replace(/=+$/, '')
}

/**
 * Generate a random token for use as a unique ID, etc.
 * @return {string}
 */
function token() {
  return toSafe64(crypto.randomBytes(TOKEN_BYTE_LENGTH))
}

/**
 * Convert a queue name to/from a redis key
 * @param {string} val
 * @return {string}
 */
function key(val){ return QUEUE_PREFIX + val }
function unkey(val){ return val ? val.replace(QUEUE_PREFIX, '') : '' }

/**
 * @param {object} opt Job description
 * @param {string} id Unique job id
 */
function serializeJob(opt, id) {
  return toJSON({
    id: id,
    queue: opt.queue,
    type: opt.type,
    params: opt.params
  })
}

/**
 * Post a new job for an active worker to execute
 * @example
 *   let redis = require('redis').createClient()
 *   // You may want to partially bind this:
 *   // enqueue = enqueue.bind(null, redis)
 *   enqueue(redis, {queue:'low', type:'ping'}, console.log)
 *   enqueue(redis, {queue:'hi', type:'ping', params: {
 *     foo: true,
 *     bar: 'baz'
 *   }}, console.log)
 * @param {RedisClient} redis
 * @param {string} opt.queue e.g. critical, high, low
 * @param {string} opt.type Name of the job handler
 * @param {object?} opt.params e.g. userid: '123'
 *        note: falsy params are omitted entirely
 * @param {number?} opt.time Delay the job until: epoch-time in milliseconds
 * @param {function} done(err, id) Receives a unique job id if successful
 */
function enqueue(redis, opt, done) {
  const id = opt.id || token()
  const payload = serializeJob(opt, id)
  if (opt.time) redis.zadd(DELAYED_JOBS_KEY, opt.time, payload, next)
  else redis.lpush(key(opt.queue), payload, next)
  function next(err) {
    // Omit node_redis internals from stack trace by re-creating the Error
    if (err) done(new Error(err.message))
    else done(null, id)
  }
}

/**
 * Retries until successful or explicitly aborted.
 * When aborting: waits for the current task to complete/fail
 * @param {number} max Maximum delay between attempts
 * @param {function} task(next)
 * @param {function} done(err, res)
 * @return {function} abort()
 */
function retry(max, task, done) {
  let isWorking = false
  let isClosing = false
  let timer = null
  function boundTask() {
    isWorking = true
    task(next)
  }
  function next(err, one, two) {
    isWorking = false
    if (!err) process.nextTick(function (){ done(null, one, two) })
    else if (isClosing) process.nextTick(function (){ done(err) })
    else timer = setTimeout(boundTask, max)
  }
  boundTask()
  return function abort() {
    if (!isWorking && !isClosing) {
      clearTimeout(timer)
      process.nextTick(function (){ done(new Error('cancelled')) })
    }
    isClosing = true
  }
}

module.exports = {
  parseJSON, toJSON, mostlyTruthy, toSafe64, token, isPosInt, identity,
  DELAYED_JOBS_KEY, QUEUE_PREFIX,
  enqueue, key, unkey, serializeJob, retry
}
