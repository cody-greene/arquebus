'use strict';
const assert = require('assert')
const util = require('./util')

/**
 * Measures event-loop lag
 * @todo process.hrtime() vs Date.now()
 * @param {number} opt.high High-water mark. If current lag is < 2x this value
 *        then we don't always call it "busy" e.g. with 50ms lag and a
 *        40ms high-water (1.25x), 25% of the time we will block.
 *        With 80ms lag, we will always block.
 * @param {number} opt.step Milliseconds between updates.
 *        For more sensitive checking set a lower interval.
 * @param {number} opt.decay Decay factor. Lower numbers create a smooth curve.
 *        Higher numbers lend more weight to recent observations.
 * @return {object} .start() .stop() .isBusy()
 */
module.exports = function createLatencyHelper(opt) {
  const STEP_INTERVAL = opt.step
  const HIGH_WATER = opt.high
  const DECAY_FACTOR = 1 / opt.decay
  let last = Date.now()
  let ema = 0 // Exponential Moving Average
  let timer
  assert(util.isPosInt(opt.decay), '0 < opt.decay')
  assert(util.isPosInt(STEP_INTERVAL), `0 < opt.step`)
  assert(util.isPosInt(HIGH_WATER), `0 < opt.high`)
  function step() {
    const now = Date.now()
    const diff = Math.max(0, now - last - STEP_INTERVAL)
    last = now
    ema = DECAY_FACTOR*diff + (1-DECAY_FACTOR)*ema
  }
  return {
    start(){ if (!timer) timer = setInterval(step, STEP_INTERVAL) },
    stop(){ timer = clearInterval(timer) },
    isBusy: () => Math.random() < (ema - HIGH_WATER) / HIGH_WATER
  }
}
