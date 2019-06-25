import * as util from './util';
const PLAYING = 'playing';
const PAUSED = 'paused';
const FINISHED = 'finished';

/**
 * External backend
 */
export default class External extends util.Observer {
    /**
     * Construct the backend
     *
     * @param {WavesurferParams} params
     */
    constructor(params) {
        super(params);
        /** @private */
        this.params = params;

        /** @private */
        this.peaks = null;
        /** @private */
        this.playbackRate = 1;
        /** @private */
        this.volume = 1;
        /** @private  */
        this.scheduledPause = null;

        this.clockTime = null;
        this.startPosition = null;
        this.lastPlay = null;
        this.explicitDuration = null;
        this.state = null;
    }

    /**
     * Initialise the backend, called in `wavesurfer.createBackend()`
     */
    init() {
        this.setPlaybackRate(this.params.audioRate);
        this.createTimer();
    }

    /**
     * Create a timer to provide a more precise `audioprocess` event.
     *
     * @private
     */
    createTimer() {
        const onAudioProcess = time => {
            if (time != null) {
                this.clockTime = time / 1000;
                if (this.lastPlay == null) {
                    this.lastPlay = this.clockTime;
                }
            }
            // console.log(
            //     this.clockTime,
            //     this.lastPlay,
            //     this.getPlayedTime(),
            //     this.getCurrentTime(),
            //     this.startPosition
            // );

            if (this.getCurrentTime() >= this.getDuration()) {
                this.pause();
                this.setState(FINISHED);
            } else if (
                this.scheduledPause &&
                this.getCurrentTime() >= this.scheduledPause
            ) {
                this.pause();
            } else if (this.state === PLAYING) {
                this.fireEvent('audioprocess', this.getCurrentTime());

                // Call again in the next frame
                const requestAnimationFrame =
                    window.requestAnimationFrame ||
                    window.webkitRequestAnimationFrame;
                requestAnimationFrame(onAudioProcess);
            }
        };

        this.on('play', onAudioProcess);

        // Update the progress one more time to prevent it from being stuck in
        // case of lower framerates
        this.on('pause', () => {
            this.fireEvent('audioprocess', this.getCurrentTime());
        });
    }

    /**
     * Create media element with url as its source,
     * and append to container element.
     *
     * @param {string} url Path to media file
     * @param {HTMLElement} container HTML element
     * @param {number[]|number[][]} peaks Array of peak data
     * @param {string} preload HTML 5 preload attribute value
     */
    load(peaks, duration) {
        this.startPosition = 0;
        this.setPeaks(peaks, duration);
        this.scheduledPause = null;
        this.setState(PAUSED);
    }

    /**
     * Set pre-decoded peaks
     *
     * @param {number[]|number[][]} peaks
     * @param {?number} duration
     */
    setPeaks(peaks, duration) {
        this.explicitDuration = duration;
        this.peaks = peaks;
    }

    /**
     * Used by `wavesurfer.isPlaying()` and `wavesurfer.playPause()`
     *
     * @return {boolean}
     */
    isPaused() {
        return this.state !== PLAYING;
    }

    /**
     * Used by `wavesurfer.getDuration()`
     *
     * @return {number}
     */
    getDuration() {
        return this.explicitDuration;
    }

    /**
     * Returns the current time in seconds relative to the audio-clip's
     * duration.
     *
     * @return {number}
     */
    getCurrentTime() {
        switch (this.state) {
            case PLAYING:
                return this.startPosition + this.getPlayedTime();
            case PAUSED:
                return this.startPosition;
            case FINISHED:
                return this.getDuration();
        }
    }

    /**
     * Get the playback position in seconds
     *
     * @return {number}
     */
    getPlayedTime() {
        return (this.clockTime - this.lastPlay) * this.playbackRate;
    }

    /**
     * Get the position from 0 to 1
     *
     * @return {number}
     */
    getPlayedPercents() {
        if (this.state === FINISHED) {
            return 1;
        } else {
            return this.getCurrentTime() / this.getDuration() || 0;
        }
    }

    /** @private */
    setState(state) {
        if (this.state !== state) {
            this.state = state;
            if (state === FINISHED) {
                this.fireEvent('finish');
            }
        }
    }
    /**
     * Get the audio source playback rate.
     *
     * @return {number}
     */
    getPlaybackRate() {
        return this.playbackRate;
    }

    /**
     * Set the audio source playback rate.
     *
     * @param {number} value
     */
    setPlaybackRate(value) {
        value = value || 1;
        if (this.isPaused()) {
            this.playbackRate = value;
        } else {
            this.pause();
            this.playbackRate = value;
            this.play();
        }
    }

    /**
     * Used by `wavesurfer.seekTo()`
     *
     * @param {number} start Position to start at in seconds
     */
    seekTo(start) {
        // this.scheduledPause = null;

        if (start == null) {
            start = this.getCurrentTime();
            if (start >= this.getDuration()) {
                start = 0;
            }
        }

        this.startPosition = start;

        if (this.state === FINISHED) {
            this.setState(PAUSED);
        }
    }

    /**
     * Plays the loaded audio region.
     *
     * @param {number} start Start offset in seconds, relative to the beginning
     * of a clip.
     * @param {number} end When to stop, relative to the beginning of a clip.
     * @emits MediaElement#play
     * @return {Promise}
     */
    play(start, end) {
        this.seekTo(start);
        this.scheduledPause = end;

        this.setState(PLAYING);

        this.lastPlay = null;
        this.clockTime = null;
        this.fireEvent('play');
    }

    /**
     * Pauses the loaded audio.
     *
     * @emits MediaElement#pause
     * @return {Promise}
     */
    pause() {
        this.scheduledPause = null;

        this.startPosition += this.getPlayedTime();

        this.setState(PAUSED);

        this.fireEvent('pause');
    }

    /**
     * Compute the max and min value of the waveform when broken into
     * <length> subranges.
     *
     * @param {number} length How many subranges to break the waveform into.
     * @param {number} first First sample in the required range.
     * @param {number} last Last sample in the required range.
     * @return {number[]|number[][]} Array of 2*<length> peaks or array of
     * arrays of peaks consisting of (max, min) values for each subrange.
     */
    getPeaks(length, first, last) {
        // if (this.buffer) {
        //     return super.getPeaks(length, first, last);
        // }
        return this.peaks || [];
    }

    /**
     * Get the current volume
     *
     * @return {number} value A floating point value between 0 and 1.
     */
    getVolume() {
        return this.volume;
    }

    /**
     * Set the audio volume
     *
     * @param {number} value A floating point value between 0 and 1.
     */
    setVolume(value) {
        this.volume = value;
    }

    /**
     * This is called when wavesurfer is destroyed
     *
     */
    destroy() {
        this.pause();
        this.unAll();
    }
}
