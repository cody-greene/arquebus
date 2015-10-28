'use strict';

/**
 * node --harmony example/enqueue.js
 */
let redisClient = require('./redis-client')
let enqueue = require('../lib').enqueue.bind(null, redisClient)

// Add a single, low priority, long running job
enqueue({
  queue: 'lo',
  type: 'hard',
  params: {
    mySecret: new Date().toISOString()
  }
}, function (err, id) {
  if (err) console.log(err.stack)
  else console.log('added low priority job:', id)
})

// Add a job which fails gracefully
enqueue({
  queue: 'lo',
  type: 'foo'
}, function (err, id) {
  if (err) console.log(err.stack)
  else console.log('added low priority job:', id)
})

// Add a job without a matching handler
enqueue({
  queue: 'lo',
  type: 'bar'
}, function (err, id) {
  if (err) console.log(err.stack)
  else console.log('added low priority job:', id)
})

// Add a job which fails catastrophically
enqueue({
  queue: 'lo',
  type: 'baz'
}, function (err, id) {
  if (err) console.log(err.stack)
  else console.log('added low priority job:', id)
})

/**
 * Execute serveral async blocks in parallel, capturing any error
 * @param {function[]} tasks(err)
 * @param {function} done(err)
 */
function parallel(tasks, done) {
  let count = 0
  let isDone = false
  function next(err) {
    if (isDone) {}
    else if (err) {
      isDone = true
      done(err)
    } else if (tasks.length === ++count) {
      isDone = true
      done()
    }
  }
  for (let index = 0; index < tasks.length; ++index)
    tasks[index](next)
}

// Add a bunch of fast, high priority, delayed jobs
const NUM_DELAYED = 10
let delayed = []
for (let index = 0; index < NUM_DELAYED; ++index)
  delayed.push(enqueue.bind(null, {
    queue: 'hi',
    type: 'easy',
    time: Date.now() + 5000*index
  }))
parallel(delayed, function (err) {
  if (err) console.log(err.stack)
  else console.log(`added ${NUM_DELAYED} high priority delayed jobs`)
})

redisClient.quit()
