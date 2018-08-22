const fps = require('./clock.js').fps;
const defineMethods = require('./define-methods.js');

// something close to 0 gain, but not exactly 0, for the purpose of
// passing to exponentialRampToValueAtTime()
// for signed 16-bit audio this works out to half a quantum
const ExpSilence = 1.0 / 65536;

var ctx;
var now; // like ctx.currentTime, but in ticks instead of seconds

function ensureContext() {
  if (!ctx) {
    if ('undefined' == typeof AudioContext) {
      if ('undefined' == typeof webkitAudioContext) {
	console.log('neither AudioContext nor webkitAudioContext is available; no sound will play');
      } else {
	ctx = new webkitAudioContext();
      }
    } else {
      ctx = new AudioContext();
    }
    // keep track of game time
    now = 0;
    router.on('clockTick', function() { now++; });
    // clean up when the game finishes
    router.on('finish', function() { ctx.close(); ctx = null; });
  }
}

// return the difference between the frequency of the note that is interval
// semitones above referenceFreq, and referenceFreq
function intervalToFreqDiff(interval, referenceFreq) {
  return Math.pow(2, interval / 12) * referenceFreq - referenceFreq;
}

// given a MIDI pitch number (including fractional), return frequency in Hz
function pitchToFrequency(pitch) {
  // 69 = A4 = A above middle C = 440Hz
  return Math.pow(2, (pitch - 69) / 12) * 440;
}

// given a volume level in -dBFS, return a linear gain value
function levelToGain(level) {
  return Math.pow(2, -level / 10);
}

// if a gain is scheduled to exponentially ramp between times t0 and t1, with
// level l0 at t0 and level l1 at t1, return the gain value at time t 
function expInterp(t0, t, t1, l0, l1) {
  var v0 = levelToGain(l0);
  var v1 = levelToGain(l1);
  // from doc for exponentialRampToValueAtTime:
  return Math.pow(v1 / v0, (t - t0) / (t1 - t0)) * v0;
}

/** represents a sound currently being played
 * audibleThing - the thing playing the sound (may be Located, will become Audible)
 * soundableThing - the description of the sound to be played (is Soundable)
 * playedDuration - (optional) the duration for which this sound has already been played (in ticks)
 * releasedDuration - (optional) the duration for which this sound has already been released (in ticks)
 */
function PlayingSound(audibleThing, soundableThing, playedDuration, releasedDuration) {
  ensureContext();
  this.audibleThing = audibleThing;
  this.soundableThing = soundableThing;
  this.isSilent = false;
  router.on('IsSilenced', this.thingIsSilenced.bind(this));
  if ('number' == typeof playedDuration) {
    this.triggerTime = now - playedDuration;
    if ('number' == typeof releasedDuration) {
      this.releaseTime = now - releasedDuration;
    }
    this.startSounding();
  } else {
    this.trigger();
  }
}

defineMethods(PlayingSound, [

//
// serialization
//

function toJSON() {
  return {
    op: 'PlayingSound', args: [
      this.audibleThing, this.soundableThing,
      now - this.triggerTime,
      (('number' == typeof this.releaseTime) ? (now - this.releaseTime) : null)
    ]
  };
},

//
// public(ish) interface
//

function trigger() {
  if ('number' != typeof this.triggerTime) {
    this.triggerTime = now;
  }
  this.startSounding();
},

function release() {
  if (('releaseTime' in this) && now > this.releaseTime) // already released
    return;
  this.releaseTime = now;
  this.releaseAllEnvelopes();
},

function silence() {
  this.stopSounding();
  this.isSilent = true;
  // remove this from audibleThing, and if this was the last PlayingSound in
  // the list, make it become not Audible
  var audible = router.getProperties('Audible', this.audibleThing);
  var sounds = audible.playingSounds.filter(x => (!x.isSilent));
  if (sounds.length == 0) {
    router.unbecome(this.audibleThing, 'Audible');
  } else {
    router.become(this.audibleThing, 'Audible', { playingSounds: sounds });
  }
},

//
// implementation details
//

// is this.audibleThing audible to the local player?
function isLocallyAudible() {
  var located = router.getProperties('Located', this.audibleThing);
  if (!located) return true; // omnipresent sound
  var localPlayerThing = router.uplink.players[router.uplink.id].thing;
  var interfaced = router.getProperties('Interfaced', localPlayerThing);
  if (!interfaced) return false; // should never happen
  return interfaced.interface.thingIsInPlayersSpace(this.audibleThing);
},

// if we are to play the sound locally, immediately start
function startSounding() {
  if (!isLocallyAudible()) return;
  var graph = this.makeGraph();
  this.sources = graph.srcs;
  this.envelopes = graph.envs;
  this.destination = graph.destination;
  this.destination.connect(ctx.destination);
  this.sources.forEach(s => s.start());
},

// if we're playing the sound locally, put all envelopes in their release phases
function releaseAllEnvelopes() {
  if (!('envelopes' in this)) return;
  this.envelopes.forEach(([enveloped, gainNode]) => {
    this.releaseGainNodeForEnvelope(gainNode, enveloped);
  });
},

// if we're playing the sound locally, immediately stop
function stopSounding() {
  if ('sources' in this) {
    this.sources.forEach(s => s.stop()); // FIXME is this necessary?
    this.destination.disconnect();
    delete this.sources;
    delete this.envelopes;
    delete this.destination;
  }
},

function remove() {
  // TODO remove this from audibleThing's Audible adjective's playingSounds property, and become not Audible if this is the last thing
},

//
// AudioNode graph construction
//

// make the whole AudioNode graph for a soundable thing (recursing on
// modulators)
function makeGraph(thing) {
  if ('undefined' == typeof thing) {
    thing = this.soundableThing;
  }
  var tonal = router.getProperties('Tonal', thing);
  var noisy = router.getProperties('Noisy', thing);
  if (tonal && noisy) {
    throw new Error('Tonal and Noisy are mutually exclusive, pick one');
  }
  var srcs = []; // sources to be .start()ed
  var envs = []; // [Enveloped, GainNode] pairs
  var dst; // destination to be .connect()ed
  if (tonal) {
    srcs.push(this.makeToneSourceNode(tonal));
    var freqModded = router.getProperties('FrequencyModulated', thing);
    if (freqModded) {
      var { srcs: modSrcs, envs: modEnvs, dst: modDst } =
        this.makeGraph(freqModded.modulator);
      srcs = srcs.concat(modSrcs);
      envs = envs.concat(modEnvs);
      this.modulateFrequency(modDst, srcs[0]);
    }
    var pitchModulated = router.getProperties('PitchModulated', thing);
    if (pitchModded) {
      var { srcs: modSrcs, envs: modEnvs, dst: modDst } =
        this.makeGraph(pitchModded.modulator);
      srcs = srcs.concat(modSrcs);
      envs = envs.concat(modEnvs);
      this.modulatePitch(modDst, srcs[0]);
    }
  } else if (noisy) {
    srcs.push(this.makeNoiseSourceNode(noisy));
  } else {
    throw new Error('expected Soundable thing to be either Tonal or Noisy, but it is neither');
  }
  dst = srcs[0];
  var filtered = router.getProperties('Filtered', thing);
  if (filtered) {
    var filter = this.makeFilterNode(filtered);
    dst.connect(filter);
    dst = filter;
    var fFreqModded = router.getProperties('FilterFrequencyModulated', thing);
    if (fFreqModded) {
      var { srcs: modSrcs, envs: modEnvs, dst: modDst } =
        this.makeGraph(fFreqModded.modulator);
      srcs = srcs.concat(modSrcs);
      envs = envs.concat(modEnvs);
      this.modulateFrequency(modDst, filter);
    }
    var fPitchModded = router.getProperties('FilterPitchModulated', thing);
    if (fPitchModded) {
      var { srcs: modSrcs, envs: modEnvs, dst: modDst } =
        this.makeGraph(fPitchModded.modulator);
      srcs = srcs.concat(modSrcs);
      envs = envs.concat(modEnvs);
      this.modulatePitch(modDst, filter);
    }
  }
  var ampModded = router.getProperties('AmplitudeModulated', thing);
  if (ampModded) {
    var { srcs: modSrcs, envs: modEnvs, dst: modDst } =
      this.makeGraph(ampModded.modulator);
    srcs = srcs.concat(modSrcs);
    envs = envs.concat(modEnvs);
    dst = this.modulateAmplitude(modDst, dst);
  }
  var enveloped = router.getProperties('Enveloped', thing);
  if (enveloped) {
    var envelope = this.makeGainNodeForEnvelope(enveloped);
    dst.connect(envelope);
    dst = envelope;
  }
  return { srcs: srcs, envs: envs, dst: dst };
},

function makeToneSourceNode({ pitch, type, spectrum }) { // Tonal in sound.yp
  var osc = ctx.createOscillator();
  osc.frequency.value = pitchToFrequency(pitch);
  osc.type = type;
  if (type == "custom") {
    var real = new Array(spectrum.length + 1).fill(0);
    var imag = [0].concat(spectrum);
    osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
  }
},

function makeNoiseSourceNode({ period }) { // Noisy in sound.yp
  // TODO make an AudioBuffer with random audio samples to fill period, and a corresponding AudioBufferSourceNode that loops over it infinitely
},

function makeFilterNode({ type, pitch, q, level }) { // Filtered in sound.yp
  var filt = ctx.createBiquadFilter();
  filt.type = type;
  var freq = pitchToFrequency(pitch);
  filt.frequency.value = freq
  // FIXME? sometimes Q is in dB instead of related to pitch/freq?
  filt.Q.value = intervalToFreqDiff(q, freq);
  filt.gain.value = level;
  return filt;
},

function makeGainNodeForEnvelope({ // Enveloped in sound.yp
  attackDuration, peakLevel,
  decayDuration,
  sustainLevel,
  releaseDuration, durationUntilRelease
}) {
  var gain = ctx.createGain();
  var ct = ctx.currentTime;
  var peakTime = this.triggerTime + attackDuration;
  var sustainTime = peakTime + decayDuration;
  // set the initial gain value according to the current envelope phase
  if (now == this.triggerTime) { // very start (common case shortcut)
    gain.gain.value = ExpSilence;
  } else if (now < peakTime) { // attack phase
    gain.gain.value =
        expInterp(this.triggerTime, now, peakTime, ExpSilence, peakLevel);
  } else if (now < sustainTime) { // decay phase
    gain.gain.value =
        expInterp(peakTime, now, sustainTime, peakLevel, sustainLevel);
  } else if ((!('releaseTime' in this)) || now < this.releaseTime) { // sustain
    gain.gain.value = levelToGain(sustainLevel);
  } else { // release
    var endTime = this.releaseTime + releaseDuration;
    gain.gain.value =
        expInterp(this.releaseTime, now, endTime, sustainLevel, ExpSilence);
  }
  if (durationUntilRelease != Number.MAX_VALUE && !('releaseTime' in this)) {
    this.releaseTime = this.triggerTime + durationUntilRelease;
  }
  // set scheduled gain value changes according to which phases are left to do
  if (now < peakTime) { // attack phase
    gain.gain.exponentialRampToValueAtTime(
	levelToGain(peakLevel), ct + attackDuration / fps);
  }
  if (now < sustainTime) { // decay phase
    gain.gain.exponentialRampToValueAtTime(
	levelToGain(sustainLevel), ct + (attackDuration + decayDuration) / fps);
  }
  if ('releaseTime' in this) { // we know when the release phase starts
    if (now < this.releaseTime) { // sustain phase
      gain.gain.setValueAtTime(
          levelToGain(sustainLevel), ct + this.releaseTime / fps);
    }
    var endTime = this.releaseTime + releaseDuration;
    if (now < this.endTime) { // release phase (should always be true)
      gain.gain.exponentialRampToValueAtTime(
          ExpSilence, ct + endTime / fps);
    }
  }
  // FIXME:
  // - this should happen regardless of whether we're actually playing the sound locally
  // - we can have multiple envelopes (for modulators); removal should only happen for the main one
  router.on('clockTick', this.removeIfFullyReleased.bind(this));
  return gain;
},

function releaseGainNodeForEnvelope(gain, { releaseDuration }) {
  gain.gain.exponentialRampToValueAtTime(ExpSilence, ctx.currentTime + releaseDuration / fps);
},

function modulateAmplitude(modulator, carrier) {
  var gain = ctx.createGain();
  modulator.connect(gain.gain);
  carrier.connect(gain);
  return gain;
},

function modulateFrequency(modulator, carrier) {
  modulator.connect(carrier.frequency);
},

function modulatePitch(modulator, carrier) {
  modulator.connect(carrier.detune); // TODO? insert a GainNode to convert semitones to cents
},

//
// event handlers
//

function thingIsSilenced(thing) {
  if (thing == this.audibleThing) {
    this.silence();
  }
},

// on clockTick for Enveloped sounds
function removeIfFullyReleased() {
  if (('number' == typeof this.releaseTime) &&
      now >= this.releaseTime + this.releaseDuration) {
    this.remove();
  }
}

]);

module.exports = PlayingSound;
