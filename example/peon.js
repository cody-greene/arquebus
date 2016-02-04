'use strict'
/* eslint no-console: 0 */
const redis = require('./redis-client')
const createWorker = require('../lib/worker')

/**
 * Complete example of a Worker
 * node example/peon.js
 */
const worker = createWorker({
  redis: redis,
  queues: ['hi', 'md', 'lo'],
  jobs: require('./jobs')
})
  .on('poll', function () {
    console.log('peon waiting...')
  })
  .on('start', function (job) {
    console.log('peon start:', job.id)
  })
  .on('end', function (job) {
    console.log('peon end:', job.id)
  })
  .on('close', function () {
    console.log('peon shutdown')
    if (redis.connected) redis.quit()
    else redis.end(true)
  })
  .on('error', function (err, job) {
    if (job) console.log('failed', job, err.stack)
    else console.log('peon: ' + err.stack)
  })

// Gracefully exit with ^c (SIGINT)
// Forcefully exit with ^\ (SIGQUIT)
process.on('SIGINT', worker.close).on('SIGTERM', worker.close)

module.exports = worker
