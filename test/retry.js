'use strict'; /* eslint-env mocha */
let assert = require('assert')
let util = require('../lib/util')

describe('util.retry()', function () {
  it('should perform the task more than once if there is no result', function (done) {
    let count = 0
    let expectedCount = 3
    util.retry(10, function (next) {
      if (++count < expectedCount) next(new Error('not yet'))
      else next()
    }, function (err) {
      assert.ifError(err)
      assert.strictEqual(count, expectedCount)
      done()
    })
  })

  it('should invoke the callback with a result', function (done) {
    util.retry(10, function (next) {
      next(null, 'Can you hear me now?')
    }, function (err, res) {
      assert.ifError(err)
      assert.strictEqual(res, 'Can you hear me now?')
      done()
    })
  })

  it('should invoke the callback with an error when aborting', function (done) {
    let count = 0
    let maxCount = 1
    let abort = util.retry(10, function (next) {
      // Task will eventually success unless aborted
      if (count++ < maxCount) next(new Error('not yet'))
      else next(null, 'never')
    }, function (err) {
      assert.ok(err)
      done()
    })
    abort()
  })

  it('should wait for task completion when aborting', function (done) {
    let abort = util.retry(10, function (next) {
      process.nextTick(next)
    }, function (err) {
      // Task should complete with no error, since it's in progress when we abort
      assert.ifError(err)
      done()
    })
    abort()
  })
})
