'use strict';

/**
 * Complete example of a lite-queue worker
 * node --harmony example/peon.js
 */
let peon = require('../lib/worker')
  ({
    redis: require('./redis-client'),
    hardcore: false,
    interval: 5000,
    queues: ['hi', 'md', 'lo'],
    jobs: {
      easy(done) {
        setTimeout(done, 250)
      },
      hard(done) {
        setTimeout(done, 3000)
      },
      foo(done) {
        done(new Error('not implemented'))
      },
      baz() {
        // Will crash the app if hardcore:true
        setTimeout(function(){ throw new Error('bad news') }, 50)
      },
      /**
       * Test job; can simulate sync/async & rude/polite errors
       * @param {function} done(err)
       * @param {object} params
       */
      nightmare(done, params) {
        if (!params) params = {}
        if (params.async) process.nextTick(function () {
          if (params.type === 'operational') done(new Error('async operational error'))
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
  .on('poll', function () {
    console.log('peon waiting...')
  })
  .on('start', function (job) {
    console.time('peon complete')
    console.log('peon start:', job)
  })
  .on('end', function () {
    console.timeEnd('peon complete')
  })
  .on('close', function () {
    console.log('peon shutdown')
  })
  .on('error', function (err) {
    console.log('peon: ' + err.stack)
  })

// Gracefully exit with ^c (SIGINT)
// Forcefully exit with ^\ (SIGQUIT)
process.on('SIGINT', peon.close).on('SIGTERM', peon.close)

module.exports = peon
