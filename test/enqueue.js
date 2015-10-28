'use strict'; /* eslint-env mocha */
let assert = require('assert')
let createRedisClient = require('fakeredis').createClient
let util = require('../lib/util')

describe('util.enqueue()', function () {
  let redis = null
  let enqueue = null

  beforeEach(function setup() {
    redis = createRedisClient()
    enqueue = util.enqueue.bind(null, redis)
  })

  afterEach(function cleanup() {
    redis.end(true)
  })

  it('should return a job id', function (done) {
    enqueue({queue:'lo', type:'foo'}, function (err, id) {
      assert.ifError(err)
      assert.ok(id, 'got a job id')
      done()
    })
  })

  it('should add a new job', function (done) {
    let opt = {queue:'lo', type:'easy'}
    enqueue(opt, function (err, id) {
      let expectedData = util.serializeJob(opt, id)
      assert.ifError(err)
      redis.lrange(util.key('lo'), 0, -1, function (err, list) {
        assert.ifError(err)
        assert.strictEqual(list.length, 1)
        assert.strictEqual(list[0], expectedData)
        done()
      })
    })
  })

  it('should add a new delayed job', function (done) {
    let opt = {queue:'lo', type:'easy', time: Date.now()}
    enqueue(opt, function (err, id) {
      let expectedData = util.serializeJob(opt, id)
      assert.ifError(err)
      redis.zrange(util.DELAYED_JOBS_KEY, 0, -1, function (err, list) {
        assert.ifError(err)
        assert.strictEqual(list.length, 1)
        assert.strictEqual(list[0], expectedData)
        done()
      })
    })
  })
})
