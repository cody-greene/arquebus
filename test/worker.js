'use strict'; /* eslint-env mocha */
let assert = require('assert')
let createRedisClient = require('fakeredis').createClient
let createWorkerRaw = require('../lib/worker')
let util = require('../lib/util')
let noop = function(){}

describe('createWorker()', function () {
  let redis = null
  let enqueue = null
  let worker = null
  let workerClient = null
  let idCounter = 0

  beforeEach(function setup() {
    // Need a unique id (cross-file) to share db between two clients
    let id = 'worker-' + (++idCounter)
    redis = createRedisClient(id)
    workerClient = createRedisClient(id)
    enqueue = util.enqueue.bind(null, redis)
    worker = createWorkerRaw({
      redis: workerClient,
      interval: 10, // Make the tests faster by using this absurdly short time
      hardcore: false,
      queues: ['hi', 'md', 'lo'],
      jobs: {
        /**
         * Test job; can simulate sync/async &  rude/polite errors
         * @param {function} done(err)
         * @param {object} params
         */
        easy(done, params) {
          if (!params) params = {}
          if (params.async) process.nextTick(function () {
            if (params.type === 'operational') done('async operational error')
            else if (params.type === 'programmer') throw new Error('async programmer error')
            else done()
          })
          else if (params.type === 'operational')
            done(new Error('operational error'))
          else if (params.type === 'programmer')
            throw new Error('programmer error')
          else done()
        }
      }
    })
  })

  afterEach(function cleanup() {
    redis.end(true)
    workerClient.end(true)
  })

  it('should process a well-defined job', function (done) {
    let expectedEvents = ['poll', 'start', 'end', 'close']
    let actualEvents  = []
    expectedEvents.forEach(function (name) {
      worker.once(name, ()=> actualEvents.push(name))
    })
    worker.on('start', () => worker.close(function () {
      // Order is important! "close" should always be the last event
      // This also tests the worker to complete a job before closing
      assert.deepStrictEqual(actualEvents, expectedEvents)
      redis.llen(util.key('lo'), function (err, res) {
        assert.ifError(err)
        assert.strictEqual(res, 0)
        done()
      })
    }))
    enqueue({queue:'lo', type:'easy'}, noop)
  })

  it('should process jobs from different queues', function (done) {
    let expectedQueues = ['hi', 'md', 'lo']
    worker.on('start', function (job) {
      assert.notStrictEqual(expectedQueues.length, 0)
      assert.strictEqual(job.queue, expectedQueues.shift())
      if (expectedQueues.length === 0) worker.close(done)
    })
    expectedQueues.forEach(queue => enqueue({queue, type:'easy'}, noop))
  })

  it('should process jobs in order (within a queue)', function (done) {
    let expectedJobs = []
    for (let index = 0; index < 4; ++index) {
      let job = {queue:'lo', type:'easy', params:index}
      expectedJobs.push(job)
      enqueue(job, noop)
    }
    worker.on('start', function (job) {
      assert.strictEqual(job.params, expectedJobs.shift().params)
      if (!expectedJobs.length) worker.close(done)
    })
  })

  // Operational vs Programmer error:
  // https://www.joyent.com/developers/node/design/errors
  // Capturing programmer errors requires hardcore:false
  ;[
    {type:'programmer'},
    {type:'programmer', async:true},
    {type:'operational'},
    {type:'operational', async:true}
  ].forEach(function (opt) {
    let expectedMessage = (opt.async ? 'async ' : '') + opt.type
    it(`should capture ${expectedMessage} errors`, function (done) {
      enqueue({
        queue: 'hi',
        type: 'easy',
        params: opt
      }, function (err) {
        assert.ifError(err)
      })
      worker.on('error', function (err) {
        if (!err) done(new Error('expected Error object'))
        else done()
      })
    })
  })

  it('should resume polling after connection interrupt')
  it('should avoid double polling after connection interrupt')
})
