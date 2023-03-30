'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const WebSocket = require('ws');
const CONSTANS = require('./constans.json');
let modelName, power, webOS

class LgWebOsSocket extends EventEmitter {
    constructor(config) {
        super();
        const url = config.url;
        const keyFile = config.keyFile;
        const debugLog = config.debugLog;
        const mqttEnabled = config.mqttEnabled;
        const sslWebSocket = config.sslWebSocket;

        this.savedPairingKey = fs.readFileSync(keyFile).length > 0 ? (fs.readFileSync(keyFile)).toString() : '';
        this.startPrepareAccessory = true;
        this.isConnected = false;

        this.connect = () => {
            const client = sslWebSocket ? new WebSocket(url, { rejectUnauthorized: false }) : new WebSocket(url);
            client.on('open', async () => {
                const debug = debugLog ? this.emit('debug', `Socked connected.`) : false;
                this.client = client;
                this.isConnected = true;

                client.on('pong', () => {
                    const debug = debugLog ? this.emit('debug', `Socked received heartbeat.`) : false;
                    this.isConnected = true;
                });

                const heartbeat = setInterval(() => {
                    if (client.readyState === WebSocket.OPEN) {
                        const debug = debugLog ? this.emit('debug', `Socked send heartbeat.`) : false;
                        client.ping(null, false, 'UTF-8');
                    }

                    if (client.readyState === WebSocket.CLOSED) {
                        clearInterval(heartbeat);
                    }
                }, 5000);

                client.on('close', () => {
                    const debug = debugLog ? this.emit('debug', `Socked closed.`) : false;
                    clearInterval(heartbeat);
                    client.emit('disconnect');
                });

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
                const returnValue = messageData.returnValue === true;
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
                        const debug12 = debugLog ? this.emit('debug', `Socket Path: ${stringifyMessage}`) : false;

                        const socketPath = messageData.socketPath;
                        const specialClient = sslWebSocket ? new WebSocket(socketPath, { rejectUnauthorized: false }) : new WebSocket(socketPath);
                        specialClient.on('open', () => {
                            const debug = debugLog ? this.emit('debug', `Specialized socket connected.`) : false;
                            this.specialClient = specialClient;

                            specialClient.on('pong', () => {
                                const debug = debugLog ? this.emit('debug', `Specialized socket received heartbeat.`) : false;
                            });

                            const heartbeat = setInterval(() => {
                                if (specialClient.readyState === WebSocket.OPEN) {
                                    const debug = debugLog ? this.emit('debug', `Specialized socket send heartbeat.`) : false;
                                    specialClient.ping(null, false, 'UTF-8');
                                }

                                if (specialClient.readyState === WebSocket.CLOSED) {
                                    clearInterval(heartbeat);
                                }
                            }, 5000);

                            specialClient.on('close', () => {
                                const debug = debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                                clearInterval(heartbeat);
                            })

                        }).on('error', (error) => {
                            this.emit('error', `Specialized socket error: ${error}.`);
                        });
                        break;
                    case this.systemInfoId:
                        const debug1 = debugLog ? this.emit('debug', `System Info: ${stringifyMessage}`) : false;
                        modelName = messageData.modelName || 'ModelName';
                        const mqtt1 = mqttEnabled ? this.emit('mqtt', 'System Info', stringifyMessage) : false;

                        try {
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
                        webOS = productName.slice(8, -2);

                        this.emit('message', 'Connected.');
                        this.emit('deviceInfo', modelName, productName, serialNumber, firmwareRevision, webOS);
                        const mqtt2 = mqttEnabled ? this.emit('mqtt', 'Software Info', stringifyMessage) : false;

                        client.emit('subscribeInputsChannelsList');
                        await new Promise(resolve => setTimeout(resolve, 2500));
                        client.emit('prepareAccessory');
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        client.emit('subscribeTvState');
                        break;
                    case this.channelsId:
                        const debug3 = debugLog ? this.emit('debug', `Channels List: ${stringifyMessage}`) : false;

                        const channelsList = messageData.channelList;
                        const channelsListCount = Array.isArray(channelsList) ? channelsList.length : 0;
                        if (channelsListCount === 0) {
                            return;
                        };

                        this.emit('channelList', channelsList);
                        const mqtt3 = mqttEnabled ? this.emit('mqtt', 'Channels', stringifyMessage) : false;
                        break;
                    case this.appsId:
                        const debug4 = debugLog ? this.emit('debug', `Apps List: ${stringifyMessage}`) : false;

                        const appsList = messageData.apps;
                        const appsListCount = Array.isArray(appsList) ? appsList.length : 0;
                        if (appsListCount === 0) {
                            return;
                        };

                        this.emit('appsList', appsList);
                        const mqtt4 = mqttEnabled ? this.emit('mqtt', 'Apps', stringifyMessage) : false;
                        break;
                    case this.powerStateId:
                        const debug5 = debugLog ? this.emit('debug', `Power: ${stringifyMessage}`) : false;

                        let tvScreenState = messageData.state;
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
                        power = (webOS >= 3) ? (this.isConnected && power) : this.isConnected;

                        this.emit('powerState', power, pixelRefresh, screenState, tvScreenState);
                        const mqtt5 = mqttEnabled ? this.emit('mqtt', 'Power', stringifyMessage) : false;
                        break;
                    case this.currentAppId:
                        const debug6 = debugLog ? this.emit('debug', `App: ${stringifyMessage}`) : false;
                        const appId = messageData.appId;

                        this.emit('currentApp', appId);
                        const mqtt6 = mqttEnabled ? this.emit('mqtt', 'App', stringifyMessage) : false;
                        break;
                    case this.audioStateId:
                        const debug7 = debugLog ? this.emit('debug', `Audio: ${stringifyMessage}`) : false;
                        const volume = messageData.volume < 0 ? 0 : messageData.volume;
                        const mute = messageData.mute;
                        const audioOutput = webOS >= 5 ? messageData.volumeStatus.soundOutput : messageData.scenario;

                        this.emit('audioState', volume, mute, audioOutput);
                        const mqtt7 = mqttEnabled ? this.emit('mqtt', 'Audio', stringifyMessage) : false;
                        break;
                    case this.currentChannelId:
                        const debug8 = debugLog ? this.emit('debug', `Channel: ${stringifyMessage}`) : false;
                        const channelId = messageData.channelId;
                        const channelName = messageData.channelName;
                        const channelNumber = messageData.channelNumber;

                        this.emit('currentChannel', channelName, channelNumber, channelId);
                        const mqtt8 = mqttEnabled ? this.emit('mqtt', 'Channel', stringifyMessage) : false;
                        break;
                    case this.pictureSettingsId:
                        const debug9 = debugLog ? this.emit('debug', `Picture: ${stringifyMessage}`) : false;
                        const brightness = messageData.settings.brightness;
                        const backlight = messageData.settings.backlight;
                        const contrast = messageData.settings.contrast;
                        const color = messageData.settings.color;
                        const pictureMode = 3;

                        this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode, power);
                        const mqtt9 = mqttEnabled ? this.emit('mqtt', 'Picture Mode', stringifyMessage) : false;
                        break;
                    case this.soundModeId:
                        const debug10 = debugLog ? this.emit('debug', `Sound Mode: ${stringifyMessage}`) : false;
                        const soundMode = messageData.settings.soundMode;

                        this.emit('soundMode', soundMode, power);
                        const mqtt10 = mqttEnabled ? this.emit('mqtt', 'Sound Mode', stringifyMessage) : false;
                        break;
                };

            }).on('subscribeInputsChannelsList', async () => {
                const debug = debugLog ? this.emit('debug', `Subscribe Inputs and Channels list.`) : false;
                try {
                    this.channelsId = await this.send('subscribe', CONSTANS.ApiUrls.GetChannelList);
                    this.appsId = await this.send('subscribe', CONSTANS.ApiUrls.GetInstalledApps);
                } catch (error) {
                    this.emit('error', `Subscribe Inputs and Channels list error: ${error}`)
                };
            }).on('prepareAccessory', async () => {
                const debug = debugLog ? this.emit('debug', `Prepare accessory.`) : false;
                const prepareAccessory = this.startPrepareAccessory ? this.emit('prepareAccessory') : false;
                this.startPrepareAccessory = false;
            }).on('subscribeTvState', async () => {
                const debug = debugLog ? this.emit('debug', `Subscribe TV state.`) : false;
                try {
                    this.powerStateId = await this.send('subscribe', CONSTANS.ApiUrls.GetPowerState);
                    await new Promise(resolve => setTimeout(resolve, 250));
                    this.currentAppId = await this.send('subscribe', CONSTANS.ApiUrls.GetForegroundAppInfo);
                    await new Promise(resolve => setTimeout(resolve, 250));
                    this.audioStateId = await this.send('subscribe', CONSTANS.ApiUrls.GetAudioStatus);
                    await new Promise(resolve => setTimeout(resolve, 250));
                    this.currentChannelId = await this.send('subscribe', CONSTANS.ApiUrls.GetCurrentChannel);

                    //picture mode
                    if (webOS >= 4) {
                        const payload = {
                            category: 'picture',
                            keys: ['brightness', 'backlight', 'contrast', 'color']
                        }
                        this.pictureSettingsId = await this.send('subscribe', CONSTANS.ApiUrls.GetSystemSettings, payload);
                    };

                    //sound mode
                    if (webOS >= 6) {
                        const payload = {
                            category: 'sound',
                            keys: ['soundMode']
                        }
                        this.soundModeId = await this.send('subscribe', CONSTANS.ApiUrls.GetSystemSettings, payload);
                    }
                } catch (error) {
                    this.emit('error', `Subscribe TV states error: ${error}`)
                };
            }).on('error', (error) => {
                const debug = debugLog ? this.emit('debug', `Socket connect error: ${error}, update TV state.`) : false;
                client.emit('disconnect');
            }).on('disconnect', async () => {
                const emitMessage = this.isConnected ? this.emit('message', 'Disconnected.') : false;
                this.isConnected = false;
                power = false;
                this.emit('powerState', false, false, false, false);
                this.emit('audioState', undefined, true, undefined);
                this.emit('pictureSettings', 0, 0, 0, 0, 3, false);
                this.emit('soundMode', undefined, false);

                //Prepare accessory
                if (this.savedPairingKey.length > 10 && this.startPrepareAccessory) {
                    client.emit('prepareAccessory');
                };

                await new Promise(resolve => setTimeout(resolve, 5000));
                this.connect();
            });
        }

        this.connect();
    };

    send(type, uri, payload) {
        return new Promise((resolve, reject) => {

            try {
                switch (type) {
                    case 'button':
                        if (!this.specialClient) {
                            reject('Specjalized socket not connected.');
                            return;
                        };

                        payload = uri
                        const message = Object.keys(payload).reduce((acc, k) => {
                            return (acc.concat([`${k}:${payload[k]}`]));
                        }, [`type:${type}`]).join('\n') + '\n\n';

                        this.specialClient.send(message);
                        resolve();
                        break;
                    default:
                        if (!this.isConnected) {
                            reject('Socket not connected.');
                            return;
                        };

                        let cidCount = 0;
                        const cid = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8) + (`000${(cidCount++).toString(16)}`).slice(-4);
                        const message1 = JSON.stringify({
                            id: cid,
                            type: type,
                            uri: uri,
                            payload: payload
                        });

                        resolve(cid);
                        this.client.send(message1);
                        break
                };
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = LgWebOsSocket;