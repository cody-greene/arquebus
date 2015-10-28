'use strict'; /* eslint-env mocha */
let assert = require('assert')
let createRedisClient = require('fakeredis').createClient
let createSchedulerRaw = require('../lib/scheduler')
let util = require('../lib/util')
let noop = function(){}

describe('createScheduler()', function () {
  let redis = null
  let enqueue = null
  let foreman = null
  let foremanClient = null
  let idCounter = 0

  beforeEach(function setup() {
    // Need a unique id to share db between two clients
    let id = 'scheduler-' + (++idCounter)
    redis = createRedisClient(id)
    foremanClient = createRedisClient(id)
    enqueue = util.enqueue.bind(null, redis)
    foreman = createSchedulerRaw({
      redis: foremanClient,
      interval: 10 // Make the tests faster by using this absurdly short time
    })
  })

  afterEach(function cleanup() {
    redis.end(true)
    foremanClient.end(true)
  })

  it("should move a delayed job when it's ready", function (done) {
    let expectedEvents = ['poll', 'start', 'end', 'close']
    let actualEvents = []
    let job = {id: 1, queue:'lo', type:'easy', time: Date.now()}
    let expectedData = util.serializeJob(job, job.id)
    expectedEvents.forEach(function (name) {
      foreman.once(name, ()=> actualEvents.push(name))
    })
    foreman.on('start', ()=> foreman.close(function () {
      assert.deepStrictEqual(actualEvents, expectedEvents, 'emit events')
      redis.lrange(util.key(job.queue), 0, -1, function (err, list) {
        assert.ifError(err)
        assert.strictEqual(list.length, 1)
        assert.strictEqual(list[0], expectedData)
        done()
      })
    }))
    enqueue(job, noop)
  })

  it('should resume polling after connection interrupt')
  it('should avoid double polling after connection inerrupt')
})
