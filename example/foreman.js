'use strict';
const redis = require('./redis-client')

/**
 * Complete example of a Scheduler
 * node --harmony example/foreman.js
 */
const foreman = require('../lib/scheduler')
  ({
    redis: redis
  })
  .on('poll', function () {
    console.log('foreman waiting...')
  })
  .on('start', function () {
    console.log('foreman moving job')
  })
  .on('end', function () {
    console.log('foreman moved job')
  })
  .on('close', function () {
    console.log('foreman shutdown')
    if (redis.connected) redis.quit()
    else redis.end(true)
  })
  .on('error', function (err) {
    console.log('foreman: ' + err.stack)
  })

// Gracefully exit with ^c (INT)
// Forcefully exit with ^\ (QUIT)
process.on('SIGINT', foreman.close).on('SIGTERM', foreman.close)

module.exports = foreman
