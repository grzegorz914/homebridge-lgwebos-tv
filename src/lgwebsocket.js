'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const WebSocket = require('websocket').client;
const WebSocketSpecialized = require('./lgwebsocketspecialized');
const pairing = require('./pairing.json');
const API_URL = require('./apiurl.json');

const SOCKET_OPTIONS = {
    keepalive: true,
    keepaliveInterval: 5000,
    keepaliveGracePeriod: 3000,
    dropConnectionOnKeepaliveTimeout: true
};

class LGTV extends EventEmitter {
    constructor(config) {
        super();
        this.url = config.url;
        const keyFile = config.keyFile;
        const debugLog = config.debugLog;
        const mqttEnabled = config.enableMqtt;
        const savedKey = fs.readFileSync(keyFile);

        this.savedPairingKey = savedKey.toString();
        this.startPrepareAccessory = true;
        this.isConnected = false;
        this.connection = {};
        this.specializedSockets = {};
        this.inputSocket = false;

        this.registerId = '';
        this.socketId = '';
        this.systemInfoId = '';
        this.softwareInfoId = '';
        this.installedAppsId = '';
        this.channelsId = '';
        this.powerStateId = '';
        this.audioStateId = '';
        this.currentAppId = '';
        this.currentChannelId = '';
        this.pictureSettingsId = '';

        this.webOS = 2;
        this.power = false;
        this.screenState = false;
        this.pixelRefresh = false;
        this.volume = 0;
        this.audioOutput = '';

        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.pictureMode = 3;

        const client = new WebSocket(SOCKET_OPTIONS);
        client.on('connect', async (connection) => {
                const debug = debugLog ? this.emit('debug', 'Socket connected.') : false;
                this.connection = connection;
                this.isConnected = true;

                this.connection.on('message', async (message) => {
                        if (message.type !== 'utf8') {
                            const debug = debugLog ? this.emit('debug', `Non UTF-8 message: ${message}`) : false;
                            return;
                        };

                        const parsedMessage = JSON.parse(message.utf8Data);
                        const messageId = parsedMessage.id;
                        const messageData = parsedMessage.payload;
                        const stringifyMessage = JSON.stringify(messageData, null, 2);
                        const debug = debugLog ? this.emit('debug', `Message Id: ${messageId}, Data: ${stringifyMessage}`) : false;

                        switch (messageId) {
                            case this.registerId:
                                const pairingKey = messageData['client-key'];
                                if (pairingKey) {
                                    if (pairingKey != this.savedPairingKey) {
                                        try {
                                            const writeKey = await fsPromises.writeFile(keyFile, pairingKey);
                                            this.emit('message', 'Pairing key saved.')
                                            this.savedPairingKey = pairingKey;
                                        } catch (error) {
                                            this.emit('error', `Pairing key saved error: ${error}`)
                                        };
                                    };

                                    try {
                                        //Request data
                                        this.systemInfoId = await this.send('request', API_URL.GetSystemInfo);

                                        setTimeout(async () => {
                                            this.softwareInfoId = await this.send('request', API_URL.GetSoftwareInfo);
                                        }, 35);

                                        //Subscribe data
                                        setTimeout(async () => {
                                            this.channelsId = await this.send('subscribe', API_URL.GetChannelList);
                                            this.appsId = await this.send('subscribe', API_URL.GetInstalledApps);
                                            this.powerStateId = await this.send('subscribe', API_URL.GetPowerState);
                                            this.currentAppId = await this.send('subscribe', API_URL.GetForegroundAppInfo);
                                            this.audioStateId = await this.send('subscribe', API_URL.GetAudioStatus);
                                            this.currentChannelId = await this.send('subscribe', API_URL.GetCurrentChannel);

                                            if (this.webOS >= 4) {
                                                const payload = {
                                                    category: 'picture',
                                                    keys: ['brightness', 'backlight', 'contrast', 'color']
                                                }
                                                this.pictureSettingsId = await this.send('subscribe', API_URL.GetSystemSettings, payload);
                                            };
                                        }, 100);

                                        //Prepare accessory
                                        setTimeout(async () => {
                                            if (this.savedPairingKey.length > 0 && this.startPrepareAccessory) {
                                                this.emit('prepareAccessory');
                                                this.startPrepareAccessory = false;
                                            };
                                        }, 150);

                                        //Request socket
                                        setTimeout(async () => {
                                            this.socketId = await this.send('request', API_URL.SocketUrl);
                                        }, 250);
                                    } catch (error) {
                                        this.emit('error', `Data error: ${error}`)
                                    };
                                } else {
                                    this.emit('message', 'Please accept authorization on TV.');
                                };
                                break;
                            case this.systemInfoId:
                                const debug1 = debugLog ? this.emit('debug', `System Info: ${stringifyMessage}`) : false;
                                this.modelName = (messageData.returnValue == true) ? messageData.modelName : 'ModelName';
                                const mqtt1 = mqttEnabled ? this.emit('mqtt', 'System Info', stringifyMessage) : false;
                                break;
                            case this.softwareInfoId:
                                const debug2 = debugLog ? this.emit('debug', `Software Info: ${stringifyMessage}`) : false;
                                const productName = messageData.product_name;
                                const serialNumber = messageData.device_id;
                                const firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                                this.webOS = messageData.product_name.slice(8, -2);

                                const emi2 = (messageData.returnValue == true) ? this.emit('deviceInfo', this.modelName, productName, serialNumber, firmwareRevision, this.webOS) : false;
                                const mqtt2 = mqttEnabled ? this.emit('mqtt', 'Software Info', stringifyMessage) : false;
                                break;
                            case this.channelsId:
                                const debug3 = debugLog ? this.emit('debug', `Channel List ${stringifyMessage}`) : false;
                                const emit3 = (messageData.returnValue == true) ? this.emit('channelList', messageData.channelList) : false;
                                const mqtt3 = mqttEnabled ? this.emit('mqtt', 'Channel List', stringifyMessage) : false;
                                break;
                            case this.appsId:
                                const debug4 = debugLog ? this.emit('debug', `Apps List ${stringifyMessage}`) : false;
                                const emit4 = (messageData.returnValue == true) ? this.emit('installedApps', messageData.apps) : false;
                                const mqtt4 = mqttEnabled ? this.emit('mqtt', 'Apps List', stringifyMessage) : false;
                                break;
                            case this.powerStateId:
                                const debug5 = debugLog ? this.emit('debug', `Power State: ${stringifyMessage}`) : false;

                                let power = false;
                                let screenState = false;
                                let pixelRefresh = false;
                                switch (messageData.state) {
                                    case 'Active':
                                        power = true;
                                        screenState = true;
                                        pixelRefresh = false;
                                        break;
                                    case 'Active Standby':
                                        power = false;
                                        screenState = false;
                                        pixelRefresh = true;
                                        break;
                                    case 'Screen Saver':
                                        power = true;
                                        screenState = true;
                                        pixelRefresh = false;
                                        break;
                                    case 'Screen Off':
                                        power = true;
                                        screenState = false;
                                        pixelRefresh = false;
                                        break;
                                    case 'Suspend':
                                        power = false;
                                        screenState = false;
                                        pixelRefresh = false;
                                        break;
                                }
                                power = (this.webOS >= 3) ? (this.isConnected && power) : this.isConnected;

                                if (this.power != power || this.screenState != screenState || this.pixelRefresh != pixelRefresh) {
                                    this.power = power;
                                    this.screenState = screenState;
                                    this.pixelRefresh = pixelRefresh;

                                    const emit5 = (messageData.returnValue == true) ? this.emit('powerState', power, pixelRefresh, screenState) : false;
                                    const updateAudioState = (messageData.returnValue == true && !power) ? this.emit('audioState', this.volume, true, this.audioOutput) : false;
                                    const updatePictureSettings = (messageData.returnValue == true && !power) ? this.emit('pictureSettings', this.backlight, this.backlight, this.contrast, this.color, this.pictureMode, false) : false;
                                    const mqtt5 = mqttEnabled ? this.emit('mqtt', 'Power State', stringifyMessage) : false;
                                }
                                break;
                            case this.currentAppId:
                                const debug6 = debugLog ? this.emit('debug', `Current App: ${stringifyMessage}`) : false;
                                const appId = messageData.appId;

                                const emit6 = (messageData.returnValue == true) ? this.emit('currentApp', appId) : false;
                                const mqtt6 = mqttEnabled ? this.emit('mqtt', 'Current App', stringifyMessage) : false;
                                break;
                            case this.audioStateId:
                                const debug7 = debugLog ? this.emit('debug', `Audio State: ${stringifyMessage}`) : false;
                                const volume = messageData.volume;
                                const mute = (messageData.mute == true);
                                const audioOutput = (this.webOS >= 5) ? messageData.volumeStatus.soundOutput : messageData.scenario;
                                this.volume = volume;
                                this.audioOutput = audioOutput;

                                const emit7 = (messageData.returnValue == true) ? this.emit('audioState', volume, mute, audioOutput) : false;
                                const mqtt7 = mqttEnabled ? this.emit('mqtt', 'Audio State', stringifyMessage) : false;
                                break;
                            case this.currentChannelId:
                                const debug8 = debugLog ? this.emit('debug', `Current Channel: ${stringifyMessage}`) : false;
                                const channelId = messageData.channelId;
                                const channelName = messageData.channelName;
                                const channelNumber = messageData.channelNumber;

                                const emit8 = (messageData.returnValue == true) ? this.emit('currentChannel', channelName, channelNumber, channelId) : false;
                                const mqtt8 = mqttEnabled ? this.emit('mqtt', 'Current Channel', stringifyMessage) : false;
                                break;
                            case this.pictureSettingsId:
                                const debug9 = debugLog ? this.emit('debug', `Picture Settings: ${stringifyMessage}`) : false;
                                const brightness = messageData.settings.brightness;
                                const backlight = messageData.settings.backlight;
                                const contrast = messageData.settings.contrast;
                                const color = messageData.settings.color;
                                const pictureMode = 3;

                                this.brightness = brightness;
                                this.backlight = backlight;
                                this.contrast = contrast;
                                this.color = color;
                                this.pictureMode = pictureMode;

                                const emit9 = (messageData.returnValue == true) ? this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode, this.power) : false;
                                const mqtt9 = mqttEnabled ? this.emit('mqtt', 'Picture Settings', stringifyMessage) : false;
                                break;
                            case this.socketId:
                                const debug10 = debugLog ? this.emit('debug', `Socket Path: ${stringifyMessage}`) : false;
                                if (this.specializedSockets[API_URL.SocketUrl]) {
                                    this.inputSocket = this.specializedSockets[API_URL.SocketUrl];
                                    return;
                                };

                                const socketPath = messageData.socketPath;
                                const specialClient = new WebSocket(SOCKET_OPTIONS);
                                specialClient.on('connect', (specialConnection) => {
                                        specialConnection.on('close', () => {
                                                const debug1 = debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                                                delete this.specializedSockets[API_URL.SocketUrl];
                                                this.inputSocket = false;
                                            })
                                            .on('error', (error) => {
                                                this.emit('error', `Specialized socket connection error: ${error}, reconnect in 6s.`);
                                                specialClient.close();
                                            });

                                        this.specializedSockets[API_URL.SocketUrl] = new WebSocketSpecialized(specialConnection);
                                        this.inputSocket = this.specializedSockets[API_URL.SocketUrl];
                                        const debug2 = debugLog ? this.emit('debug', `Specialized socket connected, Input Socket: ${JSON.stringify(this.inputSocket, null, 2)}`) : false;
                                    })
                                    .on('connectFailed', (error) => {
                                        this.emit('error', `Specialized socket connect error: ${error}, reconnect in 6s.`);
                                        delete this.specializedSockets[API_URL.SocketUrl];
                                        this.inputSocket = false;

                                        setTimeout(() => {
                                            const reconnect = this.isConnected ? specialClient.connect(socketPath) : false;
                                        }, 6000);
                                    });

                                specialClient.connect(socketPath);
                                break;
                        };
                    })
                    .on('close', () => {
                        const debug = debugLog ? this.emit('debug', `Socked closed.`) : false;
                        this.isConnected = false;
                        this.power = false;
                        this.screenState = false;
                        this.pixelRefresh = false;
                        this.emit('powerState', false, false, false);
                        this.emit('audioState', this.volume, true, this.audioOutput);
                        this.emit('pictureSettings', this.backlight, this.backlight, this.contrast, this.color, this.pictureMode, false)

                        setTimeout(() => {
                            client.connect(this.url);
                        }, 5000);
                    })
                    .on('error', (error) => {
                        this.emit('error', `Socket connection error: ${error}`);
                        client.close();
                    });

                try {
                    pairing['client-key'] = this.savedPairingKey;
                    this.registerId = await this.send('register', undefined, pairing);
                } catch (error) {
                    this.emit('error', `Register error: ${error}`);
                };
            })
            .on('connectFailed', (error) => {
                const debug = debugLog ? this.emit('debug', `Socked connect error: ${error}, reconnect in 5s.`) : false;
                this.isConnected = false;
                this.power = false;
                this.screenState = false;
                this.pixelRefresh = false;
                this.emit('powerState', false, false, false);
                this.emit('audioState', this.volume, true, this.audioOutput);
                this.emit('pictureSettings', this.backlight, this.backlight, this.contrast, this.color, this.pictureMode, false)

                if (this.savedPairingKey.length > 0 && this.startPrepareAccessory) {
                    this.emit('prepareAccessory');
                    this.startPrepareAccessory = false;
                };

                setTimeout(() => {
                    client.connect(this.url);
                }, 5000);
            });

        client.connect(this.url);
    };

    send(type, uri, payload) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject({
                    status: 'TV not connected!',
                });
                return;
            };

            const cid = this.getCid();
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
        const cidPrefix = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8);
        return cidPrefix + (`000${(cidCount++).toString(16)}`).slice(-4);
    };
};
module.exports = LGTV;