[![Build Status](https://travis-ci.org/cody-greene/arquebus.svg?branch=master)](https://travis-ci.org/cody-greene/arquebus) [![npm version](https://badge.fury.io/js/arquebus.svg)](https://badge.fury.io/js/arquebus)

### arquebus
A tiny library for background workers with redis-persisted jobs.
- Robust & consistent error handling
- Aims to stay simple; less code means fewer bugs (less test coverage is needed)
- Scalable number of workers
- Optional scheduler for delayed jobs
- Bring your own redis connection
- Comprehensive `example/` and test suite (omitted from npm package)

Like [resque](https://github.com/taskrabbit/node-resque) but with a few key differences:
- Javascript centric
- Simplified API (internal optimizations make it incompatible with resque)
- Use Redis to its fullest, while reducing round-trips, with Lua scripts

Delayed jobs are for example, rather than spread around multiple lists, requiring additional round-trips to track and clean, stored in a single `Sorted Set` (sorted by time) and moved to a queue `List` atomically, with [`zremlpush.lua`](lib/zremlpush.lua). Each job is also given a cryptographically random id. Partly so you can track jobs via logging, but also to ensure the serialized job data is unique when added to a sorted set of other jobs which may have identical parameters.

Workers also use [`mrpop.lua`](lib/mrpop.lua) to request a job from multiple queues in a single round-trip (and without blocking the connection like brpop).

#### Operational vs programmer errors
Programmer errors in the form of exceptions thrown from a job handler will not be caught and will crash the process, unless you do something silly like `process.on('uncaughtException')`. It would be incorrect for this library to use [domains](https://nodejs.org/api/domain.html), adding complexity while attemping to handle these kinds of errors.

**Taken from [error handling best practices](https://www.joyent.com/developers/node/design/errors):**
> Operational errors represent run-time problems experienced by correctly-written programs. These are not bugs in the program. In fact, these are usually problems with something else: the system itself, the system's configuration, the network, or a remote service:
> - failed to connect to server
> - failed to resolve hostname
> - invalid user input
> - request timeout
> - server returned a 500 response
> - socket hang-up
> - system is out of memory
>
> Programmer errors are bugs in the program. These are things that can always be avoided by changing the code. They can never be handled properly (since by definition the code in question is broken).
> - tried to read property of "undefined"
> - called an asynchronous function without a callback
> - passed a "string" where an object was expected
> - passed an object where an IP address string was expected

#### Usage
```javascript
let arquebus = require('arquebus')
let redis = require('redis').createClient()
```

#### enqueue()
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
// You may want to partially bind this:
// enqueue = enqueue.bind(null, redis)
arquebus.enqueue(redis, {queue:'low', type:'ping'}, console.log)
arquebus.enqueue(redis, {queue:'hi', type:'ping', params: {
  foo: true,
  bar: 'baz'
}}, console.log)
```

#### createWorker()
```javascript
/**
 * Scalable background job runner. One job at a time.
 * @param {RedisClient} opt.redis
 * @param {string[]} opt.queues e.g. ['critical', 'high', 'low']
 * @param {object} opt.jobs Map of jobs types to handlers.
 *        Each handler must be of the form: `f(done, params)`
 * @param {number} opt.interval (5000) Milliseconds between idle polling attempts
 *
 * @return {EventEmitter}
 * @event poll When watching for new jobs
 * @event start(job) When processing a job
 * @event end If-and-only-if a job handler has invoked its callback without error
 * @event error(err)
 * @event close See worker.close(...)
 */
```

#### createMultiWorker()
```javascript
/**
 * Can run multiple jobs in parallel. Will back off when the event-loop becomes too slow.
 * Same options as the standard worker, plus event-loop monitoring options:
 * @param {number?} opt.max (100) Number of jobs allowed to run in parallel.
 *        It's more likely for jobs to be I/O bound than CPU bound
 * @param {number?} opt.high (40) High-water mark. If current lag is < 2x this value
 *        then we don't always call it "busy" e.g. with 50ms lag and a
 *        40ms high-water (1.25x), 25% of the time we will block.
 *        With 80ms lag, we will always block.
 * @param {number?} opt.step (500) Milliseconds between high-water mark updates.
 *        For more sensitive checking set a lower interval.
 * @param {number?} opt.decay (3) Decay factor. Lower numbers create a smooth curve.
 *        Higher numbers lend more weight to recent observations.
 */
```

**Example**
```javascript
let worker = arquebus.createWorker({
  redis: require('redis').createClient(),
  queues: ['hi', 'md', 'lo'],
  jobs: {
    /**
     * @param {function} done(err) Provided first since it must always be used
     * @param {object} params Additional options provided when the job was enqueued
     * @param {object} job Access the job type & id
     */
    ping(done, params, job) {
      console.log('ping params:', params)
      done(new Error('not implemented'))
    }
  }
})
```

#### worker.close()
```javascript
/**
 * Stop polling, wait for the current job to complete, then emit a "close" event
 * Calling .close() for a second time has no effect
 */
```

#### createScheduler()
```javascript
/**
 * Manages delayed jobs.
 * Running more than one scheduler on a db will have undefined results
 * @param {RedisClient} opt.redis
 * @param {number} opt.interval (5000) Milliseconds between idle polling attempts
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

#### scheduler.close()
```javascript
/**
 * Stop polling, then emit a "close" event
 */
```

#### Development
The test suite requires a disposable redis instance since `fakeredis` does not support the `eval` command
```sh
docker run -dp 9031:6379 redis:3.0.6-alpine
export REDIS_URI="redis://192.168.99.100:9031"
npm -s test [-- <mocha options>]
```
