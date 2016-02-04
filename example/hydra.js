'use strict'
/* eslint no-console: 0 */
const redis = require('./redis-client')
const createMultiWorker = require('../lib/multi-worker')

/**
 * Complete example of a MultiWorker
 * node example/hydra.js
 */
const worker = createMultiWorker({
  redis: redis,
  queues: ['hi', 'md', 'lo'],
  jobs: require('./jobs')
})
  .on('poll', function () {
    console.log('hydra waiting...')
  })
  .on('start', function (job) {
    console.log('hydra start:', job.id)
  })
  .on('end', function (job) {
    console.log('hydra end:', job.id)
  })
  .on('close', function () {
    console.log('hydra shutdown')
    if (redis.connected) redis.quit()
    else redis.end(true)
  })
  .on('error', function (err, job) {
    if (job) console.log('failed', job, err.stack)
    else console.log('hydra: ' + err.stack)
  })

// Gracefully exit with ^c (SIGINT)
// Forcefully exit with ^\ (SIGQUIT)
process.on('SIGINT', worker.close).on('SIGTERM', worker.close)

module.exports = worker
