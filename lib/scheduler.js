'use strict';
const EventEmitter = require('events')
const assert = require('assert')
const util = require('./util')
const zremlpush = require('./load-lua')('./zremlpush')

/**
 * Manages delayed jobs.
 * Running more than one scheduler on a db will have undefined results
 * @example
 *   createScheduler({
 *     redis: require('redis').createClient(),
 *     interval: 5000
 *   })
 * @param {RedisClient} opt.redis
 * @param {number} opt.interval (5000) Milliseconds between idle polling attempts
 * @return {EventEmitter}
 *
 * @event poll
 * @event start Moving a job to a working queue
 * @event end If-and-only-if a job was moved without error
 * @event error(err)
 * @event close
 */
function createScheduler(opt) {
  const scheduler = new EventEmitter()
  const redis = opt.redis
  const RETRY_INTERVAL = opt.interval || 5000
  let isClosing = false
  let isWorking = false
  let abort = null

  assert(redis, 'redis connection is defined')
  assert(util.isPosInt(RETRY_INTERVAL), 'interval > 0')

  /**
   * @public
   * Stop polling, then emit a "close" event
   */
  function close() {
    if (!isClosing) {
      isClosing = true
      if (!isWorking) abort() // see: run()
      // else wait for next poll()
    }
  }

  /**
   * Fetch a delayed job that is ready to be enqueued
   * @param {function} done(err, jobString)
   */
  function peek(done) {
    // Without this check we can get stuck in the offline queue while shutting down
    if (!redis.connected) done(new Error('not connected'))
    else redis.zrangebyscore(util.DELAYED_JOBS_KEY, '-inf', Date.now(), 'limit',0,1,
    function (err, list) {
      if (err) done(new Error(err.message))
      else if (!list[0]) done(new Error('no delayed jobs'))
      else done(null, list[0])
    })
  }

  /**
   * Watch for a delayed job that's ready to be worked on
   */
  function poll() {
    isWorking = false
    if (isClosing) {
      scheduler.emit('close')
    }
    else {
      scheduler.emit('poll')
      abort = util.retry(RETRY_INTERVAL, peek, run)
    }
  }

  /**
   * Process a job then resume polling
   * @param {Error} err
   * @param {string} data The raw job data, JSON encoded
   */
  function run(err, data) {
    let job = util.parseJSON(data)
    if (err || isClosing) {
      // Job data is stil in the db, so this copy can be discarded
      isClosing = true
      scheduler.emit('close')
    }
    else if (!job) {
      isWorking = true
      scheduler.emit('error', new Error(`dropped invalid job data: ${data}`))
      redis.zrem(util.DELAYED_JOBS_KEY, data, function(err) {
        if (err) scheduler.emit('error', new Error(err.message))
        poll()
      })
    }
    else {
      isWorking = true
      scheduler.emit('start')
      zremlpush(redis, 2, util.DELAYED_JOBS_KEY, util.key(job.queue), data, onEnd)
    }
  }

  /**
   * Called after attempting to move a job to an active queue
   * @param {Error} err
   */
  function onEnd(err) {
    if (err) scheduler.emit('error', new Error(err.message))
    else scheduler.emit('end')
    poll()
  }

  process.nextTick(poll) // Allow time for event listeners
  scheduler.close = close
  return scheduler
}

module.exports = createScheduler
