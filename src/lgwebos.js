const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const WebSocketClient = require('websocket').client;
const pairing = require('./pairing.json');
const API_URL = require('./apiurl.json');

const SOCKET_OPTIONS = {
    keepalive: true,
    keepaliveInterval: 5000,
    keepaliveGracePeriod: 3000,
    dropConnectionOnKeepaliveTimeout: true
};

class SpecializedSocket {
    constructor(ws) {
        this.send = (type, payload) => {
            payload = payload || {};
            const message = Object.keys(payload).reduce((acc, k) => {
                return acc.concat([k + ':' + payload[k]]);
            }, ['type:' + type]).join('\n') + '\n\n';
            ws.send(message);
        };
        this.close = () => {
            ws.close();
        };
    };
};

class LGTV extends EventEmitter {
    constructor(config) {
        super();
        this.url = config.url;
        this.keyFile = config.keyFile;
        this.infoLog = config.infoLog;
        this.debugLog = config.debugLog;
        this.mqttEnabled = config.enableMqtt;

        this.isConnected = false;
        this.connection = {};
        this.specializedSockets = {};
        this.callbacks = {};
        this.isPaired = false;
        this.inputSocket = null;
        this.power = false;

        this.client = new WebSocketClient(SOCKET_OPTIONS);
        this.client.on('connectFailed', (error) => {
                this.isConnected = false;
                this.connection = {};
                const debug = this.debugLog ? this.emit('debug', `Connect to TV Failed: ${error}`) : false;

                setTimeout(() => {
                    this.connect();
                }, 5000);
            })
            .on('connect', (connection) => {
                this.connection = connection;
                this.connection.on('error', (error) => {
                        this.emit('error', `Connect to TV error: ${error}`);
                    })
                    .on('message', (message) => {
                        if (message.type === 'utf8') {
                            const messageUtf8Data = message.utf8Data;
                            const parsedMessage = messageUtf8Data ? JSON.parse(messageUtf8Data) : this.infoLog ? false : this.emit('message', `Not received UTF-8 data: ${messageUtf8Data}`);

                            if (parsedMessage.payload && this.callbacks[parsedMessage.id]) {
                                this.callbacks[parsedMessage.id](null, parsedMessage.payload);
                                const debug = this.debugLog ? this.emit('debug', `Message: ${JSON.stringify(parsedMessage.payload, null, 2)}`) : false;
                            };
                        } else {
                            const debug = this.debugLog ? this.emit('debug', `Received non UTF-8 data: ${message}`) : false;
                        };
                    })
                    .on('close', () => {
                        this.connection = {};
                        this.isConnected = false;
                        Object.keys(this.callbacks).forEach((cid) => {
                            delete this.callbacks[cid];
                        });
                        this.emit('powerState', this.isConnected, this.power, false, false);
                        this.emit('audioState', 0, true, '');
                        this.emit('disconnect', 'Disconnected.');

                        setTimeout(() => {
                            this.connect();
                        }, 5000);
                    });
                this.isConnected = true;
                this.register();
            });
        this.connect();
    };

    register() {
        const savedPairingKey = (fs.readFileSync(this.keyFile).toString() != undefined) ? fs.readFileSync(this.keyFile).toString() : undefined;
        pairing['client-key'] = savedPairingKey;

        this.send('register', undefined, pairing, async (error, res) => {
            if (!error && res) {
                const pairingKey = res['client-key'];
                if (pairingKey) {
                    if (savedPairingKey !== pairingKey) {
                        try {
                            const writeKey = await fsPromises.writeFile(this.keyFile, pairingKey);
                            const info = this.infoLog ? false : this.emit('message', 'Pairing key saved.')
                        } catch (error) {
                            this.emit('error', `Pairing key saved error: ${error}`)
                        };
                    };
                    this.isPaired = true;
                    this.emit('connect', 'Connected.');
                    try {
                        await this.subscribeData();
                    } catch (error) {
                        this.emit('error', `Subscribe data error: ${error}`)
                    };
                    this.getSocket();
                } else {
                    const info = this.infoLog ? false : this.emit('message', 'Waiting on authorization accept...');
                };
            } else {
                this.emit('error', `Register error: ${error}`);
            };
        });
    };

    getSocket() {
        if (this.specializedSockets[API_URL.SocketUrl]) {
            this.inputSocket = this.specializedSockets[API_URL.SocketUrl];
        };

        this.send('request', API_URL.SocketUrl, (err, data) => {
            if (err) {
                this.emit('error', `Send request error: ${err}`);
                return;
            };

            const specialClient = new WebSocketClient(SOCKET_OPTIONS);
            specialClient.on('connectFailed', (error) => {
                    this.emit('error', `Specialized socket connect failed: ${error}`);

                    setTimeout(() => {
                        this.reconnectSocket();
                    }, 6000);
                })
                .on('connect', (connection) => {
                    connection.on('error', (error) => {
                            this.emit('error', `Specialized socket connect error: ${error}`);
                        })
                        .on('close', () => {
                            delete this.specializedSockets[API_URL.SocketUrl];
                            this.inputSocket = null;
                            this.emit('socketDisconnect', 'Specialized socket disconnected.');

                            setTimeout(() => {
                                this.reconnectSocket();
                            }, 6000);
                        });

                    this.specializedSockets[API_URL.SocketUrl] = new SpecializedSocket(connection);
                    this.inputSocket = this.specializedSockets[API_URL.SocketUrl];
                    this.emit('socketConnect', 'Specialized socket connected.');
                });

            const socketPath = data.socketPath;
            specialClient.connect(socketPath);
        });
    };

    subscribeData() {
        return new Promise((resolve, reject) => {
            this.send('request', API_URL.GetSystemInfo, (error, response) => {
                if (error || response.errorCode) {
                    this.emit('error', `System info error: ${error}`)
                }
                const debug = this.debugLog ? this.emit('debug', `System info: ${JSON.stringify(response, null, 2)}`) : false;

                this.send('request', API_URL.GetSoftwareInfo, (error, response1) => {
                    if (error || response.errorCode) {
                        this.emit('error', `Software info error: ${error}`)
                    }
                    const debug = this.debugLog ? this.emit('debug', `Software info: ${JSON.stringify(response1, null, 2)}`) : false;

                    const modelName = response.modelName;
                    const productName = response1.product_name;
                    const serialNumber = response1.device_id;
                    const firmwareRevision = `${response1.major_ver}.${response1.minor_ver}`;
                    const webOS = (response1.product_name != undefined) ? response1.product_name.slice(8, -2) : 3;
                    this.emit('deviceInfo', modelName, productName, serialNumber, firmwareRevision, webOS);
                    const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Info', JSON.stringify(response, null, 2)) : false;
                    const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'Info 1', JSON.stringify(response1, null, 2)) : false;

                    this.send('subscribe', API_URL.GetChannelList, (error, response) => {
                        if (error || response.errorCode) {
                            this.emit('error', `Channel list error: ${error}`)
                        }
                        this.emit('channelList', response);
                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Channel List', JSON.stringify(response, null, 2)) : false;
                    });
                    this.send('subscribe', API_URL.GetCurrentChannel, (error, response) => {
                        if (error || response.errorCode) {
                            this.emit('error', `Current channel error: ${error}`)
                        }
                        const channelName = response.channelName;
                        const channelNumber = response.channelNumber;
                        const channelReference = response.channelId;
                        this.emit('currentChannel', channelName, channelNumber, channelReference);
                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Current Channel', JSON.stringify(response, null, 2)) : false;
                    });
                    this.send('subscribe', API_URL.GetInstalledApps, (error, response) => {
                        if (error || response.errorCode) {
                            this.emit('error', `Installed apps error: ${error}`)
                        }
                        this.emit('installedApps', response);
                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Apps List', JSON.stringify(response, null, 2)) : false;
                    });
                    this.send('subscribe', API_URL.GetForegroundAppInfo, (error, response) => {
                        if (error || response.errorCode) {
                            this.emit('error', `Foreground app error: ${error}`)
                        }
                        const reference = response.appId;
                        this.emit('currentApp', reference);
                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Current App', JSON.stringify(response, null, 2)) : false;
                    });
                    this.send('subscribe', API_URL.GetPowerState, (error, response) => {
                        if (error || response.errorCode) {
                            this.emit('error', `Power state error: ${error}`)
                        }
                        //screen On
                        const prepareScreenOn = ((response.state == 'Suspend' && response.processing == 'Screen On') || (response.state == 'Screen Saver' && response.processing == 'Screen On') || (response.state == 'Active Standby' && response.processing == 'Screen On'));
                        const stillScreenOn = (response.state == 'Active' && response.processing == 'Screen On');
                        const powerOnScreenOff = (response.state == 'Screen Off' || (response.state == 'Screen Off' && response.processing == 'Screen On'));
                        const screenOn = (response.state == 'Active');

                        //screen Saver
                        const prepareScreenSaver = (response.state == 'Active' && response.processing == 'Request Screen Saver');
                        const screenSaver = (response.state == 'Screen Saver');

                        //screen Off
                        const prepareScreenOff = ((response.state == 'Active' && response.processing == 'Request Power Off') || (response.state == 'Active' && response.processing == 'Request Suspend') || (response.state == 'Active' && response.processing == 'Prepare Suspend') ||
                                (response.state == 'Screen Saver' && response.processing == 'Request Power Off') || (response.state == 'Screen Saver' && response.processing == 'Request Suspend') || (response.state == 'Screen Saver' && response.processing == 'Prepare Suspend')) ||
                            (response.state == 'Active Standby' && response.processing == 'Request Power Off') || (response.state == 'Active Standby' && response.processing == 'Request Suspend') || (response.state == 'Active Standby' && response.processing == 'Prepare Suspend');
                        const screenOff = (response.state == 'Suspend');

                        //pixelRefresh
                        const prepareScreenPixelRefresh = ((response.state == 'Active' && response.processing == 'Request Active Standby') || (response.state == 'Screen Saver' && response.processing == 'Request Active Standby'));
                        const screenPixelRefresh = (response.state == 'Active Standby');

                        //powerState
                        const pixelRefresh = (prepareScreenPixelRefresh || screenPixelRefresh);
                        const powerOn = (prepareScreenOn || stillScreenOn || powerOnScreenOff || screenOn || prepareScreenSaver || screenSaver);
                        const powerOff = (prepareScreenOff || screenOff || pixelRefresh);

                        const power = (webOS >= 3) ? (powerOn && !powerOff) : this.isConnected;
                        const screenState = power ? !powerOnScreenOff : false;

                        this.power = power;

                        this.emit('powerState', this.isConnected, power, pixelRefresh, screenState);
                        const setAudioState = !power ? this.emit('audioState', 0, true, '') : false;
                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Power State', JSON.stringify(response, null, 2)) : false;
                    });
                    this.send('subscribe', API_URL.GetAudioStatus, (error, response) => {
                        if (error || response.errorCode) {
                            this.emit('error', `Audio state error: ${error}`)
                        }
                        const volume = response.volume;
                        const mute = (response.mute == true);
                        const audioOutput = response.scenario;
                        this.emit('audioState', volume, mute, audioOutput);
                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Audio State', JSON.stringify(response, null, 2)) : false;
                    });
                    if (webOS >= 4) {
                        const payload = {
                            category: 'picture',
                            keys: ['brightness', 'backlight', 'contrast', 'color']
                        }
                        this.send('subscribe', API_URL.GetSystemSettings, payload, (error, response) => {
                            if (error || response.errorCode) {
                                this.emit('error', `System settings error: ${error}`)
                            }
                            const brightness = response.settings.brightness;
                            const backlight = response.settings.backlight;
                            const contrast = response.settings.contrast;
                            const color = response.settings.color;
                            const pictureMode = 3;
                            this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode);
                            const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Picture Settings', JSON.stringify(response, null, 2)) : false;
                        });
                    };
                    this.send('subscribe', API_URL.GetAppState, (error, response) => {
                        if (error || response.errorCode) {
                            this.emit('error', `App state error: ${error}`)
                        };
                        this.emit('appState');
                    });
                });
            });

            setTimeout(() => {
                resolve(true);
            }, 1500);
        });
    };

    send(type, uri, payload, cb) {
        if (typeof payload === 'function') {
            cb = payload;
            payload = {};
        };

        if (!this.isConnected) {
            if (typeof cb === 'function') {
                cb(new Error('TV not connected'));
            };
            return;
        };

        const cid = this.getCid();
        const json = JSON.stringify({
            id: cid,
            type: type,
            uri: uri,
            payload: payload
        });

        if (typeof cb === 'function') {
            switch (type) {
                case 'request':
                    this.callbacks[cid] = (err, res) => {
                        delete this.callbacks[cid];
                        cb(err, res);
                    };

                    setTimeout(() => {
                        if (this.callbacks[cid]) {
                            cb(new Error('Callback timeout'));
                        };
                        delete this.callbacks[cid];
                    }, 3500);
                    break;

                case 'subscribe':
                    this.callbacks[cid] = cb;
                    break;

                case 'register':
                    this.callbacks[cid] = cb;
                    break;

                default:
                    throw new Error('Unknown send type');
            }
        }
        this.connection.send(json);
    };

    getCid() {
        let cidCount = 0;
        let cidPrefix = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8);
        return cidPrefix + (`000${(cidCount++).toString(16)}`).slice(-4);
    };

    connect() {
        if (this.isConnected && !this.isPaired) {
            this.register();
        } else if (!this.isConnected) {
            this.client.connect(this.url);
        };
    };

    reconnectSocket() {
        if (this.isConnected && !this.inputSocket) {
            this.getSocket();
        };
    };
};
module.exports = LGTV;