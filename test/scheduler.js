'use strict' /* eslint-env mocha */
const assert = require('assert')
const createRedisClient = require('redis').createClient
const createScheduler= require('../lib/scheduler')
const util = require('../lib/util')
const noop = Function.prototype
const REDIS_URI = process.env.REDIS_URI
assert(REDIS_URI, 'env $REDIS_URI is undefined')

describe('createScheduler()', function () {
  let redis = null
  let enqueue = null
  let foreman = null

  beforeEach(function setup(done) {
    redis = createRedisClient(REDIS_URI)
    enqueue = util.enqueue.bind(null, redis)
    redis.flushdb(done)
  })

  afterEach(function cleanup() {
    redis.end(true)
    foreman.close()
  })

  it("should move a delayed job when it's ready", function (done) {
    let expectedEvents = ['poll', 'start', 'end', 'close']
    let actualEvents = []
    let job = {id: 1, queue: 'lo', type: 'easy', time: Date.now()}
    let expectedData = util.serializeJob(job, job.id)
    foreman = createScheduler({
      redis: redis,
      interval: 10 // Make the tests faster by using this absurdly short time
    })
    expectedEvents.forEach(function (name) {
      foreman.once(name, ()=> actualEvents.push(name))
    })
    foreman.on('start', function (){ foreman.close() })
    foreman.on('close', function () {
      assert.deepStrictEqual(actualEvents, expectedEvents, 'events emitted: ' + actualEvents)
      redis.lrange(util.key(job.queue), 0, -1, function (err, list) {
        assert.ifError(err)
        assert.strictEqual(list.length, 1)
        assert.strictEqual(list[0], expectedData)
        done()
      })
    })
    enqueue(job, noop)
  })
})
