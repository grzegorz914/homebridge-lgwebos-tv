'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const WebSocket = require('ws');
const WebSocketSpecialized = require('./lgwebsocketspecialized');
const CONSTANS = require('./constans.json');

class LGTV extends EventEmitter {
    constructor(config) {
        super();
        const url = config.url;
        const keyFile = config.keyFile;
        const debugLog = config.debugLog;
        const mqttEnabled = config.mqttEnabled;
        const sslWebSocket = config.sslWebSocket;
        const savedKey = fs.readFileSync(keyFile);

        this.savedPairingKey = savedKey.toString();
        this.startPrepareAccessory = true;
        this.isConnected = false;
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

        this.firstRun = true;
        this.power = false;
        this.screenState = false;
        this.pixelRefresh = false;
        this.volume = 0;
        this.mute = false;
        this.audioOutput = '';
        this.tvScreenState = '';
        this.appId = '';
        this.channelId = '';

        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.pictureMode = 3;
        this.heartBeat = false;

        this.connect = () => {
            const clientUrl = sslWebSocket ? (url, { rejectUnauthorized: false }) : url;
            const client = new WebSocket(clientUrl);
            client.on('open', async () => {
                const debug = debugLog ? this.emit('debug', `WebSocket connection established.`) : false;
                this.websocketClient = client;
                this.isConnected = true;
                this.heartBeat = false;

                try {
                    CONSTANS.Pairing['client-key'] = this.savedPairingKey;
                    this.registerId = await this.send('register', undefined, CONSTANS.Pairing);
                } catch (error) {
                    this.emit('error', `Register error: ${error}`);
                };
            }).on('message', async (message) => {
                const debug = debugLog ? this.emit('debug', `Received message: ${message}`) : false;

                const parsedMessage = JSON.parse(message);
                const messageId = parsedMessage.id;
                const messageData = parsedMessage.payload;
                const messageType = parsedMessage.type;
                const returnValue = (messageData.returnValue === true);
                const stringifyMessage = JSON.stringify(messageData, null, 2);
                const debug1 = debugLog ? this.emit('debug', `Message Id: ${messageId}, Data: ${stringifyMessage}`) : false;

                if ((!messageId || !returnValue) && messageType !== 'registered') {
                    const debug = debugLog ? this.emit('debug', 'Message ID or Data unknown.') : false;
                    return;
                };

                switch (messageId) {
                    case this.registerId:
                        const debug = debugLog ? this.emit('debug', `Start pairing: ${stringifyMessage}`) : false;

                        const pairingKey = messageData['client-key'];
                        if (!pairingKey) {
                            this.emit('message', 'Please accept authorization on TV.');
                            return;
                        };

                        if (pairingKey !== this.savedPairingKey) {
                            try {
                                const writeKey = await fsPromises.writeFile(keyFile, pairingKey);
                                this.emit('message', 'Pairing key saved.')
                                this.savedPairingKey = pairingKey;
                            } catch (error) {
                                this.emit('error', `Pairing key saved error: ${error}`)
                            };
                        };

                        //Request specjalized socket and system info data
                        try {
                            this.socketId = await this.send('request', CONSTANS.ApiUrls.SocketUrl);
                            this.systemInfoId = await this.send('request', CONSTANS.ApiUrls.GetSystemInfo);
                        } catch (error) {
                            this.emit('error', `Request system info or socked error: ${error}`)
                        };
                        break;
                    case this.socketId:
                        const debug10 = debugLog ? this.emit('debug', `Socket Path: ${stringifyMessage}`) : false;

                        const socketPath = messageData.socketPath;
                        const specialClientUrl = sslWebSocket ? (socketPath, { rejectUnauthorized: false }) : socketPath;
                        const specialClient = new WebSocket(specialClientUrl);
                        specialClient.on('open', () => {
                            this.inputSocket = new WebSocketSpecialized(specialClient);
                            const debug2 = debugLog ? this.emit('debug', `Specialized socket connected.`) : false;
                        }).on('close', () => {
                            const debug1 = debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                            this.inputSocket = false;
                        }).on('error', (error) => {
                            this.emit('error', `Specialized socket special connection error: ${error}.`);
                        });
                        break;
                    case this.systemInfoId:
                        const debug1 = debugLog ? this.emit('debug', `System Info: ${stringifyMessage}`) : false;

                        this.modelName = messageData.modelName ? messageData.modelName : 'ModelName';
                        try {
                            const mqtt1 = mqttEnabled ? this.emit('mqtt', 'System Info', stringifyMessage) : false;
                            this.softwareInfoId = await this.send('request', CONSTANS.ApiUrls.GetSoftwareInfo);
                        } catch (error) {
                            this.emit('error', `Data error: ${error}`)
                        };
                        break;
                    case this.softwareInfoId:
                        const debug2 = debugLog ? this.emit('debug', `Software Info: ${stringifyMessage}`) : false;

                        const productName = messageData.product_name;
                        const serialNumber = messageData.device_id;
                        const firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                        const webOS = productName.slice(8, -2);

                        try {
                            this.channelsId = await this.send('subscribe', CONSTANS.ApiUrls.GetChannelList);
                            this.appsId = await this.send('subscribe', CONSTANS.ApiUrls.GetInstalledApps);
                            this.powerStateId = await this.send('subscribe', CONSTANS.ApiUrls.GetPowerState);
                            this.currentAppId = await this.send('subscribe', CONSTANS.ApiUrls.GetForegroundAppInfo);
                            this.audioStateId = await this.send('subscribe', CONSTANS.ApiUrls.GetAudioStatus);
                            this.currentChannelId = await this.send('subscribe', CONSTANS.ApiUrls.GetCurrentChannel);

                            if (webOS >= 4) {
                                const payload = {
                                    category: 'picture',
                                    keys: ['brightness', 'backlight', 'contrast', 'color']
                                }
                                this.pictureSettingsId = await this.send('subscribe', CONSTANS.ApiUrls.GetSystemSettings, payload);
                            };

                            this.emit('message', 'Connected.');
                            this.emit('deviceInfo', this.modelName, productName, serialNumber, firmwareRevision, webOS);
                            const mqtt2 = mqttEnabled ? this.emit('mqtt', 'Software Info', stringifyMessage) : false;
                            const prepareAccessory = this.startPrepareAccessory ? client.emit('prepareAccessory') : false;
                        } catch (error) {
                            this.emit('error', `Data error: ${error}`)
                        };
                        break;
                    case this.channelsId:
                        const debug3 = debugLog ? this.emit('debug', `Channels: ${stringifyMessage}`) : false;

                        const channelsList = messageData.channelList;
                        const channelsListCount = messageData.channelListCount;
                        if (channelsListCount === 0) {
                            return;
                        };

                        this.emit('channelList', channelsList);
                        const mqtt3 = mqttEnabled ? this.emit('mqtt', 'Channels', stringifyMessage) : false;
                        break;
                    case this.appsId:
                        const debug4 = debugLog ? this.emit('debug', `Apps: ${stringifyMessage}`) : false;

                        const apppsList = messageData.apps;
                        if (!apppsList || !messageData.returnValue) {
                            return;
                        };

                        this.emit('installedApps', apppsList);
                        const mqtt4 = mqttEnabled ? this.emit('mqtt', 'Apps', stringifyMessage) : false;
                        break;
                    case this.powerStateId:
                        const debug5 = debugLog ? this.emit('debug', `Power: ${stringifyMessage}`) : false;

                        let tvScreenState = messageData.state;
                        let power = false;
                        let screenState = false;
                        let pixelRefresh = false;
                        switch (tvScreenState) {
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
                            default:
                                power = false;
                                screenState = false;
                                pixelRefresh = false;
                        }
                        power = (this.webOS >= 3) ? (this.isConnected && power) : this.isConnected;

                        if (this.power === power && this.screenState === screenState && this.pixelRefresh === pixelRefresh && this.tvScreenState === tvScreenState) {
                            return;
                        };

                        this.power = power;
                        this.screenState = screenState;
                        this.pixelRefresh = pixelRefresh;
                        this.tvScreenState = tvScreenState;

                        this.emit('powerState', power, pixelRefresh, screenState, tvScreenState);
                        const updateAudioState = !power ? this.emit('audioState', this.volume, true, this.audioOutput) : false;
                        const updatePictureSettings = !power ? this.emit('pictureSettings', this.backlight, this.backlight, this.contrast, this.color, this.pictureMode, false) : false;
                        const mqtt5 = mqttEnabled ? this.emit('mqtt', 'Power', stringifyMessage) : false;
                        break;
                    case this.currentAppId:
                        const debug6 = debugLog ? this.emit('debug', `Current App: ${stringifyMessage}`) : false;
                        const appId = messageData.appId;
                        this.appId = appId;

                        this.emit('currentApp', appId);
                        const mqtt6 = mqttEnabled ? this.emit('mqtt', 'Current App', stringifyMessage) : false;
                        break;
                    case this.audioStateId:
                        const debug7 = debugLog ? this.emit('debug', `Audio: ${stringifyMessage}`) : false;
                        const volume = messageData.volume;
                        const mute = (messageData.mute === true);
                        const audioOutput = (this.webOS >= 5) ? messageData.volumeStatus.soundOutput : messageData.scenario;

                        this.volume = volume;
                        this.mute = mute;
                        this.audioOutput = audioOutput;
                        this.emit('audioState', volume, mute, audioOutput);
                        const mqtt7 = mqttEnabled ? this.emit('mqtt', 'Audio', stringifyMessage) : false;
                        break;
                    case this.currentChannelId:
                        const debug8 = debugLog ? this.emit('debug', `Current Channel: ${stringifyMessage}`) : false;
                        const channelId = messageData.channelId;
                        const channelName = messageData.channelName;
                        const channelNumber = messageData.channelNumber;

                        this.channelId = channelId;
                        this.emit('currentChannel', channelName, channelNumber, channelId);
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

                        this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode, this.power);
                        const mqtt9 = mqttEnabled ? this.emit('mqtt', 'Picture Settings', stringifyMessage) : false;
                        break;
                };

            }).on('prepareAccessory', async () => {
                const debug = debugLog ? this.emit('debug', `Start prepare accessory.`) : false;
                await new Promise(resolve => setTimeout(resolve, 3000));
                this.emit('prepareAccessory');
                this.startPrepareAccessory = false;
            }).on('close', () => {
                const debug = debugLog ? this.emit('debug', `Socked closed.`) : false;

                if (!this.heartBeat) {
                    this.isConnected = false;
                    this.power = false;
                    this.screenState = false;
                    this.pixelRefresh = false;
                    this.emit('powerState', false, false, false, this.tvScreenState);
                    this.emit('audioState', this.volume, true, this.audioOutput);
                    this.emit('pictureSettings', this.backlight, this.backlight, this.contrast, this.color, this.pictureMode, false)
                    this.emit('message', 'Disconnected.');
                    this.heartBeat = true;
                }

                this.reconnect();
            }).on('error', (error) => {
                const debug8 = debugLog ? this.heartBeat ? this.emit('debug', `Socket send heart beat`) : this.emit('debug', `Socket connect error: ${error}`) : false;

                //Prepare accessory
                if (!this.savedPairingKey.length === 0 || !this.startPrepareAccessory) {
                    return;
                };

                this.emit('prepareAccessory');
                this.startPrepareAccessory = false;
            });
        }

        this.connect();
    };

    async reconnect() {
        await new Promise(resolve => setTimeout(resolve, 5000));
        this.connect();
    };

    send(type, uri, payload) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject({
                    status: 'TV not connected!',
                });
                return;
            };

            let cidCount = 0;
            const cid = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8) + (`000${(cidCount++).toString(16)}`).slice(-4);
            const json = JSON.stringify({
                id: cid,
                type: type,
                uri: uri,
                payload: payload
            });

            resolve(cid);
            this.websocketClient.send(json);
        });
    };
};
module.exports = LGTV;