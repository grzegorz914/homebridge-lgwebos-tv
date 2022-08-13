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

        this.power = false;
        this.screenState = false;

        this.client = new WebSocketClient(SOCKET_OPTIONS);
        this.client.on('connect', async (connection) => {
                const debug = this.debugLog ? this.emit('debug', 'Socket connected.') : false;
                this.connection = connection;

                this.connection.on('message', async (message) => {
                        if (message.type !== 'utf8') {
                            const debug = this.debugLog ? this.emit('debug', `Received non UTF-8 data: ${message}`) : false;
                            return;
                        };

                        const messageUtf8Data = message.utf8Data;
                        const parsedMessage = messageUtf8Data ? JSON.parse(messageUtf8Data) : this.debugLog ? this.emit('debug', `Not UTF-8 data received: ${messageUtf8Data}`) : false;
                        const messageId = parsedMessage.id;
                        const messageData = parsedMessage.payload;
                        const stringifyMessage = JSON.stringify(messageData, null, 2);
                        const debug = this.debugLog ? this.emit('debug', `Message Id: ${messageId}, data: ${stringifyMessage}`) : false;

                        switch (messageId) {
                            case this.registerId:
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
                                        //Request data
                                        this.systemInfoId = await this.send('request', API_URL.GetSystemInfo);
                                        this.softwareInfoId = await this.send('request', API_URL.GetSoftwareInfo);
                                        this.installedAppsId = await this.send('request', API_URL.GetInstalledApps);
                                        this.channelsId = await this.send('request', API_URL.GetChannelList);

                                        //Subscribe data
                                        this.powerStateId = await this.send('subscribe', API_URL.GetPowerState);
                                        this.audioStateId = await this.send('subscribe', API_URL.GetAudioStatus);
                                        this.currentAppId = await this.send('subscribe', API_URL.GetForegroundAppInfo);
                                        this.currentChannelId = await this.send('subscribe', API_URL.GetCurrentChannel);

                                        if (this.webOS >= 4) {
                                            const payload = {
                                                category: 'picture',
                                                keys: ['brightness', 'backlight', 'contrast', 'color']
                                            }
                                            this.pictureSettingsId = await this.send('subscribe', API_URL.GetSystemSettings, payload);
                                        };

                                        //Specialized Socket
                                        this.socketId = await this.send('request', API_URL.SocketUrl);
                                    } catch (error) {
                                        this.emit('error', `Data error: ${error}`)
                                    };
                                } else {
                                    this.emit('message', 'Waiting on authorization accept...');
                                };
                                break;
                            case this.systemInfoId:
                                const debug1 = this.debugLog ? this.emit('debug', `System info: ${stringifyMessage}`) : false;
                                this.modelName = (messageData.modelName != undefined) ? messageData.modelName : 'ModelName';
                                const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'System Info', stringifyMessage) : false;
                                break;
                            case this.softwareInfoId:
                                const debug2 = this.debugLog ? this.emit('debug', `Software info: ${stringifyMessage}`) : false;
                                const productName = messageData.product_name;
                                const serialNumber = messageData.device_id;
                                const firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                                this.webOS = (messageData.product_name != undefined) ? messageData.product_name.slice(8, -2) : 2;


                                this.emit('deviceInfo', this.modelName, productName, serialNumber, firmwareRevision, this.webOS);
                                const mqtt2 = this.mqttEnabled ? this.emit('mqtt', 'Software Info', stringifyMessage) : false;
                                break;
                            case this.installedAppsId:
                                const debug3 = this.debugLog ? this.emit('debug', `Apps List ${stringifyMessage}`) : false;
                                if (messageData.apps != undefined) {
                                    this.emit('installedApps', messageData.apps);
                                    const mqtt3 = this.mqttEnabled ? this.emit('mqtt', 'Apps List', stringifyMessage) : false;
                                };
                                break;
                            case this.channelsId:
                                const debug4 = this.debugLog ? this.emit('debug', `Channel List ${stringifyMessage}`) : false;
                                if (messageData.channelList != undefined) {
                                    this.emit('channelList', messageData.channelList);
                                    const mqtt4 = this.mqttEnabled ? this.emit('mqtt', 'Channel List', stringifyMessage) : false;
                                };
                                break;
                            case this.powerStateId:
                                const debug5 = this.debugLog ? this.emit('debug', `Power State: ${stringifyMessage}`) : false;

                                let power = false;
                                let screenState = true;
                                let pixelRefresh = false;
                                switch (messageData.state) {
                                    case 'Active':
                                        power = true;
                                        break;
                                    case 'Active Standby':
                                        power = false;
                                        pixelRefresh = true;
                                        break;
                                    case 'Screen Saver':
                                        power = true;
                                        break;
                                    case 'Screen Off':
                                        power = true;
                                        screenState = (messageData.processing == 'Screen On')
                                        break;
                                    case 'Suspend':
                                        power = false;
                                        break;
                                }
                                power = (this.webOS >= 3) ? (this.isConnected && power) : this.isConnected;
                                screenState = power ? screenState : false;

                                if (power != this.power || screenState != this.screenState) {
                                    this.power = power;
                                    this.screenState = screenState;

                                    this.emit('powerState', power, pixelRefresh, screenState);
                                    const updateAudioState = !power ? this.emit('audioState', 0, true, '') : false;
                                    const updatePictureSettings = !power ? this.emit('pictureSettings', 0, 0, 0, 0, 0, false) : false;
                                    const mqtt5 = this.mqttEnabled ? this.emit('mqtt', 'Power State', stringifyMessage) : false;
                                }
                                break;
                            case this.audioStateId:
                                const debug6 = this.debugLog ? this.emit('debug', `Audio State: ${stringifyMessage}`) : false;
                                const volume = messageData.volume;
                                const mute = (messageData.mute == true);
                                const audioOutput = (this.webOS >= 5) ? messageData.volumeStatus.soundOutput : messageData.scenario;

                                this.emit('audioState', volume, mute, audioOutput);
                                const mqtt6 = this.mqttEnabled ? this.emit('mqtt', 'Audio State', stringifyMessage) : false;
                                break;
                            case this.currentAppId:
                                const debug7 = this.debugLog ? this.emit('debug', `Current App: ${stringifyMessage}`) : false;
                                const appId = messageData.appId;

                                this.emit('currentApp', appId);
                                const mqtt7 = this.mqttEnabled ? this.emit('mqtt', 'Current App', stringifyMessage) : false;
                                break;
                            case this.currentChannelId:
                                const debug8 = this.debugLog ? this.emit('debug', `Current Channel: ${stringifyMessage}`) : false;
                                const channelId = messageData.channelId;
                                const channelName = messageData.channelName;
                                const channelNumber = messageData.channelNumber;

                                this.emit('currentChannel', channelName, channelNumber, channelId);
                                const mqtt8 = this.mqttEnabled ? this.emit('mqtt', 'Current Channel', stringifyMessage) : false;
                                break;
                            case this.pictureSettingsId:
                                const debug9 = this.debugLog ? this.emit('debug', `Picture Settings: ${stringifyMessage}`) : false;
                                const brightness = messageData.settings.brightness;
                                const backlight = messageData.settings.backlight;
                                const contrast = messageData.settings.contrast;
                                const color = messageData.settings.color;
                                const pictureMode = 3;

                                this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode, this.power);
                                const mqtt9 = this.mqttEnabled ? this.emit('mqtt', 'Picture Settings', stringifyMessage) : false;
                                break;
                            case this.socketId:
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
                                break;
                        };
                    })
                    .on('close', () => {
                        const debug = this.debugLog ? this.emit('debug', `Socked closed.`) : false;
                        this.isConnected = false;
                        this.connection = {};
                        this.power = false;
                        this.screenState = false;
                        this.emit('powerState', false, false, false, false);
                        this.emit('audioState', 0, true, '');
                        this.emit('pictureSettings', 0, 0, 0, 0, 0, false);

                        setTimeout(() => {
                            this.client.connect(this.url);
                        }, 5000);
                    })
                    .on('error', (error) => {
                        this.emit('error', `Socket communication error: ${error}`);
                    });

                this.isConnected = true;
                try {
                    const savedPairingKey = await fsPromises.readFile(this.keyFile);
                    const pairingKey = savedPairingKey.toString();
                    this.savedPairingKey = pairingKey;

                    pairing['client-key'] = pairingKey;
                    this.registerId = await this.send('register', undefined, pairing);
                } catch (error) {
                    this.emit('error', `Register error: ${error}`);
                };
            })
            .on('connectFailed', (error) => {
                const debug = this.debugLog ? this.emit('debug', `Socked connect error: ${error}`) : false;
                this.isConnected = false;
                this.connection = {};
                this.power = false;
                this.screenState = false;
                this.emit('powerState', false, false, false, false);
                this.emit('audioState', 0, true, '');
                this.emit('pictureSettings', 0, 0, 0, 0, 0, false);

                setTimeout(() => {
                    this.client.connect(this.url);
                }, 5000);
            });

        this.client.connect(this.url);
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

    reconnectSocket() {
        if (this.isConnected && !this.inputSocket) {
            setTimeout(() => {
                this.getSocket();
            }, 6000);
        };
    };
};
module.exports = LGTV;