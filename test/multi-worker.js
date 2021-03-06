'use strict' /* eslint-env mocha */
const assert = require('assert')
const createRedisClient = require('redis').createClient
const jobs = require('../example/jobs')
const createMultiWorkerRaw = require('../lib/multi-worker')
const util = require('../lib/util')
const noop = Function.prototype
const REDIS_URI = process.env.REDIS_URI
assert(REDIS_URI, 'env $REDIS_URI is undefined')

/** Wrap the Worker constructor with some default options */
function createWorker(opt) {
  return createMultiWorkerRaw(Object.assign({}, {
    jobs,
    interval: 10,
    queues: ['hi', 'md', 'lo']
  }, opt))
}

describe('createMultiWorker()', function () {
  let redis = null
  let enqueue = null
  let worker = null

  beforeEach(function setup(done) {
    redis = createRedisClient(REDIS_URI)
    enqueue = util.enqueue.bind(null, redis)
    redis.flushdb(done)
  })

  afterEach(function cleanup() {
    redis.end(true)
    worker.close()
  })

  it('should process a well-defined job', function (done) {
    const expectedEvents = ['poll', 'start', 'end', 'close']
    let actualEvents = []
    // If the worker constructor is moved to beforeEach() then we may not catch the 'poll' event
    worker = createWorker({redis})
    expectedEvents.forEach(function (name) {
      worker.once(name, ()=> actualEvents.push(name))
    })
    worker.on('start', function (){ worker.close() })
    worker.on('close', function () {
      // Order is important! "close" should always be the last event
      // This also tests the worker to complete a job before closing
      assert.deepStrictEqual(actualEvents, expectedEvents)
      redis.llen(util.key('lo'), function (err, res) {
        assert.ifError(err)
        assert.strictEqual(res, 0)
        done()
      })
    })
    enqueue({queue: 'lo', type: 'nightmare'}, noop)
  })

  it('should process jobs from different queues', function (done) {
    const expectedQueues = ['hi', 'md', 'lo']
    worker = createWorker({redis})
    worker.on('start', function (job) {
      assert.notStrictEqual(expectedQueues.length, 0)
      assert.strictEqual(job.queue, expectedQueues.shift())
      if (expectedQueues.length === 0) worker.close()
    })
    worker.on('close', done)
    expectedQueues.forEach(queue => enqueue({queue, type: 'nightmare'}, noop))
  })

  it('should process jobs in order (within a queue)', function (done) {
    let expectedJobs = []
    for (let index = 0; index < 4; ++index) {
      let job = {queue: 'lo', type: 'nightmare', params: index}
      expectedJobs.push(job)
      enqueue(job, noop)
    }
    worker = createWorker({redis})
    worker.on('start', function (job) {
      assert.strictEqual(job.params, expectedJobs.shift().params)
      if (!expectedJobs.length) worker.close()
    })
    worker.on('close', done)
  })

  // Operational vs Programmer error:
  // https://www.joyent.com/developers/node/design/errors
  ;[
    {type: 'operational'},
    {type: 'operational', async: true}
  ].forEach(function (opt) {
    const expectedMessage = opt.async ? 'async ' + opt.type : opt.type
    it(`should capture ${expectedMessage} errors`, function (done) {
      enqueue({
        queue: 'hi',
        type: 'nightmare',
        params: opt
      }, function (err) {
        assert.ifError(err)
      })
      worker = createWorker({redis})
      worker.on('error', function (err) {
        if (!err) done(new Error('expected Error object'))
        else worker.close()
      })
      worker.on('close', done)
    })
  })

  it('should process more than one job at once', function (done) {
    const EXPECTED_TOTAL = 3
    let activeJobs = 0
    for (let index = 0; index < EXPECTED_TOTAL; ++index)
      enqueue({queue: 'lo', type: 'sleep', params: {duration: 50}}, noop)
    worker = createWorker({redis})
    worker.on('start', function () {
      activeJobs += 1
    })
    worker.once('end', function () {
      assert.equal(activeJobs, EXPECTED_TOTAL, 'start all jobs before any have ended')
      worker.close()
    })
    worker.on('close', done)
  })

  it('should process no more than X jobs at a time', function (done) {
    // duration/interval here assumes redis RTT < 5ms e.g. localhost
    let activeJobs = 0
    let totalJobs = 0
    const EXPECTED_TOTAL = 5
    const MAX_JOBS = 2
    for (let index = 0; index < EXPECTED_TOTAL; ++index)
      enqueue({queue: 'lo', type: 'sleep', params: {duration: 20}}, noop)
    worker = createWorker({redis, max: MAX_JOBS})
    worker.on('start', function () {
      activeJobs += 1
      assert(activeJobs <= MAX_JOBS, `${activeJobs} > ${MAX_JOBS}`)
      if (++totalJobs === EXPECTED_TOTAL) worker.close()
    })
    worker.on('end', function (){ activeJobs -= 1 })
    worker.on('close', done)
  })

  it('should accept no more than one job at a time while the event-loop is lagging', function (done) {
    const EXPECTED_TOTAL = 5
    let totalJobs = 0
    let isWorking = false
    for (let index = 0; index < EXPECTED_TOTAL; ++index)
      enqueue({queue: 'lo', type: 'busyWait', params: {duration: 30}}, noop)
    // To ensure busy status: job duration should be >= 2*HIGH_WATER
    worker = createWorker({redis, high: 10, step: 10})
    worker.on('start', function () {
      assert(!isWorking, 'one job at a time!')
      isWorking = true
      if (++totalJobs === EXPECTED_TOTAL) worker.close()
    })
    worker.on('end', function (){ isWorking = false })
    worker.on('close', done)
  })
})
