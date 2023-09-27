'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const WebSocket = require('ws');
const CONSTANS = require('./constans.json');

class LgWebOsSocket extends EventEmitter {
    constructor(config) {
        super();
        const url = config.url;
        const keyFile = config.keyFile;
        const debugLog = config.debugLog;
        const restFulEnabled = config.restFulEnabled;
        const mqttEnabled = config.mqttEnabled;
        const sslWebSocket = config.sslWebSocket;

        this.startPrepareAccessory = true;
        this.isConnected = false;
        this.pairingKey = '';
        this.modelName = 'LG TV'
        this.power = false;
        this.webOS = 2.0;

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
                }, 2500);

                client.on('close', () => {
                    const debug = debugLog ? this.emit('debug', `Socked closed.`) : false;
                    clearInterval(heartbeat);
                    client.emit('disconnect');
                });

                try {
                    const pairingKey = await this.readPairingKey(keyFile);
                    CONSTANS.Pairing['client-key'] = pairingKey;
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

                        if (pairingKey !== this.pairingKey) {
                            try {
                                await this.savePairingKey(keyFile, pairingKey);
                                this.emit('message', 'Pairing key saved.')
                            } catch (error) {
                                this.emit('error', `Pairing key saved error: ${error}`)
                            };
                        };

                        //Request specjalized socket and system info data
                        try {
                            this.systemInfoId = await this.send('request', CONSTANS.ApiUrls.GetSystemInfo);
                            this.socketId = await this.send('request', CONSTANS.ApiUrls.SocketUrl);
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
                            }, 2500);

                            specialClient.on('close', () => {
                                const debug = debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                                clearInterval(heartbeat);
                            })

                        }).on('error', async (error) => {
                            this.emit('error', `Specialized socket error: ${error} trying to reconnect.`);
                            await new Promise(resolve => setTimeout(resolve, 2500));
                            this.socketId = await this.send('request', CONSTANS.ApiUrls.SocketUrl);
                        });
                        break;
                    case this.systemInfoId:
                        const debug1 = debugLog ? this.emit('debug', `System Info: ${stringifyMessage}`) : false;
                        this.modelName = messageData.modelName || 'ModelName';

                        //restFul
                        const restFul1 = restFulEnabled ? this.emit('restFul', 'systeminfo', messageData) : false;

                        //mqtt
                        const mqtt1 = mqttEnabled ? this.emit('mqtt', 'System Info', messageData) : false;

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
                        const match = productName.match(/\d+(\.\d+)?/);
                        this.webOS = match ? parseFloat(match[0]) : this.emit('error', `Unknown webOS system: ${match}.`);

                        this.emit('message', 'Connected.');
                        this.emit('deviceInfo', this.modelName, productName, serialNumber, firmwareRevision, this.webOS);

                        //restFul
                        const restFul2 = restFulEnabled ? this.emit('restFul', 'softwareinfo', messageData) : false;

                        //mqtt
                        const mqtt2 = mqttEnabled ? this.emit('mqtt', 'Software Info', messageData) : false;

                        client.emit('subscribeInputsChannelsList');
                        await new Promise(resolve => setTimeout(resolve, 3500));
                        client.emit('prepareAccessory');
                        await new Promise(resolve => setTimeout(resolve, 2000));
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

                        //restFul
                        const restFul3 = restFulEnabled ? this.emit('restFul', 'channels', messageData) : false;

                        //mqtt
                        const mqtt3 = mqttEnabled ? this.emit('mqtt', 'Channels', messageData) : false;
                        break;
                    case this.appsId:
                        const debug4 = debugLog ? this.emit('debug', `Apps List: ${stringifyMessage}`) : false;

                        const appsList = messageData.apps;
                        const appsListCount = Array.isArray(appsList) ? appsList.length : 0;
                        if (appsListCount === 0) {
                            return;
                        };

                        this.emit('appsList', appsList);

                        //restFul
                        const restFul4 = restFulEnabled ? this.emit('restFul', 'apps', messageData) : false;

                        //mqtt
                        const mqtt4 = mqttEnabled ? this.emit('mqtt', 'Apps', messageData) : false;
                        break;
                    case this.powerStateId:
                        const debug5 = debugLog ? this.emit('debug', `Power: ${stringifyMessage}`) : false;

                        let tvScreenState = messageData.state;
                        let screenState = false;
                        let pixelRefresh = false;
                        switch (tvScreenState) {
                            case 'Active':
                                this.power = true;
                                screenState = true;
                                pixelRefresh = false;
                                break;
                            case 'Active Standby':
                                this.power = false;
                                screenState = false;
                                pixelRefresh = true;
                                break;
                            case 'Screen Saver':
                                this.power = true;
                                screenState = true;
                                pixelRefresh = false;
                                break;
                            case 'Screen Off':
                                this.power = true;
                                screenState = false;
                                pixelRefresh = false;
                                break;
                            case 'Suspend':
                                this.power = false;
                                screenState = false;
                                pixelRefresh = false;
                                break;
                            default:
                                this.emit('message', `Unknown power state: ${tvScreenState}`);
                                break;
                        }
                        this.power = this.webOS >= 3.0 ? this.isConnected && this.power : this.isConnected;
                        this.emit('powerState', this.power, pixelRefresh, screenState, tvScreenState);

                        //restFul
                        const restFul5 = restFulEnabled ? this.emit('restFul', 'power', messageData) : false;

                        //mqtt
                        const mqtt5 = mqttEnabled ? this.emit('mqtt', 'Power', messageData) : false;
                        break;
                    case this.currentAppId:
                        const debug6 = debugLog ? this.emit('debug', `App: ${stringifyMessage}`) : false;
                        const appId = messageData.appId;

                        this.emit('currentApp', appId);

                        //restFul
                        const restFul6 = restFulEnabled ? this.emit('restFul', 'currentapp', messageData) : false;

                        //mqtt
                        const mqtt6 = mqttEnabled ? this.emit('mqtt', 'Current App', messageData) : false;
                        break;
                    case this.audioStateId:
                        const debug7 = debugLog ? this.emit('debug', `Audio: ${stringifyMessage}`) : false;
                        const volume = messageData.volume < 0 ? 0 : messageData.volume;
                        const mute = messageData.mute;
                        this.emit('audioState', volume, mute);

                        //restFul
                        const restFul7 = restFulEnabled ? this.emit('restFul', 'audio', messageData) : false;

                        //mqtt
                        const mqtt7 = mqttEnabled ? this.emit('mqtt', 'Audio', messageData) : false;
                        break;
                    case this.currentChannelId:
                        const debug8 = debugLog ? this.emit('debug', `Channel: ${stringifyMessage}`) : false;
                        const channelId = messageData.channelId;
                        const channelName = messageData.channelName;
                        const channelNumber = messageData.channelNumber;
                        this.emit('currentChannel', channelName, channelNumber, channelId);

                        //restFul
                        const restFul8 = restFulEnabled ? this.emit('restFul', 'currentchannel', messageData) : false;

                        //mqtt
                        const mqtt8 = mqttEnabled ? this.emit('mqtt', 'Current Channel', messageData) : false;
                        break;
                    case this.pictureSettingsId:
                        const debug9 = debugLog ? this.emit('debug', `Picture: ${stringifyMessage}`) : false;
                        const brightness = messageData.settings.brightness;
                        const backlight = messageData.settings.backlight;
                        const contrast = messageData.settings.contrast;
                        const color = messageData.settings.color;
                        const pictureMode = 3;
                        this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode, this.power);

                        //restFul
                        const restFul9 = restFulEnabled ? this.emit('restFul', 'picturesettings', messageData) : false;

                        //mqtt
                        const mqtt9 = mqttEnabled ? this.emit('mqtt', 'Picture Settings', messageData) : false;
                        break;
                    case this.soundModeId:
                        const debug10 = debugLog ? this.emit('debug', `Sound Mode: ${stringifyMessage}`) : false;
                        const soundMode = messageData.settings.soundMode;
                        this.emit('soundMode', soundMode, this.power);

                        //restFul
                        const restFul10 = restFulEnabled ? this.emit('restFul', 'soundmode', messageData) : false;

                        //mqtt
                        const mqtt10 = mqttEnabled ? this.emit('mqtt', 'Sound Mode', messageData) : false;
                        break;
                    default:
                        this.emit('message', `Unknown message Id: ${messageId}, data: ${stringifyMessage}`);
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
                    this.currentChannelId = await this.send('subscribe', CONSTANS.ApiUrls.GetCurrentChannel);
                    await new Promise(resolve => setTimeout(resolve, 250));
                    this.audioStateId = await this.send('subscribe', CONSTANS.ApiUrls.GetAudioStatus);
                    await new Promise(resolve => setTimeout(resolve, 350));

                    //picture mode
                    if (this.webOS >= 4.0) {
                        const payload = {
                            category: 'picture',
                            keys: ['brightness', 'backlight', 'contrast', 'color']
                        }
                        this.pictureSettingsId = await this.send('subscribe', CONSTANS.ApiUrls.GetSystemSettings, payload);
                    };
                    await new Promise(resolve => setTimeout(resolve, 350));

                    //sound mode
                    if (this.webOS >= 6.0) {
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
                this.emit('powerState', false, false, false, false);
                this.emit('audioState', undefined, true);
                this.emit('pictureSettings', 0, 0, 0, 0, 3, false);
                this.emit('soundMode', undefined, false);
                this.power = false;

                //Prepare accessory
                const key = await this.readPairingKey(keyFile);
                const pairingKeyExist = key.length > 10;
                if (pairingKeyExist && this.startPrepareAccessory) {
                    client.emit('prepareAccessory');
                };

                await new Promise(resolve => setTimeout(resolve, 2500));
                this.connect();
            });
        }

        this.connect();
    };

    readPairingKey(path) {
        return new Promise(async (resolve, reject) => {
            try {
                const key = await fsPromises.readFile(path);
                this.pairingKey = key.toString();
                resolve(this.pairingKey);
            } catch (error) {
                reject(error);
            }
        });
    }

    savePairingKey(path, pairingKey) {
        return new Promise(async (resolve, reject) => {
            try {
                await fsPromises.writeFile(path, pairingKey);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

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