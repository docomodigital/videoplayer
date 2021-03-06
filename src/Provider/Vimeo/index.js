import VimeoPlayer from '@vimeo/player';
import getDomNode from '../../lib/getDomNode';
import Unsupported from '../../lib/unsupported';
import global from '../../global';

const eventsNameMapping = {
    end: 'ended',
    playbackProgress: 'timeupdate',
    loadProgress: 'progress',
    seek: 'seeked',
    setVolume: 'volumechange',
    buffering: 'bufferstart',
};

const eventsToIgnore = [
    'playbackProgress25',
    'playbackProgress50',
    'playbackProgress75',
    'firstPlay',
];

/**
 * Vimeo Player Wrapper
 * @ignore
 * @class VimeoProvider
 */
@Unsupported('toggleFullScreen')
class VimeoProvider {
    /**
     * Internal player id
     */
    id = null;

    /**
     * The Vimeo Player instance
     */
    vmPlayer = null;

    /**
     * All registered listeners grouped by event:
     * {
     *     play: [
     *         {callback: fn(), once: false}
     *     ]
     * }
     * once flag: if true, the callback is fired once and then removed
     */
    internalListeners = {};

    /**
     * Internal event mapping to the Vimeo Player events, grouped by event
     * the event callback will fire all registered event listeners of this.internalListeners
     */
    vmListeners = {};

    /**
     * Promise resolved when the Vimeo SDK is loaded and the Vimeo Player is ready
     */
    ready = null;

    isPlayed = false;

    /**
     * Get video Muted status
     * @return Promise
     */
    get isMuted() {
        return this.ready.then(() => this.vmPlayer.getVolume())
            .then(volume => volume <= 0);
    }

    /**
     * Return all the registered listeners grouped by their event
     */
    get listeners() {
        return this.internalListeners;
    }

    /**
     * Keep track of playback progress percentage, used to fire playback percentage events
     * @type {{'25': boolean, '50': boolean, '75': boolean}}
     */
    timeupdatePercentages = {
        25: false,
        50: false,
        75: false,
    };


    constructor(options, id) {
        this.id = id;

        this.ready = this.createVM(options.domNode, {
            id: options.videoId,
            ...(options.providerOptions || {}),
        });
    }

    /**
     * Load the Vimeo SDK if not loaded yet
     * If multiple instances of this provider exists in the same page,
     * only one SDK is loaded and shared between all instances
     */
    loadSdk() {
        if (!global.VMSDK) {
            if (typeof window.Vimeo === 'object' && typeof window.Vimeo.Player === 'function') {
                global.VMSDK = Promise.resolve(window.Vimeo.Player);
            } else {
                global.VMSDK = Promise.resolve(VimeoPlayer).then(p => {
                    window.Vimeo = {
                        Player: p,
                    };
                    return window.Vimeo.Player;
                });
            }
        }
        return global.VMSDK;
    }

    /**
     * Create the Vimeo Player in the given DOM Node with the given options
     * When the Player is ready, resolve the this.ready Promise
     * @param domNode
     * @param options
     * @return {Promise<any>}
     */
    createVM(domNode, options) {
        return new Promise((resolve, reject) => {
            this.loadSdk().then(Player => {
                domNode = getDomNode(domNode);
                domNode.innerHTML = '';
                this.vmPlayer = new Player(domNode, options);
                this.registerDefaultListeners();
                resolve();
            }).catch(err => reject(err));
        });
    }

    /**
     * Create a callback function that fires all registered listeners for a given event
     * Store the callback in the this.vmListeners object
     * @param evt
     * @return {function(): void}
     */
    addVmListener(evt) {
        const callback = (...data) => this.fireEvent(evt, ...data);
        this.vmListeners[evt] = callback;
        return callback;
    }

    /**
     * Fire all listeners for a given event
     * if a fired listener is flagged as once,
     * immediately deregister it after its fire (fired only once)
     * @param evt
     * @param data
     */
    fireEvent(evt, ...data) {
        if (typeof this.internalListeners[evt] !== 'undefined') {
            this.internalListeners[evt].forEach(event => {
                if (typeof event.callback === 'function') {
                    event.callback(...data);
                }
                if (event.once) {
                    this.off(evt, event.callback);
                }
            });
        }
    }

    /**
     * Given a percentage (one of the this.timeupdatePercentages keys)
     * check if the video playback reached that percentage of completion,
     * if yes, fire the playbackProgress% event
     * @param percentage
     * @param data
     */
    onPercentage(percentage, data) {
        if (Math.floor(data.percent * 100) === percentage) {
            if (!this.timeupdatePercentages[percentage]) {
                this.timeupdatePercentages[percentage] = true;
                this.fireEvent(`playbackProgress${percentage}`, data);
            }
        } else {
            this.timeupdatePercentages[percentage] = false;
        }
    }

    fireFirstPlay = () => {
        if (!this.isPlayed) {
            this.fireEvent('firstPlay');
            this.isPlayed = true;

            this.off('play', this.fireFirstPlay);
        }
    };

    /**
     * Register default listeners on Player init
     */
    registerDefaultListeners() {
        this.vmPlayer.on('timeupdate', data => {
            this.onPercentage(25, data);
            this.onPercentage(50, data);
            this.onPercentage(75, data);
        });
        this.vmPlayer.on('play', this.fireFirstPlay);
    }

    /**
     * Remove the Vimeo Player DOM Node
     * @return Promise
     */
    clear() {
        return this.ready.then(() => {
            this.internalListeners = {};
            this.vmListeners = {};
            return this.vmPlayer.destroy();
        });
    }

    /**
     * Add listener function to an event
     * Register the function in the internal this.internalListeners object
     * if there is no Vimeo Player listeners for the requested event, register one
     * When the Vimeo Player fires the event,
     * the registered callback will call all listeners associated with the event
     * @param event
     * @param callback
     * @param once
     * @return Promise
     */
    on(event, callback, once = false) {
        return this.ready.then(() => {
            const eventName = eventsNameMapping[event]
                || Object.values(eventsNameMapping).find(e => e === event)
                || event;
            if (typeof this.internalListeners[event] === 'undefined') {
                this.internalListeners[event] = [];
                if (!eventsToIgnore.includes(event)) {
                    this.vmPlayer.on(eventName, this.addVmListener(event));
                }
            }
            this.internalListeners[event].unshift({ callback, once });
        });
    }

    /**
     * Add a listener to an event,
     * the listener will be fired only once
     * @param event
     * @param callback
     * @return Promise
     */
    one(event, callback) {
        return this.on(event, callback, true);
    }

    /**
     * Remove a listener from an event
     * if the given listener is the last one for the given event
     * remove also the relative Vimeo Player event listener
     * @param event
     * @param callback
     * @return Promise
     */
    off(event, callback) {
        return this.ready.then(() => {
            if (this.internalListeners[event]) {
                const index = this.internalListeners[event]
                    .findIndex(evt => evt.callback === callback);
                if (index > -1) {
                    this.internalListeners[event].splice(index, 1);
                }
                if (!this.internalListeners[event].length && this.vmListeners[event]) {
                    this.vmPlayer.off(event, this.vmListeners[event]);
                }
            }
        });
    }

    /**
     * When Vimeo Player is ready, send play command
     * @return Promise
     */
    play() {
        return this.ready.then(() => this.vmPlayer.play());
    }

    /**
     * When Vimeo Player is ready, send pause command
     * @return Promise
     */
    pause() {
        return this.ready.then(() => this.vmPlayer.pause());
    }

    /**
     * When Vimeo Player is ready, send unload command (restore the video at the initial state)
     * @return Promise
     */
    stop() {
        return this.ready.then(() => {
            this.isPlayed = false;
            return this.vmPlayer.unload();
        });
    }

    /**
     * When Vimeo Player is ready, send setVolume to 0 command
     * @return Promise
     */
    mute() {
        return this.ready.then(() => this.vmPlayer.setVolume(0));
    }

    /**
     * When Vimeo Player is ready, send setVolume to 1 command
     * @return Promise
     */
    unmute() {
        return this.ready.then(() => this.vmPlayer.setVolume(1));
    }

    /**
     * When Vimeo Player is ready,
     * check the current volume and send setVolume command with 1 or 0 to mute or unmute
     * @return Promise
     */
    toggleMute() {
        return this.ready
            .then(() => this.vmPlayer.getVolume())
            .then(volume => this.vmPlayer.setVolume(volume > 0 ? 0 : 1));
    }

    togglePlay() {
        return this.ready
            .then(() => this.vmPlayer.getPaused())
            .then(paused => {
                if (paused) {
                    return this.play();
                }
                return this.pause();
            });
    }

    /**
     * When Vimeo Player is ready, send setVolume command
     * volumeLevel can be a float from 0 to 1 or an integer from 0 to 100
     * @param volumeLevel
     * @return Promise
     */
    setVolume(volumeLevel) {
        if (volumeLevel > 1) {
            volumeLevel /= 100;
        }
        return this.ready.then(() => this.vmPlayer.setVolume(volumeLevel));
    }

    /**
     * When Vimeo Player is ready, send command to seek to the current time plus the given seconds
     * @param seconds
     * @return Promise
     */
    forward(seconds) {
        return this.ready
            .then(() => this.vmPlayer.getCurrentTime())
            .then(current => this.vmPlayer.setCurrentTime(current + seconds));
    }

    /**
     * When Vimeo Player is ready, send command to seek to the current time minus the given seconds
     * @param seconds
     * @return Promise
     */
    rewind(seconds) {
        return this.ready
            .then(() => this.vmPlayer.getCurrentTime())
            .then(current => this.vmPlayer.setCurrentTime(current - seconds));
    }

    /**
     * When Vimeo Player is ready, send command to seek to the given seconds
     * @param seconds
     * @return Promise
     */
    seek(seconds) {
        return this.ready.then(() => this.vmPlayer.setCurrentTime(seconds));
    }

    /**
     * When Vimeo Player is ready, send command to get the video url
     * @return Promise
     */
    download() {
        return this.ready.then(() => this.vmPlayer.getVideoUrl());
    }
}

export default VimeoProvider;
