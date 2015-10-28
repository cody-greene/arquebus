'use strict';
let EventEmitter = require('events')
let util = require('./util')

/**
 * Scalable background job runner
 * @example
 *   createWorker({
 *     redis: require('redis').createClient(),
 *     queues: ['hi', 'md', 'lo'],
 *     jobs: {
 *       // @param {function} done(err) Provided first since it must always be used
 *       // @param {object} params Additional options provided when the job was enqueued
 *       ping(done, params) {
 *         console.log('foo params:', params)
 *         done(new Error('not implemented'))
 *       }
 *     }
 *   })
 * @param {RedisClient} opt.redis
 * @param {string[]} opt.queues default: ['critical', 'high', 'low']
 * @param {object} opt.jobs Map of jobs types to handlers
 * @param {number} opt.interval (5000) Milliseconds between polling attempts
 * @param {boolean} opt.hardcore (false) By default, any error (even async)
 *        thrown from a job handler will be captured in the form of an `error` event.
 *        Otherwise these ProgrammerErrors become UncaughtExceptions and crash the app
 * @return {EventEmitter}
 *
 * @event poll When watching for new jobs
 * @event start(job) When processing a job
 * @event end If-and-only-if a job handler has invoked its callback without error
 * @event error(err)
 * @event close See worker.close(...)
 *
 * A job handler is a function of the form f(done, params)
 * @param {function} done(err) Provided first since it must always be used
 * @param {object} params Additional options provided when the job was enqueued
 */
function createWorker(opt) {
  // Validate options & check for common errors
  if (!opt.redis) throw new Error('opt.redis: no redis connection')
  if (!opt.jobs) throw new Error('opt.jobs: no job handlers')
  if (!Array.isArray(opt.queues) || !opt.queues.length) throw new Error('opt.queues: no queues')

  let worker = new EventEmitter()
  let isClosing = false
  let isWorking = false
  let redis = opt.redis
  let queueParams = [...opt.queues.map(util.key), 1]
  let retry = util.retry.bind(null, {max: opt.interval || 5000})
  let jobHandlers = opt.jobs
  let abort = null
  let handlerDomain = null

  if (!opt.hardcore) {
    handlerDomain = require('domain').create()
    jobHandlers = util.mapValues(jobHandlers, handler => handlerDomain.bind(handler))
    handlerDomain.on('error', function (err) {
      // Unexpected ProgrammerError thrown from job handler
      worker.emit('error', err)
      poll()
    })
  }

  /**
   * @public
   * Stop polling, wait for the current job to complete, then emit a "close" event
   * Calling .close() for a second time has no effect
   * This will also end the redis connection
   * @param {function?} done Same as .on('close', done)
   */
  function close(done) {
    if (!isClosing) {
      isClosing = true
      if (done) worker.once('close', done)
      if (!isWorking) abort() // goto: run(err)
      // else wait for next next poll event
    }
  }

  /**
   * Fetch a job from available queues
   * @param {function} done(err, queueKey, jobString)
   */
  function pop(done) {
    redis.brpop(queueParams, function (err, res) {
      if (err) done(new Error(err.message))
      else if (!res) done(new Error('no jobs'))
      else done(null, ...res)
    })
  }

  /**
   * Watch prioritized queues for a job and then process it.
   * This is a good point to stop gracefully
   * since a job will have just completed/failed
   */
  function poll() {
    isWorking = false
    if (isClosing) {
      redis.end()
      worker.emit('close')
    } else {
      worker.emit('poll')
      abort = retry(pop, run)
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
    let handler = null
    if (err) {
      redis.end()
      if (!isClosing) worker.emit('error', err)
      isClosing = true
      worker.emit('close')
    }
    else if (!job) {
      worker.emit('error', new Error(`invalid job data from "${queue}" queue: ${data}`))
      poll()
    }
    else if (!(handler = jobHandlers[job.type])) {
      worker.emit('error', new Error(`handler not found; job discarded: ${job.id} (${queue}/${job.type})`))
      poll()
    }
    else {
      // Even if isClosing:true, job data has been removed from redis, so we can't gracefully stop here
      isWorking = true
      worker.emit('start', job)
      handler(onEnd, job.params)
    }
  }

  /**
   * Called when a job has completed, or failed gracefully
   * @param {Error} err
   */
  function onEnd(err) {
    if (handlerDomain) handlerDomain.exit()
    if (err) worker.emit('error', err)
    else worker.emit('end')
    poll()
  }

  process.nextTick(poll)
  worker.close = close
  return worker
}

module.exports = createWorker
