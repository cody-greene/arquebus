'use strict';
let EventEmitter = require('events')
let util = require('./util')

/**
 * Manages delayed jobs.
 * Running more than one scheduler on a db will have undefined results
 * @example
 *   createScheduler({
 *     redis: require('redis').createClient(),
 *     interval: 5000
 *   })
 * @param {RedisClient} opt.redis
 * @param {number} opt.interval (5000) Milliseconds between polling attempts
 * @return {EventEmitter}
 *
 * @event poll
 * @event start(job) Moving a job to a working queue
 * @event end If-and-only-if a job was moved without error
 * @event error(err)
 * @event close
 */
function createScheduler(opt) {
  // Validate options, check for common errors
  if (!opt.redis) throw new Error('opt.redis: no redis connection')

  let scheduler = new EventEmitter()
  let redis = opt.redis
  let retry = util.retry.bind(null, {max: opt.interval || 5000})
  let isClosing = false
  let isWorking = false
  let abort = null

  /**
   * @public
   * Stop polling, then emit a "close" event
   * This will also end the redis connection
   * @param {function?} done Same as .on('close', done)
   */
  function close(done) {
    if (!isClosing) {
      isClosing = true
      if (done) scheduler.once('close', done)
      if (!isWorking) abort() // see: run()
      // else wait for next poll()
    }
  }

  /**
   * Fetch a delayed job that is ready to be enqueued
   * @param {function} done(err, jobString)
   */
  function peek(done) {
    redis.zrangebyscore(util.DELAYED_JOBS_KEY, '-inf', Date.now(), 'limit',0,1,
    function (err, list) {
      let data = list[0]
      if (err) done(new Error(err.message))
      else if (!data) done(new Error('no delayed jobs'))
      else done(null, data)
    })
  }

  /**
   * Watch for a delayed job that's ready to be worked on
   */
  function poll() {
    isWorking = false
    if (isClosing) {
      redis.end()
      scheduler.emit('close')
    }
    else {
      scheduler.emit('poll')
      abort = retry(peek, run)
    }
  }

  /**
   * Process a job then resume polling
   * @param {Error} err
   * @param {string} data The raw job data, JSON encoded
   */
  function run(err, data) {
    let job = util.parseJSON(data)
    // Should only get an error here when shutting down, but just in case...
    if (err && !isClosing) scheduler.emit('error', err)
    if (err || isClosing) {
      // Job data is stil in the db, so this copy can be discarded
      isClosing = true
      redis.end()
      scheduler.emit('close')
    }
    else if (!job) {
      isWorking = true
      scheduler.emit('error', new Error(`invalid job data: ${data}`))
      redis.zrem(util.DELAYED_JOBS_KEY, data, function(err) {
        if (err) scheduler.emit('error', new Error(err.message))
        poll()
      })
    }
    else {
      isWorking = true
      scheduler.emit('start', job)
      redis.multi()
        .zrem(util.DELAYED_JOBS_KEY, data)
        .lpush(util.key(job.queue), data)
      .exec(onEnd)
    }
  }

  /**
   * Called after attempting to move a job to an active queue
   * @param {Error} err
   * @param {array} res
   */
  function onEnd(err, res) {
    if (err) scheduler.emit('error', new Error(err.message))
    else if (res[0] instanceof Error)
      scheduler.emit('error', new Error(res[0].message))
    else if (res[1] instanceof Error)
      scheduler.emit('error', new Error(res[1].message))
    else scheduler.emit('end')
    poll()
  }

  process.nextTick(poll) // Allow time for event listeners
  scheduler.close = close
  return scheduler
}

module.exports = createScheduler
