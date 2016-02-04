'use strict';
const EventEmitter = require('events')
const assert = require('assert')
const util = require('./util')
const mrpop = require('./load-lua')('./mrpop')

/**
 * Scalable background job runner
 * @example
 *   createWorker({
 *     redis: require('redis').createClient(),
 *     queues: ['hi', 'md', 'lo'],
 *     jobs: {
 *       // @param {function} done(err) Provided first since it must always be used
 *       // @param {object} params Additional options provided when the job was enqueued
 *       // @param {object} job Access the job type & id
 *       ping(done, params, job) {
 *         console.log('foo params:', params)
 *         done(new Error('not implemented'))
 *       }
 *     }
 *   })
 * @param {RedisClient} opt.redis
 * @param {string[]} opt.queues e.g. ['critical', 'high', 'low']
 * @param {object} opt.jobs Map of jobs types to handlers.
 *        Each handler must be of the form: `f(done, params)`
 * @param {number} opt.interval (5000) Milliseconds between idle polling attempts
 *
 * @return {EventEmitter}
 * @event poll When watching for new jobs
 * @event start(job) When processing a job
 * @event end If-and-only-if a job handler has invoked its callback without error
 * @event error(err)
 * @event close See worker.close(...)
 */
function createWorker(opt) {
  const RETRY_INTERVAL = opt.interval || 5000
  const QUEUES = opt.queues.map(util.key)
  const redis = opt.redis
  const MRPOP_ARGS = [redis, QUEUES.length].concat(QUEUES)
  const worker = new EventEmitter()
  const jobHandlers = opt.jobs
  let abort = null
  let isClosing = false
  let isWorking = false

  assert(redis, 'redis connection is defined')
  assert(Object.keys(jobHandlers).length, 'job handlers are defined')
  assert(QUEUES.length, 'queue names are defined')
  assert(util.isPosInt(RETRY_INTERVAL), 'interval > 0')

  /**
   * @public
   * Stop polling, wait for the current job to complete, then emit a "close" event
   * Calling .close() for a second time has no effect
   */
  function close() {
    if (!isClosing) {
      isClosing = true
      if (!isWorking) abort() // goto: run(err)
      // else wait for next next poll event
    }
  }

  /**
   * Fetch a job from available queues
   * @param {function} done(err, queueKey, jobString)
   */
  function pop(done) {
    // Without this check we can get stuck in the offline queue while shutting down
    if (!redis.connected) done(new Error('not connected'))
    else mrpop.apply(null, MRPOP_ARGS.concat(function (err, res) {
      if (err) done(new Error(err.message))
      else if (!res) done(new Error('no jobs'))
      else done(null, res[0], res[1])
    }))
  }

  /**
   * Watch prioritized queues for a job and then process it.
   * This is a good point to stop gracefully
   * since a job will have just completed/failed
   */
  function poll() {
    isWorking = false
    if (isClosing) {
      worker.emit('close')
    } else {
      worker.emit('poll')
      abort = util.retry(RETRY_INTERVAL, pop, run)
    }
    return worker
  }

  /**
   * Process a job then resume polling
   * @param {Error} err
   * @param {string} key The redis queue key
   * @param {string} data The raw job data, JSON encoded
   */
  function run(err, key, data) {
    let queue = util.unkey(key)
    let job = util.parseJSON(data)
    if (err) {
      worker.emit('close')
    }
    else if (!job) {
      worker.emit('error', new Error(`invalid job data from "${queue}" queue: ${data}`))
      poll()
    }
    else if (!jobHandlers[job.type]) {
      worker.emit('error', new Error('handler not found; job discarded'), job)
      poll()
    }
    else {
      // Even if isClosing:true, job data has been removed from redis, so we can't gracefully stop here
      isWorking = true
      worker.emit('start', job)
      invokeJobHandler(jobHandlers[job.type], job)
    }
  }

  /**
   * @param {function} handler(done, params)
   * @param {object} job
   */
  function invokeJobHandler(handler, job) {
    let called = false
    // Always start with a fresh callstack
    process.nextTick(() => handler(err => {
      if (called) {
        worker.emit('error', new Error('jobHandler callback invoked multiple times'), job)
        return
      }
      called = true
      if (err) worker.emit('error', err, job)
      else worker.emit('end', job)
      poll()
    }, job.params, job))
  }

  process.nextTick(poll)
  worker.close = close
  return worker
}

module.exports = createWorker
