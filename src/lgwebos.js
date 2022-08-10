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
        this.debugLog = config.debugLog;
        this.mqttEnabled = config.enableMqtt;

        this.isConnected = false;
        this.connection = {};
        this.specializedSockets = {};
        this.inputSocket = {};

        this.registerId = '';
        this.socketId = '';
        this.savedPairingKey = '';
        this.systemInfoId = '';
        this.softwareInfoId = '';
        this.installedAppsId = '';
        this.channelsId = '';
        this.powerStateId = '';
        this.audioStateId = '';
        this.currentAppId = '';
        this.currentChannelId = '';
        this.pictureSettingsId = '';

        this.webOs = 2;
        this.modelName = '';
        this.power = false;
        this.screenState = false;
        this.volume = 0;
        this.mute = true;
        this.audioOutput = '';
        this.appId = '';
        this.channelName = '';
        this.channelNumber = 0;
        this.channelId = '';

        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.pictureMode = '';

        this.client = new WebSocketClient(SOCKET_OPTIONS);
        this.client.on('connect', (connection) => {
                const debug = this.debugLog ? this.emit('debug', 'Socket connected.') : false;
                this.connection = connection;

                this.connection.on('message', async (message) => {
                        if (message.type === 'utf8') {
                            const messageUtf8Data = message.utf8Data;
                            const parsedMessage = messageUtf8Data ? JSON.parse(messageUtf8Data) : this.debugLog ? this.emit('debug', `Not received UTF-8 data: ${messageUtf8Data}`) : false;
                            const messageId = parsedMessage.id;
                            const messageData = parsedMessage.payload;
                            const stringifyMessage = JSON.stringify(messageData, null, 2);

                            if (messageData) {
                                const debug = this.debugLog ? this.emit('debug', `Message Id: ${messageId}, Data: ${stringifyMessage}`) : false;

                                //Register
                                if (messageId == this.registerId) {
                                    const pairingKey = messageData['client-key'];
                                    if (pairingKey) {
                                        if (pairingKey != this.savedPairingKey) {
                                            try {
                                                const writeKey = await fsPromises.writeFile(this.keyFile, pairingKey);
                                                this.emit('message', 'Pairing key saved.')
                                                this.savedPairingKey = pairingKey;
                                            } catch (error) {
                                                this.emit('error', `Pairing key saved error: ${error}`)
                                            };
                                        };

                                        try {
                                            await this.getSocket();
                                            await this.subscribeData();
                                        } catch (error) {
                                            this.emit('error', `Data error: ${error}`)
                                        };
                                    } else {
                                        this.emit('message', 'Waiting on authorization accept...');
                                    };
                                };

                                //Specialized Sockes
                                if (messageId == this.socketId) {
                                    if (this.specializedSockets[API_URL.SocketUrl]) {
                                        this.inputSocket = this.specializedSockets[API_URL.SocketUrl];
                                    };

                                    const specialClient = new WebSocketClient(SOCKET_OPTIONS);
                                    specialClient.on('connect', (connection) => {
                                            connection.on('close', () => {
                                                    const debug1 = this.debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                                                    delete this.specializedSockets[API_URL.SocketUrl];
                                                    this.inputSocket = {};
                                                })
                                                .on('error', (error) => {
                                                    this.emit('error', `Specialized socket error: ${error}`);
                                                    this.reconnectSocket();
                                                });

                                            const debug2 = this.debugLog ? this.emit('debug', 'Specialized socket connected.') : false;
                                            this.specializedSockets[API_URL.SocketUrl] = new SpecializedSocket(connection);
                                            this.inputSocket = this.specializedSockets[API_URL.SocketUrl];
                                        })
                                        .on('connectFailed', (error) => {
                                            this.emit('error', `Specialized socket connect failed: ${error}`);
                                            this.reconnectSocket();
                                        });

                                    const socketPath = messageData.socketPath;
                                    specialClient.connect(socketPath);
                                };

                                //System Info
                                if (messageId == this.systemInfoId) {
                                    const debug = this.debugLog ? this.emit('debug', `System info: ${stringifyMessage}`) : false;
                                    const modelName = messageData.modelName;
                                    const mqtt = this.mqttEnabled ? this.emit('mqtt', 'System Info', stringifyMessage) : false;
                                    this.modelName = modelName;
                                };

                                //Software Info
                                if (messageId == this.softwareInfoId) {
                                    const debug1 = this.debugLog ? this.emit('debug', `Software info: ${stringifyMessage}`) : false;
                                    const productName = messageData.product_name;
                                    const serialNumber = messageData.device_id;
                                    const firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                                    const webOS = (messageData.product_name != undefined) ? messageData.product_name.slice(8, -2) : 3;
                                    this.webOs = webOS;

                                    this.emit('connect', 'Connected.');
                                    this.emit('deviceInfo', this.modelName, productName, serialNumber, firmwareRevision, webOS);
                                    const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'Software Info', stringifyMessage) : false;

                                };
                                //Installed Apps
                                if (messageId == this.installedAppsId) {
                                    const debug2 = this.debugLog ? this.emit('debug', `Apps List ${stringifyMessage}`) : false;
                                    if (messageData.apps != undefined) {
                                        this.emit('installedApps', messageData.apps);
                                        const mqtt2 = this.mqttEnabled ? this.emit('mqtt', 'Apps List', stringifyMessage) : false;
                                    };
                                };

                                //Channels list
                                if (messageId == this.channelsId) {
                                    const debug3 = this.debugLog ? this.emit('debug', `Channel List ${stringifyMessage}`) : false;
                                    if (messageData.channelList != undefined) {
                                        this.emit('channelList', messageData.channelList);
                                        const mqtt3 = this.mqttEnabled ? this.emit('mqtt', 'Channel List', stringifyMessage) : false;
                                    };
                                };

                                //Power State
                                if (messageId == this.powerStateId) {
                                    const debug = this.debugLog ? this.emit('debug', `Power State: ${stringifyMessage}`) : false;
                                    //screen On
                                    const prepareScreenOn = ((messageData.state == 'Suspend' && messageData.processing == 'Screen On') || (messageData.state == 'Screen Saver' && messageData.processing == 'Screen On') || (messageData.state == 'Active Standby' && messageData.processing == 'Screen On'));
                                    const stillScreenOn = (messageData.state == 'Active' && messageData.processing == 'Screen On');
                                    const powerOnScreenOff = (messageData.state == 'Screen Off' || (messageData.state == 'Screen Off' && messageData.processing == 'Screen On'));
                                    const screenOn = (messageData.state == 'Active');

                                    //screen Saver
                                    const prepareScreenSaver = (messageData.state == 'Active' && messageData.processing == 'Request Screen Saver');
                                    const screenSaver = (messageData.state == 'Screen Saver');

                                    //screen Off
                                    const prepareScreenOff = ((messageData.state == 'Active' && messageData.processing == 'Request Power Off') || (messageData.state == 'Active' && messageData.processing == 'Request Suspend') || (messageData.state == 'Active' && messageData.processing == 'Prepare Suspend') ||
                                            (messageData.state == 'Screen Saver' && messageData.processing == 'Request Power Off') || (messageData.state == 'Screen Saver' && messageData.processing == 'Request Suspend') || (messageData.state == 'Screen Saver' && messageData.processing == 'Prepare Suspend')) ||
                                        (messageData.state == 'Active Standby' && messageData.processing == 'Request Power Off') || (messageData.state == 'Active Standby' && messageData.processing == 'Request Suspend') || (messageData.state == 'Active Standby' && messageData.processing == 'Prepare Suspend');
                                    const screenOff = (messageData.state == 'Suspend');

                                    //pixelRefresh
                                    const prepareScreenPixelRefresh = ((messageData.state == 'Active' && messageData.processing == 'Request Active Standby') || (messageData.state == 'Screen Saver' && messageData.processing == 'Request Active Standby'));
                                    const screenPixelRefresh = (messageData.state == 'Active Standby');

                                    //powerState
                                    const pixelRefresh = (prepareScreenPixelRefresh || screenPixelRefresh);
                                    const powerOn = (prepareScreenOn || stillScreenOn || powerOnScreenOff || screenOn || prepareScreenSaver || screenSaver);
                                    const powerOff = (prepareScreenOff || screenOff || pixelRefresh);

                                    const power = (this.webOS >= 3) ? (this.isConnected && powerOn && !powerOff) : this.isConnected;
                                    const screenState = power ? !powerOnScreenOff : false;

                                    if (power != this.power || screenState != this.screenState) {
                                        this.emit('powerState', power, pixelRefresh, screenState);
                                        const setAudioState = !power ? this.emit('audioState', 0, true, '') : false;
                                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Power State', stringifyMessage) : false;
                                        this.power = power;
                                        this.screenState = screenState;
                                    };
                                };

                                //Audio State
                                if (messageId == this.audioStateId) {
                                    const debug = this.debugLog ? this.emit('debug', `Audio State: ${stringifyMessage}`) : false;
                                    const volume = messageData.volume;
                                    const mute = this.power ? (messageData.mute == true) : true;
                                    const audioOutput = (this.webOS >= 5) ? messageData.volumeStatus.soundOutput : messageData.scenario;

                                    if (volume != this.volume || mute != this.mute || audioOutput != this.audioOutput) {
                                        this.emit('audioState', volume, mute, audioOutput);
                                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Audio State', stringifyMessage) : false;
                                        this.volume = volume;
                                        this.mute = mute;
                                        this.audioOutput = audioOutput;
                                    };
                                };

                                //Current App
                                if (messageId == this.currentAppId) {
                                    const debug = this.debugLog ? this.emit('debug', `Current App: ${stringifyMessage}`) : false;
                                    const appId = messageData.appId;

                                    if (appId != this.appId) {
                                        this.emit('currentApp', appId);
                                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Current App', stringifyMessage) : false;
                                        this.appId = appId;
                                    };
                                };

                                //Current Channel
                                if (messageId == this.currentChannelId) {
                                    const debug = this.debugLog ? this.emit('debug', `Current Channel: ${stringifyMessage}`) : false;
                                    const channelId = messageData.channelId;
                                    const channelName = messageData.channelName;
                                    const channelNumber = messageData.channelNumber;


                                    if (channelName != this.channelName || channelNumber != this.channelNumber || channelId != this.channelId) {
                                        this.emit('currentChannel', channelName, channelNumber, channelId);
                                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Current Channel', stringifyMessage) : false;
                                        this.channelId = channelId;
                                        this.channelName = channelName;
                                        this.channelNumber = channelNumber;
                                    };

                                };

                                //Picture Settings
                                if (messageId == this.pictureSettingsId) {
                                    const debug = this.debugLog ? this.emit('debug', `Picture Settings: ${stringifyMessage}`) : false;
                                    const brightness = messageData.settings.brightness;
                                    const backlight = messageData.settings.backlight;
                                    const contrast = messageData.settings.contrast;
                                    const color = messageData.settings.color;
                                    const pictureMode = 3;

                                    if (brightness != this.brightness || backlight != this.backlight || contrast != this.contrast || color != this.color || pictureMode != this.pictureMode) {
                                        this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode);
                                        const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Picture Settings', stringifyMessage) : false;
                                        this.brightness = brightness;
                                        this.backlight = backlight;
                                        this.contrast = contrast;
                                        this.color = color;
                                        this.pictureMode = pictureMode;
                                    };

                                };
                            };
                        } else {
                            const debug = this.debugLog ? this.emit('debug', `Received non UTF-8 data: ${message}`) : false;
                        };
                    })
                    .on('close', () => {
                        const debug = this.debugLog ? this.emit('debug', `Connection to TV closed.`) : false;
                        this.isConnected = false;
                        this.connection = {};
                        this.emit('powerState', false, false, false, false);
                        this.emit('audioState', 0, true, '');
                        this.emit('disconnect', 'Disconnected.');

                        setTimeout(() => {
                            this.client.connect(this.url);
                        }, 5000);
                    }).on('error', (error) => {
                        this.emit('error', `Connect to TV error: ${error}`);
                    })
                this.isConnected = true;
                this.register();
            })
            .on('connectFailed', (error) => {
                const debug = this.debugLog ? this.emit('debug', `Connect to TV Failed: ${error}`) : false;
                this.isConnected = false;
                this.connection = {};
                this.emit('powerState', false, false, false, false);
                this.emit('audioState', 0, true, '');

                setTimeout(() => {
                    this.client.connect(this.url);
                }, 5000);
            });

        this.client.connect(this.url);
    };

    async register() {
        try {
            const savedPairingKey = await fsPromises.readFile(this.keyFile);
            const pairingKey = savedPairingKey.toString();
            this.savedPairingKey = pairingKey;

            pairing['client-key'] = pairingKey;
            this.registerId = await this.send('register', undefined, pairing);
        } catch (error) {
            this.emit('error', `Register error: ${error}`);
        };
    };

    getSocket() {
        return new Promise(async (resolve, reject) => {
            try {
                this.socketId = await this.send('request', API_URL.SocketUrl);
                resolve(true);
            } catch (error) {
                this.emit('error', `Get socket error: ${error}`);
                reject(error);
            };
        });
    };

    subscribeData() {
        return new Promise(async (resolve, reject) => {
            try {
                //System Info
                this.systemInfoId = await this.send('request', API_URL.GetSystemInfo);;

                //Software Info
                this.softwareInfoId = await this.send('request', API_URL.GetSoftwareInfo);

                //Installed Apps
                this.installedAppsId = await this.send('request', API_URL.GetInstalledApps);

                //Channels list
                this.channelsId = await this.send('request', API_URL.GetChannelList);

                //Power State
                this.powerStateId = await this.send('subscribe', API_URL.GetPowerState);

                //Audio State
                this.audioStateId = await this.send('subscribe', API_URL.GetAudioStatus);

                //Current App
                this.currentAppId = await this.send('subscribe', API_URL.GetForegroundAppInfo);

                //Current Channel
                this.currentChannelId = await this.send('subscribe', API_URL.GetCurrentChannel);

                //Picture Settings
                if (this.webOS >= 4) {
                    const payload = {
                        category: 'picture',
                        keys: ['brightness', 'backlight', 'contrast', 'color']
                    }
                    this.pictureSettingsId = await this.send('subscribe', API_URL.GetSystemSettings, payload);
                };

                resolve(true);
            } catch (error) {
                this.emit('error', `Subscriebe error: ${error}`);
                reject(error);
            };
        });
    };

    send(type, uri, payload) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject({
                    status: 'Device not connected!',
                });
                return;
            };

            const cid = this.getCid();
            payload = (payload == undefined) ? {} : payload;
            const json = JSON.stringify({
                id: cid,
                type: type,
                uri: uri,
                payload: payload
            });

            resolve(cid);
            this.connection.send(json);
        });
    };

    getCid() {
        let cidCount = 0;
        let cidPrefix = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8);
        return cidPrefix + (`000${(cidCount++).toString(16)}`).slice(-4);
    };

    reconnectSocket() {
        if (this.isConnected && !this.inputSocket) {
            setTimeout(() => {
                this.getSocket();
            }, 6000);
        };
    };
};
module.exports = LGTV;