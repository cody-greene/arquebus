'use strict';
const REDIS_URI = process.env.npm_package_config_redis
if (!REDIS_URI) throw new Error(`
  process.env.npm_package_config_redis is undefined
  set the env variable or run:
  npm set lite-queue:redis "redis://localhost:6379"
`)
let wasConnected = false
let redis = require('redis')
  .createClient(REDIS_URI, {
    retry_max_delay: 30000
  })
  .on('error', function (err) {
    let isConnected = redis.connected
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
