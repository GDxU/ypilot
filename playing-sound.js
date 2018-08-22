const fps = require('./clock.js').fps;
const defineMethods = require('./define-methods.js');

// something close to 0 gain, but not exactly 0, for the purpose of
// passing to exponentialRampToValueAtTime()
// for signed 16-bit audio this works out to half a quantum
const ExpSilence = 1.0 / 65536;

// default values for Enveloped properties, resulting in the same behavior as
// if without an envelope at all
const DefaultEnveloped = {
  attackDuration: 0,
  peakLevel: 0,
  decayDuration: 0,
  sustainLevel: 0,
  releaseDuration: 0,
  durationUntilRelease: Number.MAX_VALUE // read: ∞
};

var ctx; // the AudioContext
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

// represents an envelope as part of a sound currently being played
function Envelope({ // Enveloped in sound.yp
  attackDuration, peakLevel,
  decayDuration,
  sustainLevel,
  releaseDuration, durationUntilRelease
}, isLocal, triggerTime) {
  this.triggerTime = (('number' == typeof triggerTime) ? triggerTime : now);
  this.peakLevel = peakLevel;
  this.peakTime = this.triggerTime + attackDuration;
  this.sustainLevel = sustainLevel;
  this.sustainTime = this.peakTime + decayDuration;
  this.releaseDuration = releaseDuration;
  if (isLocal) {
    this.makeGainNode();
  }
  if (durationUntilRelease != Number.MAX_VALUE) {
    this.scheduleRelease(this.triggerTime + durationUntilRelease);
  }
}

defineMethods(Envelope, [

function makeGainNode() {
  var ct = ctx.currentTime;
  this.gain = ctx.createGain();
  // set the initial gain value according to the current envelope phase
  if (now == this.peakTime) { // peak (common case shortcut)
    this.gain.gain.value = levelToGain(this.peakLevel);
  } else if (now == this.triggerTime) { // very start (common case shortcut)
    this.gain.gain.value = ExpSilence;
  } else if (now < this.peakTime) { // attack
    this.gain.gain.value =
        expInterp(this.triggerTime, now, this.peakTime,
		  ExpSilence, this.peakLevel);
  } else if (now < this.sustainTime) { // decay
    this.gain.gain.value =
        expInterp(this.peakTime, now, this.sustainTime,
		  this.peakLevel, this.sustainLevel);
  } else if (('releaseTime' in this) || now < this.releaseTime) { // sustain
    this.gain.gain.value = levelToGain(this.sustainLevel);
  } else { // release
    this.gain.gain.value =
        expInterp(this.releaseTime, now, this.endTime,
		  this.sustainLevel, ExpSilence);
  }
  //console.log('initial gain set to ' + this.gain.gain.value);
  // set scheduled gain value changes according to which phases are left to do
  if (now < this.peakTime) { // attack
    //console.log('attack; ramp to ' + levelToGain(this.peakLevel) + ' at time now + ' + ((this.peakTime - now) / fps) + 's');
    this.gain.gain.exponentialRampToValueAtTime(
	levelToGain(this.peakLevel), ct + (this.peakTime - now) / fps);
  }
  if (now < this.sustainTime) { // decay
    //console.log('decay; ramp to ' + levelToGain(this.sustainLevel) + ' at time now + ' + ((this.sustainTime - now) / fps) + 's');
    this.gain.gain.exponentialRampToValueAtTime(
	levelToGain(this.sustainLevel), ct + (this.sustainTime - now) / fps);
  }
  if ('releaseTime' in this) {
    this.scheduleReleaseGain();
  }
  return this.gain;
},

function freeGainNode() {
  this.gain.disconnect();
  delete this.gain;
},

// schedule the default release time, or specify an earlier release time (even
// if the default was already scheduled)
function scheduleRelease(releaseTime) {
  this.releaseTime = (('number' == typeof releaseTime) ? releaseTime : now);
  this.endTime = this.releaseTime + this.releaseDuration;
  if ('gain' in this) {
    this.scheduleReleaseGain();
  }
},

function scheduleReleaseGain() {
  var ct = ctx.currentTime;
  if (now < this.releaseTime) { // now before beginning of release (in sustain?)
    //console.log('sustain; keep value at ' + levelToGain(this.sustainLevel) + ' until time now + ' + ((this.releaseTime - now) / fps) + 's');
    this.gain.gain.setValueAtTime(
	levelToGain(this.sustainLevel), ct + (this.releaseTime - now) / fps);
  }
  if (now < this.endTime) { // now before end of release (should be always)
    //console.log('release; ramp to ' + ExpSilence + ' at time now + ' + ((this.endTime - now) / fps) + 's');
    this.gain.gain.exponentialRampToValueAtTime(
	ExpSilence, ct + (this.endTime - now) / fps);
  }
},

function isFullyReleased() {
  return (('endTime' in this) && now >= this.endTime);
}

]);

/** represents a sound currently being played
 * audibleThing - the thing playing the sound (may be Located, will become Audible)
 * soundableThing - the description of the sound to be played (is Soundable)
 * playedDuration - (optional) the duration for which this sound has already been played (in ticks)
 * releasedDuration - (optional) the duration for which this sound has already been released (in ticks)
 */
function PlayingSound(audibleThing, soundableThing, playedDuration, releasedDuration) {
  this.boundRemoveIfFullyReleased = this.removeIfFullyReleased.bind(this);
  ensureContext();
  this.audibleThing = audibleThing;
  this.soundableThing = soundableThing;
  this.isSilent = false;
  router.on('IsSilenced', this.onThingIsSilenced.bind(this));
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
  this.remove();
},

// is this.audibleThing supposed to be audible to the local player?
function isLocallyAudible() {
  var located = router.getProperties('Located', this.audibleThing);
  if (!located) return true; // omnipresent sound
  var localPlayerThing = router.uplink.players[router.uplink.id].thing;
  var interfaced = router.getProperties('Interfaced', localPlayerThing);
  if (!interfaced) return false; // should never happen
  return interfaced.interface.thingIsInPlayersSpace(this.audibleThing);
},

// is this currently sounding to the local player?
function isSoundingLocally() {
  return ('sources' in this);
},

// if we are to play the sound locally, immediately start
function startSounding() {
  var isLocal = this.isLocallyAudible();
  // ensure we have an envelope for the carrier
  if (!('carrierEnvelope' in this)) {
    var enveloped = router.getProperties('Enveloped', this.soundableThing);
    if (!enveloped) {
      enveloped = DefaultEnveloped;
    }
    this.carrierEnvelope = new Envelope(enveloped, isLocal, this.triggerTime);
    router.on('clockTick', this.boundRemoveIfFullyReleased);
    if ('releaseTime' in this) {
      this.carrierEnvelope.scheduleRelease(this.releaseTime);
    }
  }
  if (!isLocal) return;
  var graph = this.makeGraph();
  this.sources = graph.srcs;
  this.envelopes = graph.envs;
  this.destination = graph.dst;
  this.destination.connect(ctx.destination);
  this.sources.forEach(s => s.start());
},

// if we're playing the sound locally, put all envelopes in their release phases
function releaseAllEnvelopes() {
  if (!this.isSoundingLocally()) return;
  this.envelopes.forEach(e => { e.scheduleRelease(); });
},

// if we're playing the sound locally, immediately stop
function stopSounding() {
  if (!this.isSoundingLocally()) return;
  this.sources.forEach(s => s.stop()); // FIXME is this necessary?
  this.carrierEnvelope.freeGainNode();
  delete this.sources;
  delete this.envelopes;
  delete this.destination;
},

// remove this from audibleThing, and if this was the last PlayingSound in the
// list, make it become not Audible
function remove() {
  router.removeListener('clockTick', this.boundRemoveIfFullyReleased);
  this.isSilent = true;
  var audible = router.getProperties('Audible', this.audibleThing);
  var sounds = audible.playingSounds.filter(x => (!x.isSilent));
  if (sounds.length == 0) {
    router.unbecome(this.audibleThing, 'Audible');
  } else {
    router.become(this.audibleThing, 'Audible', { playingSounds: sounds });
  }
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
    var pitchModded = router.getProperties('PitchModulated', thing);
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
  if (thing == this.soundableThing) { // top-level carrier
    // use carrierEnvelope
    dst.connect(this.carrierEnvelope.gain);
    dst = this.carrierEnvelope.gain;
    envs.push(this.carrierEnvelope);
  } else { // modulator
    var enveloped = router.getProperties('Enveloped', thing);
    if (enveloped) {
      var envelope = new Envelope(enveloped, true);
      dst.connect(envelope.gain);
      dst = envelope.gain;
      envs.push(envelope);
    }
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
  return osc;
},

function makeNoiseSourceNode({ period }) { // Noisy in sound.yp
  // TODO make an AudioBuffer with random audio samples to fill period, and a corresponding AudioBufferSourceNode that loops over it infinitely
  return null;
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

function onThingIsSilenced(thing) {
  if (thing == this.audibleThing) {
    this.silence();
  }
},

// on clockTick for Enveloped sounds
function removeIfFullyReleased() {
  if (this.carrierEnvelope.isFullyReleased()) {
    this.silence(); // calls remove()
  }
}

]);

module.exports = PlayingSound;
