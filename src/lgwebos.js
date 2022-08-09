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
        this.data = {};

        this.webOs = 2;
        this.power = false;
        this.screenState = false;
        this.volume = 0;
        this.mute = true;
        this.audioOutput = '';
        this.appId = '';
        this.channelName = '';
        this.channelNumber = 0;
        this.channelReference = '';

        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.pictureMode = '';

        this.client = new WebSocketClient(SOCKET_OPTIONS);
        this.client.on('connect', (connection) => {
                const debug = this.debugLog ? this.emit('debug', 'Socket connected.') : false;
                this.connection = connection;

                this.connection.on('message', (message) => {
                        if (message.type === 'utf8') {
                            const messageUtf8Data = message.utf8Data;
                            const parsedMessage = messageUtf8Data ? JSON.parse(messageUtf8Data) : this.debugLog ? this.emit('debug', `Not received UTF-8 data: ${messageUtf8Data}`) : false;

                            if (parsedMessage.payload && this.data[parsedMessage.id]) {
                                this.data[parsedMessage.id](parsedMessage.payload);
                                const debug = this.debugLog ? this.emit('debug', `Socket message Id: ${parsedMessage.id}, data: ${JSON.stringify(parsedMessage.payload, null, 2)}`) : false;
                            };
                        } else {
                            const debug = this.debugLog ? this.emit('debug', `Received non UTF-8 data: ${message}`) : false;
                        };
                    })
                    .on('close', () => {
                        const debug = this.debugLog ? this.emit('debug', `Connection to TV closed.`) : false;
                        this.isConnected = false;
                        this.connection = {};
                        this.data = {};
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
                this.data = {};
                this.emit('powerState', false, false, false, false);
                this.emit('audioState', 0, true, '');

                setTimeout(() => {
                    this.client.connect(this.url);
                }, 5000);
            });
        this.client.connect(this.url);
    };

    async register() {
        const savedPairingKey = (fs.readFileSync(this.keyFile).toString() != undefined) ? fs.readFileSync(this.keyFile).toString() : undefined;
        pairing['client-key'] = savedPairingKey;

        try {
            const data = await this.send('register', undefined, pairing);
            const pairingKey = data['client-key'];
            if (pairingKey) {
                if (savedPairingKey !== pairingKey) {
                    try {
                        const writeKey = await fsPromises.writeFile(this.keyFile, pairingKey);
                        this.emit('message', 'Pairing key saved.')
                    } catch (error) {
                        this.emit('error', `Pairing key saved error: ${error}`)
                    };
                };

                try {
                    await this.getSocket();
                    await this.requestData();
                    await this.subscribeData();
                } catch (error) {
                    this.emit('error', `Data error: ${error}`)
                };
            } else {
                this.emit('message', 'Waiting on authorization accept...');
            };
        } catch (error) {
            this.emit('error', `Register error: ${error}`);
        };
    };

    getSocket() {
        return new Promise(async (resolve, reject) => {
            if (this.specializedSockets[API_URL.SocketUrl]) {
                this.inputSocket = this.specializedSockets[API_URL.SocketUrl];
            };

            try {
                const data = await this.send('request', API_URL.SocketUrl);
                const debug = this.debugLog ? this.emit('debug', `Specialized socket URL: ${JSON.stringify(data, null, 2)}`) : false;

                const specialClient = new WebSocketClient(SOCKET_OPTIONS);
                specialClient.on('connect', (connection) => {
                        connection.on('close', () => {
                                const debug1 = this.debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                                delete this.specializedSockets[API_URL.SocketUrl];
                                this.inputSocket = {};
                                this.reconnectSocket();
                            })
                            .on('error', (error) => {
                                this.emit('error', `Specialized socket error: ${error}`);
                                reject(error);
                            });

                        const debug2 = this.debugLog ? this.emit('debug', 'Specialized socket connected.') : false;
                        this.specializedSockets[API_URL.SocketUrl] = new SpecializedSocket(connection);
                        this.inputSocket = this.specializedSockets[API_URL.SocketUrl];
                    })
                    .on('connectFailed', (error) => {
                        this.emit('error', `Specialized socket connect failed: ${error}`);
                        this.reconnectSocket();
                        reject(error);
                    });

                const socketPath = data.socketPath;
                specialClient.connect(socketPath);
                resolve(true);
            } catch (error) {
                this.emit('error', `Send request error: ${error}`);
                reject(error);
            };
        });
    };

    requestData() {
        return new Promise(async (resolve, reject) => {
            try {
                //System Info
                const systemInfoData = await this.send('request', API_URL.GetSystemInfo);
                const debug = this.debugLog ? this.emit('debug', `System info: ${JSON.stringify(systemInfoData, null, 2)}`) : false;
                const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Info', JSON.stringify(systemInfoData, null, 2)) : false;
                const modelName = systemInfoData.modelName;

                //Software Info
                const softwareInfoData = await this.send('request', API_URL.GetSoftwareInfo);
                const debug1 = this.debugLog ? this.emit('debug', `Software info: ${JSON.stringify(softwareInfoData, null, 2)}`) : false;
                const productName = softwareInfoData.product_name;
                const serialNumber = softwareInfoData.device_id;
                const firmwareRevision = `${softwareInfoData.major_ver}.${softwareInfoData.minor_ver}`;
                const webOS = (softwareInfoData.product_name != undefined) ? softwareInfoData.product_name.slice(8, -2) : 3;
                this.webOs = webOS;

                this.emit('connect', 'Connected.');
                this.emit('deviceInfo', modelName, productName, serialNumber, firmwareRevision, webOS);
                const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'Info 1', JSON.stringify(softwareInfoData, null, 2)) : false;

                //Installed Apps
                const installedAppsData = await this.send('request', API_URL.GetInstalledApps);
                const debug2 = this.debugLog ? this.emit('debug', `Apps List ${JSON.stringify(installedAppsData, null, 2)}`) : false;
                if (installedAppsData.apps != undefined) {
                    this.emit('installedApps', installedAppsData.apps);
                    const mqtt2 = this.mqttEnabled ? this.emit('mqtt', 'Apps List', JSON.stringify(installedAppsData.apps, null, 2)) : false;
                }

                //Channels list
                const channelsListData = await this.send('request', API_URL.GetChannelList);
                const debug3 = this.debugLog ? this.emit('debug', `Channel List ${JSON.stringify(channelsListData, null, 2)}`) : false;
                if (channelsListData.channelList != undefined) {
                    this.emit('channelList', channelsListData.channelList);
                    const mqtt3 = this.mqttEnabled ? this.emit('mqtt', 'Channel List', JSON.stringify(channelsListData.channelList, null, 2)) : false;
                }
                resolve(true);
            } catch (error) {
                this.emit('error', `Request data error: ${error}`);
                reject(error);
            };
        });
    };

    subscribeData() {
        return new Promise(async (resolve, reject) => {
            try {
                //Power State
                const powerStateData = await this.send('subscribe', API_URL.GetPowerState);
                const debug = this.debugLog ? this.emit('debug', `Power State ${JSON.stringify(powerStateData, null, 2)}`) : false;

                //screen On
                const prepareScreenOn = ((powerStateData.state == 'Suspend' && powerStateData.processing == 'Screen On') || (powerStateData.state == 'Screen Saver' && powerStateData.processing == 'Screen On') || (powerStateData.state == 'Active Standby' && powerStateData.processing == 'Screen On'));
                const stillScreenOn = (powerStateData.state == 'Active' && powerStateData.processing == 'Screen On');
                const powerOnScreenOff = (powerStateData.state == 'Screen Off' || (powerStateData.state == 'Screen Off' && powerStateData.processing == 'Screen On'));
                const screenOn = (powerStateData.state == 'Active');

                //screen Saver
                const prepareScreenSaver = (powerStateData.state == 'Active' && powerStateData.processing == 'Request Screen Saver');
                const screenSaver = (powerStateData.state == 'Screen Saver');

                //screen Off
                const prepareScreenOff = ((powerStateData.state == 'Active' && powerStateData.processing == 'Request Power Off') || (powerStateData.state == 'Active' && powerStateData.processing == 'Request Suspend') || (powerStateData.state == 'Active' && powerStateData.processing == 'Prepare Suspend') ||
                        (powerStateData.state == 'Screen Saver' && powerStateData.processing == 'Request Power Off') || (powerStateData.state == 'Screen Saver' && powerStateData.processing == 'Request Suspend') || (powerStateData.state == 'Screen Saver' && powerStateData.processing == 'Prepare Suspend')) ||
                    (powerStateData.state == 'Active Standby' && powerStateData.processing == 'Request Power Off') || (powerStateData.state == 'Active Standby' && powerStateData.processing == 'Request Suspend') || (powerStateData.state == 'Active Standby' && powerStateData.processing == 'Prepare Suspend');
                const screenOff = (powerStateData.state == 'Suspend');

                //pixelRefresh
                const prepareScreenPixelRefresh = ((powerStateData.state == 'Active' && powerStateData.processing == 'Request Active Standby') || (powerStateData.state == 'Screen Saver' && powerStateData.processing == 'Request Active Standby'));
                const screenPixelRefresh = (powerStateData.state == 'Active Standby');

                //powerState
                const pixelRefresh = (prepareScreenPixelRefresh || screenPixelRefresh);
                const powerOn = (prepareScreenOn || stillScreenOn || powerOnScreenOff || screenOn || prepareScreenSaver || screenSaver);
                const powerOff = (prepareScreenOff || screenOff || pixelRefresh);

                const power = (this.webOS >= 3) ? (this.isConnected && powerOn && !powerOff) : this.isConnected;
                const screenState = power ? !powerOnScreenOff : false;

                if (power != this.power || screenState != this.screenState) {
                    this.emit('powerState', power, pixelRefresh, screenState);
                    const setAudioState = !power ? this.emit('audioState', 0, true, '') : false;
                    const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Power State', JSON.stringify(powerStateData, null, 2)) : false;
                    this.power = power;
                    this.screenState = screenState;
                };

                //Audio State
                const audioStateData = await this.send('subscribe', API_URL.GetAudioStatus);
                const debug1 = this.debugLog ? this.emit('debug', `Audio State ${JSON.stringify(audioStateData, null, 2)}`) : false;
                const volume = audioStateData.volume;
                const mute = power ? (audioStateData.mute == true) : true;
                const audioOutput = (this.webOS >= 4) ? audioStateData.volumeStatus.soundOutput : audioStateData.scenario;

                if (volume != this.volume || mute != this.mute || audioOutput != this.audioOutput) {
                    this.emit('audioState', volume, mute, audioOutput);
                    const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'Audio State', JSON.stringify(audioStateData, null, 2)) : false;
                    this.volume = volume;
                    this.mute = mute;
                    this.audioOutput = audioOutput;
                };

                //Current App
                const currentAppData = await this.send('subscribe', API_URL.GetForegroundAppInfo);
                const debug2 = this.debugLog ? this.emit('debug', `Current App ${JSON.stringify(currentAppData, null, 2)}`) : false;
                const appId = currentAppData.appId;

                if (appId != this.appId) {
                    this.emit('currentApp', appId);
                    const mqtt2 = this.mqttEnabled ? this.emit('mqtt', 'Current App', JSON.stringify(currentAppData, null, 2)) : false;
                    this.appId = appId;
                };

                //Current Channel
                const currentChannelData = await this.send('subscribe', API_URL.GetCurrentChannel);
                const debug3 = this.debugLog ? this.emit('debug', `Current Channel ${JSON.stringify(currentChannelData, null, 2)}`) : false;
                const channelName = currentChannelData.channelName;
                const channelNumber = currentChannelData.channelNumber;
                const channelReference = currentChannelData.channelId;

                if (channelName != this.channelName || channelNumber != this.channelNumber || channelReference != this.channelReference) {
                    this.emit('currentChannel', channelName, channelNumber, channelReference);
                    const mqtt3 = this.mqttEnabled ? this.emit('mqtt', 'Current Channel', JSON.stringify(currentChannelData, null, 2)) : false;
                    this.channelName = channelName;
                    this.channelNumber = channelNumber;
                    this.channelReference = channelReference;
                };

                //Picture Settings
                if (this.webOS >= 4) {
                    const payload = {
                        category: 'picture',
                        keys: ['brightness', 'backlight', 'contrast', 'color']
                    }
                    const pictureSettingsData = await this.send('subscribe', API_URL.GetSystemSettings, payload);
                    const debug4 = this.debugLog ? this.emit('debug', `Picture Settings ${JSON.stringify(pictureSettingsData, null, 2)}`) : false;
                    const brightness = pictureSettingsData.settings.brightness;
                    const backlight = pictureSettingsData.settings.backlight;
                    const contrast = pictureSettingsData.settings.contrast;
                    const color = pictureSettingsData.settings.color;
                    const pictureMode = 3;

                    if (brightness != this.brightness || backlight != this.backlight || contrast != this.contrast || color != this.color || pictureMode != this.pictureMode) {
                        this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode);
                        const mqtt4 = this.mqttEnabled ? this.emit('mqtt', 'Picture Settings', JSON.stringify(pictureSettingsData, null, 2)) : false;
                        this.brightness = brightness;
                        this.backlight = backlight;
                        this.contrast = contrast;
                        this.color = color;
                        this.pictureMode = pictureMode;
                    };
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

            this.data[cid] = (data) => {
                if (type == 'request') {
                    delete this.data[cid];
                };
                resolve(data);
            };

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