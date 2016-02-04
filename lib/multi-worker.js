'use strict'
const EventEmitter = require('events')
const assert = require('assert')
const mrpop = require('./load-lua')('./mrpop')
const util = require('./util')
const createLagHelper = require('./lag-helper')

/**
 * Can run multiple jobs in parallel. Will back off when the event-loop becomes too slow.
 * Same options as the standard worker, plus event-loop monitoring options:
 * @param {number?} opt.max (100) Number of jobs allowed to run in parallel
 * @param {number?} opt.high (40)
 * @param {number?} opt.step (500)
 * @param {number?} opt.decay (3)
 */
function createMultiWorker(opt) {
  const MAX_ACTIVE = opt.max || 100
  const RETRY_INTERVAL = opt.interval || 5000
  const QUEUES = opt.queues.map(util.key)
  const redis = opt.redis
  const MRPOP_ARGS = [redis, QUEUES.length].concat(QUEUES)
  const worker = new EventEmitter()
  const lh = createLagHelper({
    decay: opt.decay || 3,
    high: opt.high || 50,
    step: opt.step || 500,
  })
  const jobHandlers = opt.jobs
  let abort = null
  let isClosing = false
  let isClosed = false
  let activeJobs = new Set()

  assert(redis, 'redis connection is defined')
  assert(Object.keys(jobHandlers).length, 'job handlers are defined')
  assert(QUEUES.length, 'queue names are defined')
  assert(util.isPosInt(RETRY_INTERVAL), 'interval > 0')
  assert(util.isPosInt(MAX_ACTIVE), 'max > 0')

  /**
   * @public
   * Stop polling, wait for the current jobs to complete, then emit a "close" event
   */
  function close() {
    if (!isClosing) {
      isClosing = true
      lh.stop()
      abort()
      // wait for the next poll() and for all jobHandlers to complete
    }
  }

  /**
   * Fetch a job from available queues
   * @param {function} done(err, queueKey, jobString)
   */
  function pop(done) {
    // Without this check we can get stuck in the offline queue while shutting down
    if (!redis.connected) done(new Error('not connected'))

    else if (lh.isBusy() && activeJobs.size) done(new Error('process busy'))
    else if (activeJobs.size >= MAX_ACTIVE) done(new Error('too many jobs'))
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
    if (isClosing) {
      if (!isClosed && !activeJobs.size) {
        isClosed = true
        worker.emit('close')
      }
      // else wait for jobHandlers to complete
    }
    else {
      worker.emit('poll')
      abort = util.retry(RETRY_INTERVAL, pop, run)
    }
  }

  /**
   * Starting process a job and continue polling
   * @param {Error} err
   * @param {string} key The redis queue key
   * @param {string} data The raw job data, JSON encoded
   */
  function run(err, key, data) {
    const queue = util.unkey(key)
    const job = util.parseJSON(data)
    if (err) {
      // Worker is shutting down; do nothing
    }
    else if (!job) {
      worker.emit('error', new Error(`invalid job data from "${queue}" queue: ${data}`))
    }
    else if (!jobHandlers[job.type]) {
      worker.emit('error', new Error('handler not found; job discarded'), job)
    }
    else {
      // Even if isClosing:true, job data has been removed from redis, so we can't gracefully stop here
      activeJobs.add(job)
      worker.emit('start', job)
      invokeJobHandler(jobHandlers[job.type], job)
    }
    poll()
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
      activeJobs.delete(job)
      if (err) worker.emit('error', err, job)
      else worker.emit('end', job)
      if (!isClosed && isClosing && !activeJobs.size) {
        isClosed = true
        worker.emit('close')
      }
    }, job.params, job))
  }

  lh.start()
  process.nextTick(poll)
  worker.active = activeJobs
  worker.close = close
  return worker
}

module.exports = createMultiWorker
