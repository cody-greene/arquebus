'use strict' /* eslint-env mocha */
const assert = require('assert')
const createRedisClient = require('redis').createClient
const loadLua = require('../lib/load-lua')
const mrpop = loadLua('mrpop')
const zremlpush = loadLua('zremlpush')
const REDIS_URI = process.env.REDIS_URI
assert(REDIS_URI, 'env $REDIS_URI is undefined')

describe('loadLua()', function () {
  let redis = null

  beforeEach(function setup(done) {
    redis = createRedisClient(REDIS_URI)
    redis.script('flush')
    redis.flushdb(done)
  })

  afterEach(function cleanup() {
    redis.end(true)
  })

  describe('zremlpush.lua', function () {
    it('should move data from a sorted set to a list', function (done) {
      redis.zadd('delayed', Date.now(), 'dingus')
      zremlpush(redis, 2, 'delayed', 'active', 'dingus', function (err) {
        assert.ifError(err)
        redis.lrange('active', 0, -1, function (err, res) {
          assert.ifError(err)
          assert.deepStrictEqual(res, ['dingus'])
          done()
        })
      })
    })
  })

  describe('mrpop.lua', function () {
    it('should pop elements from prioritized lists', function (done) {
      let batch = redis.batch()
        .lpush('queue:lo', 'data2')
        .lpush('queue:hi', 'data1')
      mrpop(batch, 2, 'queue:hi', 'queue:lo', function (err, res) {
        assert.ifError(err)
        assert.deepStrictEqual(res, ['queue:hi', 'data1'])
      })
      mrpop(batch, 2, 'queue:hi', 'queue:lo', function (err, res) {
        assert.ifError(err)
        assert.deepStrictEqual(res, ['queue:lo', 'data2'])
      })
      batch.exec(done)
    })
  })
})
