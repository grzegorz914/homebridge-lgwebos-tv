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
        this.isPaired = false;
        this.power = false;

        this.client = new WebSocketClient(SOCKET_OPTIONS);
        this.client.on('connect', (connection) => {
                const debug = this.debugLog ? this.emit('debug', 'Socket connected.') : false;
                this.connection = connection;
                this.isConnected = true;
                this.register();

                this.connection.on('message', (message) => {
                        if (message.type === 'utf8') {
                            const messageUtf8Data = message.utf8Data;
                            const parsedMessage = messageUtf8Data ? JSON.parse(messageUtf8Data) : this.debugLog ? this.emit('debug', `Not received UTF-8 data: ${messageUtf8Data}`) : false;

                            if (parsedMessage.payload && this.data[parsedMessage.id]) {
                                this.data[parsedMessage.id](parsedMessage.payload);
                                const debug = this.debugLog ? this.emit('debug', `Message: ${JSON.stringify(parsedMessage.payload, null, 2)}`) : false;
                            };
                        } else {
                            const debug = this.debugLog ? this.emit('debug', `Received non UTF-8 data: ${message}`) : false;
                        };
                    })
                    .on('close', () => {
                        const debug = this.debugLog ? this.emit('debug', `Connection to TV closed.`) : false;
                        this.isConnected = false;
                        this.connection = {};
                        Object.keys(this.data).forEach((cid) => {
                            delete this.data[cid];
                        });
                        this.emit('powerState', false, false, false, false);
                        this.emit('audioState', 0, true, '');
                        this.emit('disconnect', 'Disconnected.');

                        setTimeout(() => {
                            this.client.connect(this.url);
                        }, 5000);
                    }).on('error', (error) => {
                        this.emit('error', `Connect to TV error: ${error}`);
                    })

            })
            .on('connectFailed', (error) => {
                const debug = this.debugLog ? this.emit('debug', `Connect to TV Failed: ${error}`) : false;
                this.isConnected = false;
                this.connection = {};

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
                this.isPaired = true;
                try {
                    await this.getSocket();
                    await this.subscribeData();
                } catch (error) {
                    this.emit('error', `Subscribe data error: ${error}`)
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

    subscribeData() {
        return new Promise(async (resolve, reject) => {
            try {
                //System Info
                const data = await this.send('request', API_URL.GetSystemInfo);
                const debug = this.debugLog ? this.emit('debug', `System info: ${JSON.stringify(data, null, 2)}`) : false;
                const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Info', JSON.stringify(data, null, 2)) : false;
                const modelName = data.modelName;

                //Software Info
                const data1 = await this.send('request', API_URL.GetSoftwareInfo);
                const debug1 = this.debugLog ? this.emit('debug', `Software info: ${JSON.stringify(data1, null, 2)}`) : false;
                const productName = data1.product_name;
                const serialNumber = data1.device_id;
                const firmwareRevision = `${data1.major_ver}.${data1.minor_ver}`;
                const webOS = (data1.product_name != undefined) ? data1.product_name.slice(8, -2) : 3;

                this.emit('connect', 'Connected.');
                this.emit('deviceInfo', modelName, productName, serialNumber, firmwareRevision, webOS);
                const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'Info 1', JSON.stringify(data1, null, 2)) : false;

                //Channels list
                //const data2 = await this.send('subscribe', API_URL.GetChannelList);
                //const debug2 = this.debugLog ? this.emit('debug', `Channel List ${JSON.stringify(data2, null, 2)}`) : false;
                //if (data2.channelList != undefined) {
                //    this.emit('channelList', data2.channelList);
                //    const mqtt2 = this.mqttEnabled ? this.emit('mqtt', 'Channel List', JSON.stringify(data2.channelList, null, 2)) : false;
                //}

                //Current Channel
                //const data3 = await this.send('subscribe', API_URL.GetCurrentChannel);
                //const debug3 = this.debugLog ? this.emit('debug', `Current Channel ${JSON.stringify(data3, null, 2)}`) : false;
                //const channelName = data3.channelName;
                //const channelNumber = data3.channelNumber;
                //const channelReference = data3.channelId;
                //this.emit('currentChannel', channelName, channelNumber, channelReference);
                //const mqtt3 = this.mqttEnabled ? this.emit('mqtt', 'Current Channel', JSON.stringify(data3, null, 2)) : false;

                //Installed Apps
                const data4 = await this.send('subscribe', API_URL.GetInstalledApps);
                const debug4 = this.debugLog ? this.emit('debug', `Apps List ${JSON.stringify(data4, null, 2)}`) : false;
                if (data4.apps != undefined) {
                    this.emit('installedApps', data4.apps);
                    const mqtt4 = this.mqttEnabled ? this.emit('mqtt', 'Apps List', JSON.stringify(data4.apps, null, 2)) : false;
                }

                //Foreground App
                const data5 = await this.send('subscribe', API_URL.GetForegroundAppInfo);
                const debug5 = this.debugLog ? this.emit('debug', `Current App ${JSON.stringify(data5, null, 2)}`) : false;
                const reference = data5.appId;
                this.emit('currentApp', reference);
                const mqtt5 = this.mqttEnabled ? this.emit('mqtt', 'Current App', JSON.stringify(data5, null, 2)) : false;

                //Power State
                const data6 = await this.send('subscribe', API_URL.GetPowerState);
                const debug6 = this.debugLog ? this.emit('debug', `Power State ${JSON.stringify(data6, null, 2)}`) : false;

                //screen On
                const prepareScreenOn = ((data6.state == 'Suspend' && data6.processing == 'Screen On') || (data6.state == 'Screen Saver' && data6.processing == 'Screen On') || (data6.state == 'Active Standby' && data6.processing == 'Screen On'));
                const stillScreenOn = (data6.state == 'Active' && data6.processing == 'Screen On');
                const powerOnScreenOff = (data6.state == 'Screen Off' || (data6.state == 'Screen Off' && data6.processing == 'Screen On'));
                const screenOn = (data6.state == 'Active');

                //screen Saver
                const prepareScreenSaver = (data6.state == 'Active' && data6.processing == 'Request Screen Saver');
                const screenSaver = (data6.state == 'Screen Saver');

                //screen Off
                const prepareScreenOff = ((data6.state == 'Active' && data6.processing == 'Request Power Off') || (data6.state == 'Active' && data6.processing == 'Request Suspend') || (data6.state == 'Active' && data6.processing == 'Prepare Suspend') ||
                        (data6.state == 'Screen Saver' && data6.processing == 'Request Power Off') || (data6.state == 'Screen Saver' && data6.processing == 'Request Suspend') || (data6.state == 'Screen Saver' && data6.processing == 'Prepare Suspend')) ||
                    (data6.state == 'Active Standby' && data6.processing == 'Request Power Off') || (data6.state == 'Active Standby' && data6.processing == 'Request Suspend') || (data6.state == 'Active Standby' && data6.processing == 'Prepare Suspend');
                const screenOff = (data6.state == 'Suspend');

                //pixelRefresh
                const prepareScreenPixelRefresh = ((data6.state == 'Active' && data6.processing == 'Request Active Standby') || (data6.state == 'Screen Saver' && data6.processing == 'Request Active Standby'));
                const screenPixelRefresh = (data6.state == 'Active Standby');

                //powerState
                const pixelRefresh = (prepareScreenPixelRefresh || screenPixelRefresh);
                const powerOn = (prepareScreenOn || stillScreenOn || powerOnScreenOff || screenOn || prepareScreenSaver || screenSaver);
                const powerOff = (prepareScreenOff || screenOff || pixelRefresh);

                const power = (webOS >= 3) ? (powerOn && !powerOff) : this.isConnected;
                const screenState = power ? !powerOnScreenOff : false;

                this.emit('powerState', this.isConnected, power, pixelRefresh, screenState);
                const setAudioState = !power ? this.emit('audioState', 0, true, '') : false;
                const mqtt6 = this.mqttEnabled ? this.emit('mqtt', 'Power State', JSON.stringify(data6, null, 2)) : false;

                //Audio State
                const data7 = await this.send('subscribe', API_URL.GetAudioStatus);
                const debug7 = this.debugLog ? this.emit('debug', `Audio State ${JSON.stringify(data7, null, 2)}`) : false;
                const volume = data7.volume;
                const mute = power ? (data7.mute == true) : true;
                const audioOutput = data7.scenario;
                this.emit('audioState', volume, mute, audioOutput);
                const mqtt7 = this.mqttEnabled ? this.emit('mqtt', 'Audio State', JSON.stringify(data7, null, 2)) : false;

                //Picture Settings
                if (webOS >= 4) {
                    const payload = {
                        category: 'picture',
                        keys: ['brightness', 'backlight', 'contrast', 'color']
                    }
                    const data8 = await this.send('subscribe', API_URL.GetSystemSettings, payload);
                    const debug8 = this.debugLog ? this.emit('debug', `Picture Settings ${JSON.stringify(data8, null, 2)}`) : false;
                    const brightness = data8.settings.brightness;
                    const backlight = data8.settings.backlight;
                    const contrast = data8.settings.contrast;
                    const color = data8.settings.color;
                    const pictureMode = 3;
                    this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode);
                    const mqtt8 = this.mqttEnabled ? this.emit('mqtt', 'Picture Settings', JSON.stringify(data8, null, 2)) : false;
                };

                //App State
                const data9 = await this.send('subscribe', API_URL.GetAppState);
                const debug9 = this.debugLog ? this.emit('debug', `App State ${JSON.stringify(data9, null, 2)}`) : false;
                this.emit('appState');

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
            payload == undefined ? {} : payload;
            const json = JSON.stringify({
                id: cid,
                type: type,
                uri: uri,
                payload: payload
            });

            this.data[cid] = (data) => {
                //delete this.data[cid];
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