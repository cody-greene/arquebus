'use strict';
const REDIS_URI = process.env.REDIS_URI
if (!REDIS_URI) throw new Error('env $REDIS_URI is undefined')
let wasConnected = false
const redis = require('redis')
  .createClient(REDIS_URI, {
    retry_max_delay: 30000
  })
  .on('error', function (err) {
    const isConnected = redis.connected
    // Omit repeated reconnection attempts
    if (isConnected || (!isConnected && wasConnected))
      console.log(new Error(err.message).stack)
    wasConnected = isConnected
  })
  .on('ready', function () {
    wasConnected = true
    console.log('redis connected')
  })

module.exports = redis
