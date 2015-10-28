'use strict';

/**
 * Complete example of a lite-queue scheduler
 * node --harmony example/foreman.js
 */
let foreman = require('../lib/scheduler')
  ({
    redis: require('./redis-client')
  })
  .on('poll', function () {
    console.log('foreman waiting...')
  })
  .on('start', function (job) {
    console.log('foreman moving to active queue:', job)
  })
  .on('end', function () {
    console.log('foreman finished')
  })
  .on('close', function () {
    console.log('foreman shutdown')
  })
  .on('error', function (err) {
    console.log('foreman: ' + err.stack)
  })

// Gracefully exit with ^c (INT)
// Forcefully exit with ^\ (QUIT)
process.on('SIGINT', foreman.close).on('SIGTERM', foreman.close)

module.exports = foreman
