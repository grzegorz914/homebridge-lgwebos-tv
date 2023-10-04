'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const WebSocket = require('ws');
const CONSTANS = require('./constans.json');

class LgWebOsSocket extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const keyFile = config.keyFile;
        const debugLog = config.debugLog;
        const restFulEnabled = config.restFulEnabled;
        const mqttEnabled = config.mqttEnabled;
        const sslWebSocket = config.sslWebSocket;

        this.socketConnected = false;
        this.specjalizedSocketConnected = false;
        this.pairingKey = '';
        this.modelName = 'LG TV'
        this.power = false;
        this.webOS = 2.0;
        this.debugLog = debugLog;
        this.startPrepareAccessory = true;
        this.cidCount = 0;

        this.connect = () => {
            const url = sslWebSocket ? CONSTANS.ApiUrls.WssUrl.replace('lgwebostv', host) : CONSTANS.ApiUrls.WsUrl.replace('lgwebostv', host);
            const socket = sslWebSocket ? new WebSocket(url, { rejectUnauthorized: false }) : new WebSocket(url);
            socket.on('open', async () => {
                const debug = debugLog ? this.emit('debug', `Socked connected.`) : false;
                this.socket = socket;
                this.socketConnected = true;

                socket.on('pong', () => {
                    const debug = debugLog ? this.emit('debug', `Socked received heartbeat.`) : false;
                    this.socketConnected = true;
                });

                const heartbeat = setInterval(() => {
                    if (socket.readyState === WebSocket.OPEN) {
                        const debug = debugLog ? this.emit('debug', `Socked send heartbeat.`) : false;
                        socket.ping(null, false, 'UTF-8');
                    }

                    if (socket.readyState === WebSocket.CLOSED) {
                        clearInterval(heartbeat);
                    }
                }, 3500);

                socket.on('close', () => {
                    const debug = debugLog ? this.emit('debug', `Socked closed.`) : false;
                    clearInterval(heartbeat);
                    socket.emit('disconnect');
                });

                try {
                    const pairingKey = await this.readPairingKey(keyFile);
                    CONSTANS.Pairing['client-key'] = pairingKey;
                    this.registerId = await this.getCid();
                    await this.send('register', undefined, CONSTANS.Pairing, this.registerId);
                } catch (error) {
                    this.emit('error', `Register error: ${error}`);
                };
            }).on('message', async (message) => {
                const parsedMessage = JSON.parse(message);
                const messageType = parsedMessage.type;
                const messageId = parsedMessage.id;
                const messageData = parsedMessage.payload;
                const stringifyMessage = JSON.stringify(messageData, null, 2);

                switch (messageType) {
                    case 'registered':
                        switch (messageId) {
                            case this.registerId:
                                const debug1 = debugLog ? this.emit('debug', `Start TV pairing: ${stringifyMessage}`) : false;

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

                                //Request specjalized socket
                                try {
                                    this.specjalizedSockedId = await this.getCid();
                                    await this.send('request', CONSTANS.ApiUrls.SocketUrl, undefined, this.specjalizedSockedId);
                                } catch (error) {
                                    this.emit('error', `Request specjalized socket error: ${error}`)
                                };

                                //Request system and software info data
                                await new Promise(resolve => setTimeout(resolve, 1500));
                                try {
                                    this.systemInfoId = await this.getCid();
                                    await this.send('request', CONSTANS.ApiUrls.GetSystemInfo, undefined, this.systemInfoId);
                                    this.softwareInfoId = await this.getCid();
                                    await this.send('request', CONSTANS.ApiUrls.GetSoftwareInfo, undefined, this.softwareInfoId);
                                } catch (error) {
                                    this.emit('error', `Request system and software info error: ${error}`)
                                };

                                //Subscribe channels and inputs list
                                await new Promise(resolve => setTimeout(resolve, 4000));
                                try {
                                    this.channelsId = await this.getCid();
                                    await this.send('subscribe', CONSTANS.ApiUrls.GetChannelList, undefined, this.channelsId);
                                    this.appsId = await this.getCid();
                                    await this.send('subscribe', CONSTANS.ApiUrls.GetInstalledApps, undefined, this.appsId);
                                } catch (error) {
                                    this.emit('error', `Subscribe channels and inputs error: ${error}`)
                                };

                                //Start prepare accessory
                                await new Promise(resolve => setTimeout(resolve, 1500));
                                const prepareAccessory = this.startPrepareAccessory ? this.emit('prepareAccessory') : false;
                                this.startPrepareAccessory = false;

                                //Subscribe TV status
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                try {
                                    this.powerStateId = await this.getCid();
                                    await this.send('subscribe', CONSTANS.ApiUrls.GetPowerState, undefined, this.powerStateId);
                                    this.currentAppId = await this.getCid();
                                    await this.send('subscribe', CONSTANS.ApiUrls.GetForegroundAppInfo, undefined, this.currentAppId);
                                    this.currentChannelId = await this.getCid();
                                    await this.send('subscribe', CONSTANS.ApiUrls.GetCurrentChannel, undefined, this.currentChannelId);
                                    this.audioStateId = await this.getCid();
                                    await this.send('subscribe', CONSTANS.ApiUrls.GetAudioStatus, undefined, this.audioStateId);

                                    if (this.webOS >= 4.0) {
                                        const payload = {
                                            category: 'picture',
                                            keys: ['brightness', 'backlight', 'contrast', 'color']
                                        }
                                        this.pictureSettingsId = await this.getCid();
                                        await this.send('subscribe', CONSTANS.ApiUrls.GetSystemSettings, payload, this.pictureSettingsId);
                                    }

                                    if (this.webOS >= 6.0) {
                                        const payload = {
                                            category: 'sound',
                                            keys: ['soundMode']
                                        }
                                        this.soundModeId = await this.getCid();
                                        await this.send('subscribe', CONSTANS.ApiUrls.GetSystemSettings, payload, this.soundModeId);
                                    }
                                } catch (error) {
                                    this.emit('error', `Subscribe tv state error: ${error}`)
                                };
                                break;
                            default:
                                const debug = debugLog ? this.emit('debug', this.emit('debug', `Registered message id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case 'response':
                        switch (messageId) {
                            case this.specjalizedSockedId:
                                const debug = debugLog ? this.emit('debug', `Specjalized socket path: ${stringifyMessage}.`) : false;

                                const socketPath = messageData.socketPath;
                                const specializedSocket = sslWebSocket ? new WebSocket(socketPath, { rejectUnauthorized: false }) : new WebSocket(socketPath);
                                specializedSocket.on('open', () => {
                                    const debug = debugLog ? this.emit('debug', `Specialized socket connected.`) : false;
                                    this.specializedSocket = specializedSocket;
                                    this.specjalizedSocketConnected = true;

                                    specializedSocket.on('pong', () => {
                                        const debug = debugLog ? this.emit('debug', `Specialized socket received heartbeat.`) : false;
                                        this.specjalizedSocketConnected = true;
                                    });

                                    const heartbeat = setInterval(() => {
                                        if (specializedSocket.readyState === WebSocket.OPEN) {
                                            const debug = debugLog ? this.emit('debug', `Specialized socket send heartbeat.`) : false;
                                            specializedSocket.ping(null, false, 'UTF-8');
                                        }

                                        if (specializedSocket.readyState === WebSocket.CLOSED) {
                                            clearInterval(heartbeat);
                                        }
                                    }, 5000);

                                    specializedSocket.on('close', () => {
                                        const debug = debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                                        clearInterval(heartbeat);
                                        specializedSocket.emit('disconnect');
                                    })

                                }).on('message', async (message) => {
                                    const parsedMessage = JSON.parse(message);
                                    const stringifyMessage = JSON.stringify(parsedMessage, null, 2);
                                    const debug = debugLog ? this.emit('debug', `Specialized socket message: ${stringifyMessage}.`) : false;
                                }).on('error', (error) => {
                                    const debug = debugLog ? this.emit('debug', `Specjalized socket connect error: ${error}.`) : false;
                                    specializedSocket.emit('disconnect');
                                }).on('disconnect', async () => {
                                    const emitMessage = this.specjalizedSocketConnected ? this.emit('message', 'Specjalized socket disconnected, trying to reconnect.') : false;
                                    this.specjalizedSocketConnected = false;

                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                    await this.send('request', CONSTANS.ApiUrls.SocketUrl, undefined, this.specjalizedSockedId);

                                });
                                break;
                            case this.systemInfoId:
                                const debug1 = debugLog ? this.emit('debug', `System Info: ${stringifyMessage}`) : false;
                                this.modelName = messageData.modelName || 'ModelName';

                                //restFul
                                const restFul1 = restFulEnabled ? this.emit('restFul', 'systeminfo', messageData) : false;

                                //mqtt
                                const mqtt1 = mqttEnabled ? this.emit('mqtt', 'System Info', messageData) : false;
                                break;
                            case this.softwareInfoId:
                                const debug2 = debugLog ? this.emit('debug', `Software Info: ${stringifyMessage}`) : false;

                                const productName = messageData.product_name;
                                const deviceId = messageData.device_id;
                                const firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                                const match = productName.match(/\d+(\.\d+)?/);
                                this.webOS = match ? parseFloat(match[0]) : this.emit('error', `Unknown webOS system: ${match}.`);

                                this.emit('message', 'Connected.');
                                this.emit('deviceInfo', this.modelName, productName, deviceId, firmwareRevision, this.webOS);

                                //restFul
                                const restFul2 = restFulEnabled ? this.emit('restFul', 'softwareinfo', messageData) : false;

                                //mqtt
                                const mqtt2 = mqttEnabled ? this.emit('mqtt', 'Software Info', messageData) : false;
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
                                this.power = this.webOS >= 3.0 ? this.socketConnected && this.power : this.socketConnected;
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
                                this.emit('currentChannel', channelId, channelName, channelNumber);

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
                                const debug11 = debugLog ? this.emit('debug', this.emit('debug', `Response message id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case 'error':
                        const debug12 = debugLog ? this.emit('debug', `Error message id: ${messageId}, data: ${stringifyMessage}`) : false;
                        break;
                    default:
                        const debug13 = debugLog ? this.emit('debug', this.emit('debug', `Unknown message type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                        break;
                };

            }).on('error', (error) => {
                const debug = debugLog ? this.emit('debug', `Socket connect error: ${error}.`) : false;
                socket.emit('disconnect');
            }).on('disconnect', async () => {
                const emitMessage = this.socketConnected ? this.emit('message', 'Socket disconnected , trying to reconnect.') : false;
                this.socketConnected = false;

                //update TV state
                this.emit('powerState', false, false, false, false);
                this.emit('audioState', undefined, true);
                this.emit('pictureSettings', 0, 0, 0, 0, 3, false);
                this.emit('soundMode', undefined, false);
                this.power = false;
                this.cidCount = 0;

                //Prepare accessory
                const key = await this.readPairingKey(keyFile);
                const prepareAccessory = key.length > 10 && this.startPrepareAccessory ? this.emit('prepareAccessory') : false;
                this.startPrepareAccessory = false;

                await new Promise(resolve => setTimeout(resolve, 3500));
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

    getCid() {
        return new Promise((resolve, reject) => {
            try {
                this.cidCount++;
                const cid = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8) + (`000${(this.cidCount).toString(16)}`).slice(-4);
                resolve(cid);
            } catch (error) {
                reject(error);
            }
        });
    }

    send(type, uri, payload, cid) {
        return new Promise(async (resolve, reject) => {

            try {
                switch (type) {
                    case 'button':
                        if (!this.specjalizedSocketConnected) {
                            reject('Specjalized socket not connected.');
                            return;
                        };

                        payload = uri
                        const message = Object.keys(payload).reduce((acc, k) => {
                            return (acc.concat([`${k}:${payload[k]}`]));
                        }, [`type:${type}`]).join('\n') + '\n\n';

                        this.specializedSocket.send(message);
                        resolve();
                        break;
                    default:
                        if (!this.socketConnected) {
                            reject('Socket not connected.');
                            return;
                        };

                        cid = cid === undefined ? await this.getCid() : cid;
                        const message1 = JSON.stringify({
                            id: cid,
                            type: type,
                            uri: uri,
                            payload: payload
                        });

                        this.socket.send(message1);
                        resolve();
                        break
                };
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = LgWebOsSocket;