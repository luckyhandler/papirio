/**
 * Procedurally generated 80s synthwave background music using the Web Audio
 * API — no audio files, everything is synthesized. A four-bar minor-key
 * chord loop (Am - F - C - G) drives a driving 16th-note arpeggio, a
 * sawtooth bass, a slow synth pad, and a simple gated-reverb drum pattern.
 */

const BPM = 100;
const STEPS_PER_BAR = 16;
const BARS_PER_LOOP = 4;
const SECONDS_PER_STEP = 60 / BPM / 4; // 16th notes
const SCHEDULE_AHEAD_TIME = 0.15;
const SCHEDULER_INTERVAL_MS = 25;

// Am - F - C - G, each as [bassRoot, padChord[], arpPattern[]]
const PROGRESSION = [
    { bass: 110.00, pad: [220.00, 261.63, 329.63], arp: [220.00, 261.63, 329.63, 440.00] }, // Am
    { bass: 87.31, pad: [174.61, 220.00, 261.63], arp: [174.61, 220.00, 261.63, 349.23] },  // F
    { bass: 130.81, pad: [261.63, 329.63, 392.00], arp: [261.63, 329.63, 392.00, 523.25] }, // C
    { bass: 98.00, pad: [196.00, 246.94, 293.66], arp: [196.00, 246.94, 293.66, 392.00] },  // G
];

const DRUM_PATTERN = {
    kick: [0, 8],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    openHat: [14],
};

export class SynthMusic {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.isPlaying = false;
        this.muted = false;
        this.currentBar = 0;
        this.currentStep = 0;
        this.nextNoteTime = 0;
        this.schedulerId = null;
        this.noiseBuffer = null;

        try {
            this.muted = window.localStorage.getItem('papirio_music_muted') === 'true';
        } catch (error) {
            this.muted = false;
        }
    }

    // Browsers block audio until a user gesture. Call this from inside a
    // click/keydown handler (e.g. the "Play" button) to unlock it — needed
    // both for music and for one-shot pickup sound effects.
    ensureAudioReady() {
        this._ensureContext();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    _ensureContext() {
        if (this.ctx) return;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        this.ctx = new AudioCtx();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.35;
        this.masterGain.connect(this.ctx.destination);

        // Pickup sound effects run through their own bus, independent of
        // the music mute toggle.
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.5;
        this.sfxGain.connect(this.ctx.destination);

        this.noiseBuffer = this._createNoiseBuffer();
    }

    _createNoiseBuffer() {
        const bufferSize = this.ctx.sampleRate * 1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    // Starts the music loop. Call only while a round is actually running —
    // the caller is responsible for respecting `muted` and game state.
    start() {
        this.ensureAudioReady();
        if (!this.ctx || this.isPlaying) return;

        this.isPlaying = true;
        this.currentBar = 0;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this._scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this.schedulerId) {
            clearTimeout(this.schedulerId);
            this.schedulerId = null;
        }
    }

    // Persists the mute preference only. Starting/stopping playback in
    // response is the caller's job (it depends on whether a round is live).
    setMuted(muted) {
        this.muted = muted;
        try {
            window.localStorage.setItem('papirio_music_muted', String(muted));
        } catch (error) {
            // Storage may be unavailable in privacy mode.
        }
    }

    toggleMuted() {
        this.setMuted(!this.muted);
        return this.muted;
    }

    _scheduler() {
        if (!this.isPlaying) return;

        while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD_TIME) {
            this._scheduleStep(this.currentBar, this.currentStep, this.nextNoteTime);
            this.nextNoteTime += SECONDS_PER_STEP;
            this.currentStep++;
            if (this.currentStep >= STEPS_PER_BAR) {
                this.currentStep = 0;
                this.currentBar = (this.currentBar + 1) % BARS_PER_LOOP;
            }
        }

        this.schedulerId = setTimeout(() => this._scheduler(), SCHEDULER_INTERVAL_MS);
    }

    _scheduleStep(bar, step, time) {
        const chord = PROGRESSION[bar];

        if (step === 0) {
            this._playPadChord(chord.pad, time, SECONDS_PER_STEP * STEPS_PER_BAR);
            this._playBass(chord.bass, time, SECONDS_PER_STEP * 7);
        }
        if (step === 8) {
            this._playBass(chord.bass * 1.5, time, SECONDS_PER_STEP * 7); // fifth up, pumping feel
        }

        const arpNote = chord.arp[step % chord.arp.length];
        this._playArpNote(arpNote, time, SECONDS_PER_STEP * 0.9);

        if (DRUM_PATTERN.kick.includes(step)) this._playKick(time);
        if (DRUM_PATTERN.snare.includes(step)) this._playSnare(time);
        if (DRUM_PATTERN.hat.includes(step)) {
            this._playHat(time, DRUM_PATTERN.openHat.includes(step));
        }
    }

    _playBass(freq, time, duration) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        filter.Q.value = 1.5;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.5, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + duration + 0.05);
    }

    _playArpNote(freq, time, duration) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2200;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.14, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        // Feedback delay for that classic gated 80s arp echo
        const delay = this.ctx.createDelay();
        delay.delayTime.value = SECONDS_PER_STEP * 2;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.28;
        const wet = this.ctx.createGain();
        wet.gain.value = 0.3;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        gain.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + duration + 0.05);
    }

    _playPadChord(freqs, time, duration) {
        freqs.forEach((freq) => {
            [1, -1].forEach((detuneSign) => {
                const osc = this.ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = freq;
                osc.detune.value = detuneSign * 6; // slight chorus

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 1200;

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.05, time + 0.6);
                gain.gain.setValueAtTime(0.05, time + duration - 0.6);
                gain.gain.linearRampToValueAtTime(0, time + duration);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);

                osc.start(time);
                osc.stop(time + duration + 0.05);
            });
        });
    }

    _playKick(time) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.9, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.25);
    }

    _playSnare(time) {
        // Noise body
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1800;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        // Gated-reverb tail: a few decaying echoes, characteristic 80s snare
        [0.03, 0.07, 0.11].forEach((delayTime, i) => {
            const tailDelay = this.ctx.createDelay();
            tailDelay.delayTime.value = delayTime;
            const tailGain = this.ctx.createGain();
            tailGain.gain.value = 0.22 / (i + 1);
            noiseGain.connect(tailDelay);
            tailDelay.connect(tailGain);
            tailGain.connect(this.masterGain);
        });

        // Pitched body for punch
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 180;
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.3, time);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);

        noise.start(time);
        noise.stop(time + 0.2);
        osc.start(time);
        osc.stop(time + 0.12);
    }

    _playHat(time, open) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;

        const gain = this.ctx.createGain();
        const duration = open ? 0.22 : 0.05;
        gain.gain.setValueAtTime(0.18, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(time);
        noise.stop(time + duration + 0.02);
    }

    // --- One-shot pickup sound effects (independent of music mute) ---

    _blip(freqStart, freqEnd, time, duration, type = 'sine', peakGain = 0.35) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, time);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), time + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(peakGain, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(time);
        osc.stop(time + duration + 0.03);
    }

    playCoin(big = false) {
        this.ensureAudioReady();
        if (!this.ctx) return;
        const time = this.ctx.currentTime;

        if (big) {
            // Two-note ascending chime for the rare bonus coin
            this._blip(1100, 1500, time, 0.08, 'triangle', 0.3);
            this._blip(1500, 2000, time + 0.06, 0.1, 'triangle', 0.32);
        } else {
            this._blip(900, 1400, time, 0.09, 'sine', 0.3);
        }
    }

    playPowerUp(type) {
        this.ensureAudioReady();
        if (!this.ctx) return;
        const time = this.ctx.currentTime;

        if (type === 'speed') {
            // Fast rising zap
            this._blip(300, 2000, time, 0.16, 'sawtooth', 0.28);
        } else if (type === 'shield') {
            // Warm rising fifth, soft attack
            this._blip(220, 440, time, 0.3, 'sine', 0.22);
            this._blip(330, 660, time + 0.03, 0.3, 'sine', 0.16);
        } else if (type === 'bomb') {
            // Low thump + noise burst
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, time);
            osc.frequency.exponentialRampToValueAtTime(35, time + 0.3);
            const oscGain = this.ctx.createGain();
            oscGain.gain.setValueAtTime(0.5, time);
            oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
            osc.connect(oscGain);
            oscGain.connect(this.sfxGain);
            osc.start(time);
            osc.stop(time + 0.4);

            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const noiseFilter = this.ctx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.value = 900;
            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.35, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.sfxGain);
            noise.start(time);
            noise.stop(time + 0.3);
        } else if (type === 'cannon') {
            // Quick descending laser blip
            this._blip(1400, 500, time, 0.12, 'square', 0.2);
        }
    }
}
