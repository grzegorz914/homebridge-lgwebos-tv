'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const tcpp = require('tcp-ping');
const EventEmitter = require('events');
const WebSocket = require('ws');
const CONSTANS = require('./constans.json');

class LgWebOsSocket extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const inputs = config.inputs;
        const keyFile = config.keyFile;
        const devInfoFile = config.devInfoFile;
        const inputsFile = config.inputsFile;
        const channelsFile = config.channelsFile;
        const getInputsFromDevice = config.getInputsFromDevice;
        const debugLog = config.debugLog;
        const restFulEnabled = config.restFulEnabled;
        const mqttEnabled = config.mqttEnabled;
        const sslWebSocket = config.sslWebSocket;
        const url = sslWebSocket ? CONSTANS.ApiUrls.WssUrl.replace('lgwebostv', host) : CONSTANS.ApiUrls.WsUrl.replace('lgwebostv', host);
        const webSocketPort = sslWebSocket ? 3001 : 3000;

        this.inputs = inputs;
        this.keyFile = keyFile;
        this.getInputsFromDevice = getInputsFromDevice;
        this.debugLog = debugLog;

        this.startPrepareAccessory = true;
        this.socketConnected = false;
        this.specjalizedSocketConnected = false;
        this.power = false;
        this.pixelRefresh = false;
        this.screenState = false;
        this.tvScreenState = 'Suspend';
        this.appId = '';
        this.cidCount = 0;
        this.webOS = 2.0;
        this.modelName = 'LG TV';

        this.connectSocket = async () => {
            //Read pairing key from file
            try {
                this.pairingKey = await this.readPairingKey(keyFile);
            } catch (error) {
                this.emit('error', `Read pairing key error: ${error}`);
            };

            //Socket
            const debug = debugLog ? this.emit('debug', `Connecting to ${sslWebSocket ? 'secure socket' : 'socket'}.`) : false;
            const socket = sslWebSocket ? new WebSocket(url, { rejectUnauthorized: false }) : new WebSocket(url);
            socket.on('open', async () => {
                const debug = debugLog ? this.emit('debug', `Socked connected.`) : false;
                this.socket = socket;
                this.socketConnected = true;
                clearInterval(this.pingTv);

                const heartbeat = setInterval(() => {
                    if (socket.readyState === socket.OPEN) {
                        const debug = debugLog ? this.emit('debug', `Socked send heartbeat.`) : false;
                        socket.ping(null, false, 'UTF-8');
                    }
                }, 5000);

                socket.on('pong', () => {
                    const debug = debugLog ? this.emit('debug', `Socked received heartbeat.`) : false;
                });

                socket.on('close', () => {
                    const debug = debugLog ? this.emit('debug', `Socked closed.`) : false;
                    clearInterval(heartbeat);
                    socket.emit('disconnect');
                });

                //Register to tv
                try {
                    CONSTANS.Pairing['client-key'] = this.pairingKey;
                    this.registerId = await this.getCid();
                    await this.send('register', undefined, CONSTANS.Pairing, this.registerId);
                } catch (error) {
                    this.emit('error', `Register error: ${error}`);
                };
            }).on('message', async (message) => {
                const parsedMessage = JSON.parse(message);
                const messageId = parsedMessage.id;
                const messageType = parsedMessage.type;
                const messageData = parsedMessage.payload;
                const stringifyMessage = JSON.stringify(messageData, null, 2);

                switch (messageId) {
                    case this.registerId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Start registering to TV: ${stringifyMessage}`) : false;
                                this.emit('message', 'Please accept authorization on TV.');
                                break;
                            case 'registered':
                                const debug1 = debugLog ? this.emit('debug', `Registered to TV with key: ${messageData['client-key']}`) : false;

                                //Save key in file if not saved before
                                const pairingKey = messageData['client-key'];
                                if (pairingKey !== this.pairingKey) {
                                    try {
                                        await this.savePairingKey(keyFile, pairingKey);
                                        this.emit('message', 'Pairing key saved.');
                                    } catch (error) {
                                        this.emit('error', `Pairing key save error: ${error}`);
                                    };
                                };

                                //Request specjalized socket
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                try {
                                    this.specjalizedSockedId = await this.getCid();
                                    await this.send('request', CONSTANS.ApiUrls.SocketUrl, undefined, this.specjalizedSockedId);
                                } catch (error) {
                                    this.emit('error', `Request specjalized socket error: ${error}`);
                                };
                                break;
                            case 'error':
                                const debug2 = debugLog ? this.emit('debug', `Register to TV error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug3 = debugLog ? this.emit('debug', this.emit('debug', `Register to TV unknown message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.specjalizedSockedId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Connecting to specjalized socket.`) : false;

                                const socketPath = messageData.socketPath;
                                const specializedSocket = sslWebSocket ? new WebSocket(socketPath, { rejectUnauthorized: false }) : new WebSocket(socketPath);
                                specializedSocket.on('open', async () => {
                                    const debug = debugLog ? this.emit('debug', `Specialized socket connected, path: ${socketPath}.`) : false;
                                    this.specializedSocket = specializedSocket;
                                    this.specjalizedSocketConnected = true;

                                    specializedSocket.on('close', () => {
                                        const debug = debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                                        specializedSocket.emit('disconnect');
                                    })

                                    //Request system info data
                                    try {
                                        this.systemInfoId = await this.getCid();
                                        await this.send('request', CONSTANS.ApiUrls.GetSystemInfo, undefined, this.systemInfoId);
                                    } catch (error) {
                                        this.emit('error', `Request system info error: ${error}`);
                                    };
                                }).on('error', (error) => {
                                    const debug = debugLog ? this.emit('debug', `Specjalized socket connect error: ${error}.`) : false;
                                    specializedSocket.emit('disconnect');
                                }).on('disconnect', () => {
                                    const message = this.specjalizedSocketConnected ? this.emit('message', 'Specjalized socket disconnected.') : false;
                                    this.specjalizedSocketConnected = false;
                                });
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `Connecting to specjalized socket error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Connecting to specjalized socket unknown message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.systemInfoId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `System info: ${stringifyMessage}`) : false;
                                this.modelName = messageData.modelName ?? 'LG TV';

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'systeminfo', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'System info', messageData) : false;

                                //Request software info data
                                try {
                                    this.softwareInfoId = await this.getCid();
                                    await this.send('request', CONSTANS.ApiUrls.GetSoftwareInfo, undefined, this.softwareInfoId);
                                } catch (error) {
                                    this.emit('error', `Request software info error: ${error}`);
                                };
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `System info error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `System info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.softwareInfoId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Software Info: ${stringifyMessage}`) : false;

                                const productName = messageData.product_name;
                                const deviceId = messageData.device_id;
                                const firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                                const match = productName.match(/\d+(\.\d+)?/);
                                this.webOS = match ? parseFloat(match[0]) : this.webOS;

                                //save device info to the file
                                await this.saveDevInfo(devInfoFile, this.modelName, productName, deviceId, firmwareRevision, this.webOS);

                                //emit device info
                                this.emit('deviceInfo', this.modelName, productName, deviceId, firmwareRevision);

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'softwareinfo', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Software info', messageData) : false;

                                //Request channels list
                                try {
                                    this.channelsId = await this.getCid();
                                    await this.send('request', CONSTANS.ApiUrls.GetChannelList, undefined, this.channelsId);
                                } catch (error) {
                                    this.emit('error', `Request channels error: ${error}`);
                                };

                                //Request apps list
                                try {
                                    this.appsId = await this.getCid();
                                    await this.send('request', CONSTANS.ApiUrls.GetInstalledApps, undefined, this.appsId);
                                } catch (error) {
                                    this.emit('error', `Request apps error: ${error}`);
                                };

                                await new Promise(resolve => setTimeout(resolve, 1500));
                                //Start prepare accessory
                                try {
                                    const prepareAccessory = this.startPrepareAccessory ? await this.prepareAccessory() : false;
                                } catch (error) {
                                    this.emit('error', `Prepare accessory error: ${error}.`);
                                }

                                await new Promise(resolve => setTimeout(resolve, 2500));
                                //Subscribe tv status
                                try {
                                    const debug = debugLog ? this.emit('debug', `Subscirbe tv status.`) : false;
                                    await this.subscribeTvStatus();
                                    const debug1 = debugLog ? this.emit('debug', `Subscribe tv status successful.`) : false;
                                } catch (error) {
                                    this.emit('error', `Subscribe tv status error: ${error}`);
                                };
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `Software info error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Software info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.channelsId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Channels list: ${stringifyMessage}`) : false;
                                const channelsList = messageData.channelList;
                                const channelListExist = Array.isArray(channelsList) ? channelsList.length > 0 : false;
                                if (!channelListExist) {
                                    return;
                                };

                                //save channels to the file
                                await this.saveChannels(channelsFile, channelsList);

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'channels', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Channels', messageData) : false;
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `Channels error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Channels list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.appsId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Apps list: ${stringifyMessage}`) : false;
                                const appsList = messageData.apps;
                                const appsListExist = Array.isArray(appsList) ? appsList.length > 0 : false;
                                if (!appsListExist) {
                                    return;
                                };

                                //save apps to the file
                                await this.saveInputs(inputsFile, appsList);

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'apps', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Apps', messageData) : false;
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `Apps list error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Apps list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.powerStateId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Power: ${stringifyMessage}`) : false;

                                switch (messageData.state) {
                                    case 'Active':
                                        this.power = true;
                                        this.screenState = true;
                                        this.pixelRefresh = false;
                                        this.tvScreenState = 'Active';
                                        break;
                                    case 'Active Standby':
                                        this.power = false;
                                        this.screenState = false;
                                        this.pixelRefresh = true;
                                        this.tvScreenState = 'Active Standby';
                                        break;
                                    case 'Screen Saver':
                                        this.power = true;
                                        this.screenState = true;
                                        this.pixelRefresh = false;
                                        this.tvScreenState = 'Screen Saver';
                                        break;
                                    case 'Screen Off':
                                        this.power = true;
                                        this.screenState = false;
                                        this.pixelRefresh = false;
                                        this.tvScreenState = 'Screen Off';
                                        break;
                                    case 'Suspend':
                                        this.power = false;
                                        this.screenState = false;
                                        this.pixelRefresh = false;
                                        this.tvScreenState = 'Suspend';
                                        break;
                                    default:
                                        this.tvScreenState = messageData.state;
                                        this.emit('debug', `Unknown power state: ${this.tvScreenState}`);
                                        break;
                                }

                                this.emit('powerState', this.power, this.pixelRefresh, this.screenState, this.tvScreenState);
                                const disconnect = !this.power ? socket.emit('powerOff') : false;

                                //emit screen saver as appId
                                const emitAppId = this.tvScreenState === 'Screen Saver' ? this.emit('currentApp', 'com.webos.app.screensaver') : this.emit('currentApp', this.appId);

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'power', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Power', messageData) : false;
                                break;
                            case 'error':
                                if (this.webOS < 3.0) {
                                    this.power = this.socketConnected;
                                    this.tvScreenState = this.socketConnected ? 'Active' : 'Suspend';
                                    this.emit('powerState', this.power, this.pixelRefresh, this.screenState, this.tvScreenState);
                                    const disconnect = !this.power ? socket.emit('powerOff') : false;
                                    const debug1 = debugLog ? this.emit('debug', `Installed system webOS: ${this.webOS}`) : false;
                                } else {
                                    const debug1 = debugLog ? this.emit('debug', `Power error: ${stringifyMessage}`) : false;
                                }
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Power received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.currentAppId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `App: ${stringifyMessage}`) : false;
                                const appId = messageData.appId;

                                this.emit('currentApp', appId);
                                this.appId = appId;

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'currentapp', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Current App', messageData) : false;
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `App error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `App received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.audioStateId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Audio: ${stringifyMessage}`) : false;
                                const messageDataKeys = Object.keys(messageData);
                                const scenarioExist = messageDataKeys.includes('scenario');
                                const volumeStatusExist = messageDataKeys.includes('volumeStatus');
                                const volumeStatusKeys = volumeStatusExist ? Object.keys(messageData.volumeStatus) : false;
                                const soundOutputExist = volumeStatusKeys ? volumeStatusKeys.includes('soundOutput') : false;

                                //data
                                const audioOutput = scenarioExist ? messageData.scenario : soundOutputExist ? messageData.volumeStatus.soundOutput : undefined;
                                const volume = messageData.volume < 0 ? 0 : messageData.volume;
                                const mute = messageData.mute;
                                this.emit('audioState', volume, mute, audioOutput);

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'audio', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Audio', messageData) : false;
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `Audio error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Audio received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.currentChannelId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Channel: ${stringifyMessage}`) : false;
                                const channelId = messageData.channelId;
                                const channelName = messageData.channelName;
                                const channelNumber = messageData.channelNumber;

                                this.emit('currentChannel', channelId, channelName, channelNumber);

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'currentchannel', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Current Channel', messageData) : false;
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `Channel error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Channel received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.pictureSettingsId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Picture: ${stringifyMessage}`) : false;
                                const brightness = messageData.settings.brightness;
                                const backlight = messageData.settings.backlight;
                                const contrast = messageData.settings.contrast;
                                const color = messageData.settings.color;
                                const pictureMode = 3;
                                this.emit('pictureSettings', brightness, backlight, contrast, color, pictureMode, this.power);

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'picturesettings', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Picture Settings', messageData) : false;
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `Picture error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Picture received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    case this.soundModeId:
                        switch (messageType) {
                            case 'response':
                                const debug = debugLog ? this.emit('debug', `Sound mode: ${stringifyMessage}`) : false;
                                const soundMode = messageData.settings.soundMode;
                                this.emit('soundMode', soundMode, this.power);

                                //restFul
                                const restFul = restFulEnabled ? this.emit('restFul', 'soundmode', messageData) : false;

                                //mqtt
                                const mqtt = mqttEnabled ? this.emit('mqtt', 'Sound Mode', messageData) : false;
                                break;
                            case 'error':
                                const debug1 = debugLog ? this.emit('debug', `Sound mode error: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug2 = debugLog ? this.emit('debug', this.emit('debug', `Sound mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                break;
                        };
                        break;
                    default:
                        switch (messageType) {
                            case 'response':
                                const debug1 = debugLog ? this.emit('debug', `Received response message: ${stringifyMessage}`) : false;
                            case 'error':
                                const debug2 = debugLog ? this.emit('debug', `Received error message: ${stringifyMessage}`) : false;
                                break;
                            default:
                                const debug3 = debugLog ? this.emit('debug', `Received message type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`) : false;
                                break;
                        };
                        break;
                };
            }).on('error', (error) => {
                const debug = debugLog ? this.emit('debug', `Socket connect error: ${error}.`) : false;
                socket.emit('disconnect');
            }).on('powerOff', async () => {
                //update TV state
                this.emit('powerState', false, this.pixelRefresh, this.screenState, this.tvScreenState);
                this.emit('audioState', undefined, true);
                this.emit('pictureSettings', 0, 0, 0, 0, 3, false);
                this.emit('soundMode', undefined, false);
            }).on('disconnect', async () => {
                const message = this.socketConnected ? this.emit('message', 'Socket disconnected.') : false;
                this.socketConnected = false;
                this.cidCount = 0;
                this.power = false;
                this.pixelRefresh = false;
                this.screenState = false;
                this.tvScreenState = 'Suspend';

                //update TV state
                this.emit('powerState', false, false, false, 'Suspend');
                this.emit('audioState', undefined, true);
                this.emit('pictureSettings', 0, 0, 0, 0, 3, false);
                this.emit('soundMode', undefined, false);
            });
        }

        //ping tv
        setInterval(() => {
            if (this.socketConnected) {
                return;
            }

            const debug = debugLog ? this.emit('debug', `Plugin send heartbeat to TV.`) : false;
            tcpp.probe(host, webSocketPort, (error, online) => {
                if (online && !this.socketConnected) {
                    const debug1 = debugLog ? this.emit('debug', `Plugin received heartbeat from TV.`) : false;
                    this.connectSocket();
                    return;
                }

                setTimeout(async () => {
                    try {
                        const prepare = this.startPrepareAccessory && !this.socketConnected ? await this.prepareAccessory() : false;
                    } catch (error) {
                        this.emit('error', `Prepare accessory error: ${error}.`);
                    }
                }, 5500);
            });
        }, 10000);
    };

    readPairingKey(path) {
        return new Promise(async (resolve, reject) => {
            try {
                const key = await fsPromises.readFile(path);
                const pairingKey = key.length > 10 ? key.toString() : '0';
                resolve(pairingKey);
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

    saveDevInfo(path, modelName, productName, deviceId, firmwareRevision, webOS) {
        return new Promise(async (resolve, reject) => {
            try {
                const obj = {
                    manufacturer: 'LG Electronics',
                    modelName: modelName,
                    productName: productName,
                    deviceId: deviceId,
                    firmwareRevision: firmwareRevision,
                    webOS: webOS
                };
                const info = JSON.stringify(obj, null, 2);
                await fsPromises.writeFile(path, info);
                const debug = this.debugLog ? this.emit('debug', `Saved device info: ${info}`) : false;

                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    saveChannels(path, channelsList) {
        return new Promise(async (resolve, reject) => {
            try {
                const channelsArr = [];
                for (const channel of channelsList) {
                    const name = channel.channelName;
                    const channelId = channel.channelId;
                    const number = channel.channelNumber;
                    const channelsObj = {
                        'name': name,
                        'reference': channelId,
                        'number': number,
                        'mode': 1
                    }
                    channelsArr.push(channelsObj);
                };
                const channels = JSON.stringify(channelsArr, null, 2);
                await fsPromises.writeFile(path, channels);
                const debug = this.enableDebugMode ? this.emit('debug', `Channels list saved: ${channels}`) : false;

                resolve()
            } catch (error) {
                reject(error);
            }
        });
    };

    saveInputs(path, appsList) {
        return new Promise(async (resolve, reject) => {
            try {
                const appsArr = [];
                for (const app of appsList) {
                    const name = app.title;
                    const appId = app.id;
                    const inputsObj = {
                        'name': name,
                        'reference': appId,
                        'mode': 0
                    }
                    appsArr.push(inputsObj);
                };

                const allInputsArr = this.getInputsFromDevice ? appsArr : this.inputs;
                const inputs = JSON.stringify(allInputsArr, null, 2)
                await fsPromises.writeFile(path, inputs);
                const debug = this.debugLog ? this.emit('debug', `Apps list saved: ${inputs}`) : false;

                resolve()
            } catch (error) {
                reject(error);
            }
        });
    };

    prepareAccessory() {
        return new Promise(async (resolve, reject) => {
            try {
                const pairingKey = await this.readPairingKey(this.keyFile);
                if (pairingKey === '0') {
                    reject(`Prepare accessory not possible, pairing key: ${pairingKey}.`);
                }

                this.startPrepareAccessory = false;
                this.emit('prepareAccessory');
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    subscribeTvStatus() {
        return new Promise(async (resolve, reject) => {
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
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    getCid() {
        return new Promise((resolve, reject) => {
            try {
                this.cidCount++;
                const randomPart = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8);
                const counterPart = (`000${(this.cidCount).toString(16)}`).slice(-4);
                const cid = randomPart + counterPart;
                resolve(cid);
            } catch (error) {
                reject(error);
            }
        });
    }

    getCids(type) {
        return new Promise((resolve, reject) => {
            try {
                switch (type) {
                    case 'Power':
                        resolve(this.powerStateId);
                        break;
                    case 'App':
                        resolve(this.currentAppId);
                        break;
                    case 'Channel':
                        resolve(this.currentChannelId);
                        break;
                    case 'Audio':
                        resolve(this.audioStateId);
                        break;
                    case 'Picture':
                        resolve(this.pictureSettingsId);
                        break;
                }
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
                        };

                        const keyValuePairs = Object.entries(payload).map(([key, value]) => `${key}:${value}`);
                        keyValuePairs.unshift(`type:${type}`);
                        const message = keyValuePairs.join('\n') + '\n\n';

                        this.specializedSocket.send(message);
                        resolve();
                        break;
                    default:
                        if (!this.socketConnected) {
                            reject('Socket not connected.');
                        };

                        cid = cid === undefined ? await this.getCid() : cid;
                        const data = {
                            id: cid,
                            type: type,
                            uri: uri,
                            payload: payload
                        };

                        const message1 = JSON.stringify(data);
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