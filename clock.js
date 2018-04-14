const Clock = { fps: 20 };
Clock.frameDuration = 1000 / Clock.fps - 2; // milliseconds (-2 is a fudge term)

Clock.tick = function(now) {
  if (!this.running) return;
  if (now - this.prevFrameStart >= this.frameDuration) {
    this.prevFrameStart = now;
    this.ontick();
  }
  requestAnimationFrame(this.boundTick);
};
Clock.boundTick = Clock.tick.bind(Clock);

Clock.start = function(ontick) {
  this.ontick = ontick;
  this.prevFrameStart = performance.now();
  this.running = true;
  requestAnimationFrame(this.boundTick);
};

Clock.stop = function() {
  this.running = false;
};

module.exports = Clock;
