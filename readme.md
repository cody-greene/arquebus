#### lite-queue
A tiny framework for background workers.
- Robust & consistent error handling
- Well documented
- Less code means fewer bugs (statistically)
- Requires `node --harmony` flag
- Scalable
- Redis persisted
- Optional scheduler for delayed jobs
- Comprehensive `example/` and test suite omitted from npm package

```javascript
let lite = require('lite-queue')
```

#### lite.enqueue(redis, opt, done)
```javascript
/**
 * Post a new job for an active worker to execute
 * @param {RedisClient} redis
 * @param {string} opt.queue e.g. critical, high, low
 * @param {string} opt.type Name of the job handler
 * @param {object?} opt.params e.g. userid: '123'
 *        note: falsy params are omitted entirely
 * @param {number?} opt.time Delay the job until: epoch-time in milliseconds
 * @param {function} done(err, id) Receives a unique job id if successful
 */
```

**Example**
```javascript
let redis = require('redis').createClient()
// You may want to partially bind this:
// enqueue = enqueue.bind(null, redis)
enqueue(redis, {queue:'low', type:'ping'}, console.log)
enqueue(redis, {queue:'hi', type:'ping', params: {
  foo: true,
  bar: 'baz'
}, console.log)
```

#### lite.createWorker(opt)
```javascript
/**
 * Scalable background job runner
 * @param {RedisClient} opt.redis
 * @param {string[]} opt.queues default: ['critical', 'high', 'low']
 * @param {object} opt.jobs Map of jobs types to handlers
 * @param {number} opt.interval (5000) Milliseconds between polling attempts
 * @param {boolean} opt.hardcore (false) By default, any error (even async)
 *        thrown from a job handler will be captured in the form of an `error` event.
 *        Otherwise these ProgrammerErrors become UncaughtExceptions and crash the app
 * @return {EventEmitter}
 *
 * @event poll When watching for new jobs
 * @event start(job) When processing a job
 * @event end If-and-only-if a job handler has invoked its callback without error
 * @event error(err)
 * @event close See worker.close()
 */
```

**Example**
```javascript
let worker = createWorker({
  redis: require('redis').createClient(),
  queues: ['hi', 'md', 'lo'],
  jobs: {
    /**
     * @param {function} done(err) Provided first since it must always be used
     * @param {object} params Additional options provided when the job was enqueued
     */
    ping(done, params) {
      console.log('ping params:', params)
      done(new Error('not implemented'))
    }
  }
})
```

#### worker.close(done)
```javascript
/**
 * Stop polling, wait for the current job to complete, then emit a "close" event
 * Calling .close() for a second time has no effect
 * This will also end the redis connection
 * @param {function?} done Same as .on('close', done)
 */
```

#### lite.createScheduler(opt)
```javascript
/**
 * Manages delayed jobs.
 * Running more than one scheduler on a db will have undefined results
 * @param {RedisClient} opt.redis
 * @param {number} opt.interval (5000) Milliseconds between polling attempts
 * @return {EventEmitter}
 *
 * @event poll
 * @event start(job) Moving a job to a working queue
 * @event end If-and-only-if a job was moved without error
 * @event error(err)
 * @event close
 */
```

**Example**
```javascript
let scheduler = createScheduler({
  redis: require('redis').createClient(),
  interval: 5000
})
```

#### scheduler.close(done)
```javascript
/**
 * Stop polling, then emit a "close" event
 * This will also end the redis connection
 * @param {function?} done Same as .on('close', done)
 */
```
