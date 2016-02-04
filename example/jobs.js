'use strict'
module.exports = {
  easy(done) {
    setTimeout(done, 250)
  },
  hard(done) {
    setTimeout(done, 3000)
  },
  foo(done) {
    done(new Error('example error'))
  },
  /** @param {number} params.duration */
  sleep(done, params) {
    if (!Number.isInteger(params.duration) || params.duration < 1)
      done(new TypeError('params.duration should be a integer > 0'))
    setTimeout(done, params.duration)
  },
  /** @param {number} params.duration */
  busyWait(done, params) {
    let tstart = Date.now()
    if (!Number.isInteger(params.duration) || params.duration < 1)
      done(new TypeError('params.duration should be a integer > 0'))
    while (true) if (Date.now() - tstart > params.duration) break
    done()
  },
  /**
   * Test job; can simulate sync/async & rude/polite errors
   * @param {function} done(err)
   * @param {boolean} params.async The job completes asynchronously
   * @param {string} params.type One of: operational, programmer
   *        The job can fail gracefully from an operational error
   *        Or it can crash from a programmer error
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
