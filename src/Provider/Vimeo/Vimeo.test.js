import VimeoProvider from './index';
import global from '../../global';
import Player from '@vimeo/player';

const flushPromises = () => {
    return new Promise(resolve => window.setImmediate(resolve));
};

class MockPlayer {
    _events = {};

    volume = 1;

    currentTime = 0;

    duration = 100;

    paused = false;

    constructor(dom, opts) {
        const parent = document.getElementById(dom);
        if (parent) {
            const iframe = document.createElement('iframe');
            parent.appendChild(iframe);
        }
    }

    on(evt, cb) {
        this._events[evt] = cb;
    }

    off(evt, cb) {
        delete this._events[evt];
    }

    fireEvent(evt, ...data) {
        if (this._events[evt]) {
            this._events[evt](...data);
        }
    }

    getVolume() {
        return this.volume;
    }

    getCurrentTime() {
        return this.currentTime;
    }

    play() {}
    pause() {}
    unload() {}
    setVolume(lvl) {}
    setCurrentTime(sec) {}
    destroy() {}
    getVideoUrl() {
        return Promise.resolve('http://test.com');
    }
    getPaused() {
        return Promise.resolve(this.paused);
    }
}

document.body.innerHTML = `
    <div id="video"></div>
`;
const id = '123';
const options = {
    domNode: '#video',
    videoId: '123'
};

describe('VimeoProvider initialization', () => {
    beforeEach(() => {
        global.VMSDK = null;
        window.Vimeo = undefined;
    });

    it('should correctly load the @vimeo/player module', async () => {
        const Instance = new VimeoProvider(options, id);
        await flushPromises();
        expect(Instance.vmPlayer instanceof Player).toBe(true);
    });

    it('should reuse the same Player if already loaded', async () => {
        // Simulate eager load
        const JestMockPlayer = jest.fn(() => new MockPlayer());
        window.Vimeo = {
            Player: JestMockPlayer
        };
        const Instance = new VimeoProvider(options, id);
        await flushPromises();
        expect(Instance.vmPlayer instanceof Player ).toBe(false);
        expect(Instance.vmPlayer instanceof MockPlayer).toBe(true);
        expect(JestMockPlayer).toHaveBeenCalledWith(document.querySelector(options.domNode), {id: options.videoId});
    });
});

describe('VimeoProvider API', () => {
    let Instance;
    let spys;

    beforeEach(() => {
        global.VMSDK = null;
        window.Vimeo = {
            Player: (...params) => new MockPlayer(...params),
        };
        jest.restoreAllMocks();
        Instance = new VimeoProvider(options, id);
        spys = {
            getVolume: jest.spyOn(MockPlayer.prototype, 'getVolume'),
            getCurrentTime: jest.spyOn(MockPlayer.prototype, 'getCurrentTime'),
            play: jest.spyOn(MockPlayer.prototype, 'play'),
            pause: jest.spyOn(MockPlayer.prototype, 'pause'),
            unload: jest.spyOn(MockPlayer.prototype, 'unload'),
            setVolume: jest.spyOn(MockPlayer.prototype, 'setVolume'),
            setCurrentTime: jest.spyOn(MockPlayer.prototype, 'setCurrentTime'),
            getVideoUrl: jest.spyOn(MockPlayer.prototype, 'getVideoUrl'),
            getPaused: jest.spyOn(MockPlayer.prototype, 'getPaused'),
        };
    });

    it('should call play on play()', async () => {
        await Instance.play();
        expect(spys.play).toHaveBeenCalled();
    });

    it('should call pause on pause()', async () => {
        await Instance.pause();
        expect(spys.pause).toHaveBeenCalled();
    });

    it('should call pause and seek on stop()', async () => {
        await Instance.stop();
        expect(spys.unload).toHaveBeenCalled();
    });

    it('should call setVolume(0) on mute()', async () => {
        await Instance.mute();
        expect(spys.setVolume).toHaveBeenCalledWith(0);
    });

    it('should call setVolume(1) on unmute()', async () => {
        await Instance.unmute();
        expect(spys.setVolume).toHaveBeenCalledWith(1);
    });

    it('should call setVolume on toggleMute()', async () => {
        Instance.vmPlayer.volume = 0;
        await Instance.toggleMute();
        expect(spys.getVolume).toHaveBeenCalled();
        expect(spys.setVolume).toHaveBeenCalledWith(1);

        Instance.vmPlayer.volume = 1;
        await Instance.toggleMute();
        expect(spys.getVolume).toHaveBeenCalled();
        expect(spys.setVolume).toHaveBeenCalledWith(0);
    });

    it('should call getPaused and then play() or pause() on togglePlay()', async () => {
        Instance.vmPlayer.paused = true;
        await Instance.togglePlay();
        expect(spys.getPaused).toHaveBeenCalled();
        expect(spys.play).toHaveBeenCalled();
        expect(spys.pause).not.toHaveBeenCalled();
        Instance.vmPlayer.paused = false;
        await Instance.togglePlay();
        expect(spys.getPaused).toHaveBeenCalledTimes(2);
        expect(spys.pause).toHaveBeenCalled();
        expect(spys.play).toHaveBeenCalledTimes(1);
    });

    it('should call setVolume on setVolume()', async () => {
        await Instance.setVolume(90);
        expect(spys.setVolume).toHaveBeenCalledWith(0.9);
        await Instance.setVolume(0.7);
        expect(spys.setVolume).toHaveBeenCalledWith(0.7);
    });

    it('should call setCurrentTime on forward()', async () => {
        Instance.vmPlayer.currentTime = 50;
        await Instance.forward(10);
        expect(spys.getCurrentTime).toHaveBeenCalled();
        expect(spys.setCurrentTime).toHaveBeenCalledWith(60);
    });

    it('should call setCurrentTime on rewind()', async () => {
        Instance.vmPlayer.currentTime = 50;
        await Instance.rewind(10);
        expect(spys.getCurrentTime).toHaveBeenCalled();
        expect(spys.setCurrentTime).toHaveBeenCalledWith(40);
    });

    it('should call setCurrentTime on seek()', async () => {
        await Instance.seek(10);
        expect(spys.setCurrentTime).toHaveBeenCalledWith(10);
    });

    it('should log a warning when try to call unsupported method toggleFullScreen', () => {
        const mock = jest.spyOn(console, 'warn');
        Instance.toggleFullScreen();
        expect(mock).toHaveBeenCalled();
    });

    it('should return the video url on Vimeo website on download()', async () => {
        expect(await Instance.download()).toEqual('http://test.com');
        expect(spys.getVideoUrl).toHaveBeenCalled();
    });
});

describe('VimeoProvider getters and cleanup', () => {
    let Instance;
    let destroySpy;
    beforeEach(() => {
        global.VMSDK = null;
        window.Vimeo = {
            Player: (...params) => new MockPlayer(...params),
        };
        Instance = new VimeoProvider(options, id);
        document.body.innerHTML = `
            <div id="video"></div>
        `;
        destroySpy = jest.spyOn(MockPlayer.prototype, 'destroy');
    });

    it('should get muted status with isMuted getter', async () => {
        Instance.vmPlayer.volume = 0;
        expect(await Instance.isMuted).toBe(true);
        Instance.vmPlayer.volume = 0.6;
        expect(await Instance.isMuted).toBe(false);
    });

    it('should return all the registered listeners', async () => {
        const cb1 = () => {};
        const cb2 = () => {};
        const cb3 = () => {};
        await Instance.on('play', cb1);
        await Instance.on('pause', cb2);
        await Instance.on('play', cb3);

        const listeners = Instance.listeners;
        expect(Object.keys(listeners)).toEqual(['play', 'pause']);
        expect(listeners.play.length).toEqual(2);
        expect(listeners.pause.length).toEqual(1);
        expect(listeners.play[1].callback).toBe(cb1);
        expect(listeners.play[1].once).toBe(false);
        expect(listeners.play[0].callback).toBe(cb3);
        expect(listeners.play[0].once).toBe(false);
        expect(listeners.pause[0].callback).toBe(cb2);
        expect(listeners.pause[0].once).toBe(false);
    });

    it('should remove the DOM element on clear', async () => {
        await Instance.clear();
        expect(Instance.listeners).toEqual({});
        expect(Instance.vmListeners).toEqual({});
        expect(destroySpy).toHaveBeenCalled();
    });
});

describe('VimeoProvider events, on - off - one', () => {
    let Instance;
    let spys;
    beforeEach(() => {
        global.VMSDK = null;
        window.Vimeo = {
            Player: (...params) => new MockPlayer(params),
        };
        Instance = new VimeoProvider(options, id);
        spys = {
            on: jest.spyOn(MockPlayer.prototype, 'on'),
            off: jest.spyOn(MockPlayer.prototype, 'off')
        }
        document.body.innerHTML = `
            <div id="video"></div>
        `;
    });

    it('should add an event on on', async () => {
        const cb = () => {};
        await Instance.on('play', cb);
        expect(Instance.listeners['play'].length).toBe(1);
        expect(Instance.listeners['play'][0].callback).toBe(cb);
        expect(Instance.vmPlayer._events['play']).toBe(Instance.vmListeners.play);
        expect(spys.on).toHaveBeenLastCalledWith('play', Instance.vmListeners.play);
    });

    it('should remove an event on off', async () => {
        const cb = () => {};
        await Instance.on('play', cb);
        const dmCb = Instance.vmListeners.play;
        await Instance.off('play', cb);
        expect(Instance.listeners['play'].length).toBe(0);
        expect(Instance.vmPlayer._events['play']).toBeUndefined();
        expect(spys.off).toHaveBeenLastCalledWith('play', dmCb);
    });

    it('should send playbackProgress25 event', async () => {
        const cb = jest.fn();
        await Instance.on('playbackProgress25', cb);
        Instance.vmPlayer.duration = 100;
        Instance.vmPlayer.currentTime = 25;
        Instance.vmPlayer.fireEvent('timeupdate', {percent: 0.25});
        expect(Instance.listeners['playbackProgress25'][0].callback).toHaveBeenCalled();
    });

    it('should send playbackProgress50 event', async () => {
        const cb = jest.fn();
        await Instance.on('playbackProgress50', cb);
        Instance.vmPlayer.duration = 100;
        Instance.vmPlayer.currentTime = 50;
        Instance.vmPlayer.fireEvent('timeupdate', {percent: 0.50});
        expect(Instance.listeners['playbackProgress50'][0].callback).toHaveBeenCalled();
    });

    it('should send playbackProgress75 event', async () => {
        const cb = jest.fn();
        await Instance.on('playbackProgress75', cb);
        Instance.vmPlayer.duration = 100;
        Instance.vmPlayer.currentTime = 75;
        Instance.vmPlayer.fireEvent('timeupdate', {percent: 0.75});
        expect(Instance.listeners['playbackProgress75'][0].callback).toHaveBeenCalled();
    });

    it('should register a once event and deregister it after first fire', async () => {
        const cb = jest.fn();
        await Instance.one('play', cb);
        const dmCb = Instance.vmListeners.play;
        Instance.vmPlayer.fireEvent('play');
        await flushPromises();
        expect(cb).toHaveBeenCalled();
        expect(Instance.listeners.play.length).toBe(0);
        expect(spys.off).toHaveBeenLastCalledWith('play', dmCb);
    });

    it('should fire firstPlay event only on first play', async () => {
        const cb = jest.fn();
        expect(Instance.vmPlayer._events.play).toBeDefined();
        await Instance.on('firstPlay', cb);
        expect(Instance.listeners.firstPlay.length).toBe(1);
        Instance.vmPlayer.fireEvent('play');
        await flushPromises();
        expect(cb).toHaveBeenCalled();
        expect(Instance.listeners.firstPlay.length).toBe(1);
        expect(Instance.vmPlayer._events.play).toBeDefined();
        expect(Instance.isPlayed).toBe(true);
    });

    it('should fire firstPlay again after player stop', async () => {
        const cb = jest.fn();
        await Instance.on('firstPlay', cb);
        Instance.vmPlayer.fireEvent('play');
        await flushPromises();
        await Instance.stop();
        Instance.vmPlayer.fireEvent('play');
        expect(cb).toHaveBeenCalledTimes(2);
    });
});

describe('VimeoProvider Errors', () => {
    beforeEach(() => {
        global.VMSDK = null;
        delete window.Vimeo;
        jest.resetAllMocks();
    });
    afterAll(() => {
        jest.resetAllMocks();
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('should catch an error while creating the player', () =>  {
        window.Vimeo = {
            Player: () => {
                throw new Error('Player Test Error');
            },
        };
        const Instance = new VimeoProvider(options, id);
        return expect(Instance.ready).rejects.toEqual(new Error('Player Test Error'));
    });
});
