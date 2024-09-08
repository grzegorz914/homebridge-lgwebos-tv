'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const tcpp = require('tcp-ping');
const EventEmitter = require('events');
const WebSocket = require('ws');
const CONSTANTS = require('./constants.json');

class LgWebOsSocket extends EventEmitter {
    constructor(config) {
        super();
        this.host = config.host;
        this.inputs = config.inputs;
        this.keyFile = config.keyFile;
        this.devInfoFile = config.devInfoFile;
        this.inputsFile = config.inputsFile;
        this.channelsFile = config.channelsFile;
        this.getInputsFromDevice = config.getInputsFromDevice;
        this.filterSystemApps = config.filterSystemApps;
        this.serviceMenu = config.serviceMenu;
        this.ezAdjustMenu = config.ezAdjustMenu;
        this.debugLog = config.debugLog;
        this.sslWebSocket = config.sslWebSocket;
        this.url = this.sslWebSocket ? CONSTANTS.ApiUrls.WssUrl.replace('lgwebostv', this.host) : CONSTANTS.ApiUrls.WsUrl.replace('lgwebostv', this.host);
        this.webSocketPort = this.sslWebSocket ? 3001 : 3000;

        this.externalInputsArr = [];
        this.socketConnected = false;
        this.specjalizedSocketConnected = false;
        this.power = false;
        this.screenState = 'Suspend';
        this.appId = '';
        this.volume = 0;
        this.mute = true;

        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.picturedMode = '';
        this.soundMode = '';
        this.soundOutput = '';

        this.cidCount = 0;
        this.webOS = 2.0;
        this.modelName = 'LG TV';

        //ping tv
        setInterval(() => {
            if (this.socketConnected) {
                return;
            }

            const debug = this.debugLog ? this.emit('debug', `Plugin send heartbeat to TV.`) : false;
            tcpp.probe(this.host, this.webSocketPort, async (error, online) => {
                if (online && !this.socketConnected) {
                    const debug1 = this.debugLog ? this.emit('debug', `Plugin received heartbeat from TV.`) : false;
                    await this.connect();
                    return;
                }

                setTimeout(async () => {
                    try {
                        const prepare = !this.socketConnected ? await this.prepareAccessory() : false;
                    } catch (error) {
                        throw new Error(`Prepare accessory error: ${error}.`);
                    }
                }, 5500);
            });
        }, 10000);
    };

    async connect() {
        //Read pairing key from file
        try {
            const pairingKey = await this.readData(this.keyFile);
            this.pairingKey = pairingKey.length > 10 ? pairingKey.toString() : '0';
        } catch (error) {
            this.emit('warn', `Read pairing key error: ${error}`);
        };

        //Socket
        const debug = this.debugLog ? this.emit('debug', `Connecting to ${this.sslWebSocket ? 'secure socket' : 'socket'}.`) : false;
        const socket = this.sslWebSocket ? new WebSocket(this.url, { rejectUnauthorized: false }) : new WebSocket(this.url);
        socket.on('open', async () => {
            const debug = this.debugLog ? this.emit('debug', `Socked connected.`) : false;
            this.socket = socket;
            this.socketConnected = true;

            //connect to deice success
            this.emit('success', `Socket Connect Success.`)

            clearInterval(this.pingTv);
            const heartbeat = setInterval(() => {
                if (socket.readyState === socket.OPEN) {
                    const debug = this.debugLog ? this.emit('debug', `Socked send heartbeat.`) : false;
                    socket.ping(null, false, 'UTF-8');
                }
            }, 5000);

            socket.on('pong', () => {
                const debug = this.debugLog ? this.emit('debug', `Socked received heartbeat.`) : false;
            });

            socket.on('close', () => {
                const debug = this.debugLog ? this.emit('debug', `Socked closed.`) : false;
                clearInterval(heartbeat);
                socket.emit('disconnect');
            });

            //Register to tv
            try {
                CONSTANTS.Pairing['client-key'] = this.pairingKey;
                this.registerId = await this.getCid();
                await this.send('register', undefined, CONSTANTS.Pairing, this.registerId);
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
                            const debug = this.debugLog ? this.emit('debug', `Start registering to TV: ${stringifyMessage}`) : false;
                            this.emit('message', 'Please accept authorization on TV.');
                            break;
                        case 'registered':
                            const debug1 = this.debugLog ? this.emit('debug', `Registered to TV with key: ${messageData['client-key']}`) : false;

                            //Save key in file if not saved before
                            const pairingKey = messageData['client-key'];
                            if (pairingKey !== this.pairingKey) {
                                try {
                                    await this.savePairingKey(this.keyFile, pairingKey);
                                    this.emit('message', 'Pairing key saved.');
                                } catch (error) {
                                    this.emit('warn', `Pairing key save error: ${error}`);
                                };
                            };

                            //Request specjalized socket
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            this.specjalizedSockedId = await this.getCid();
                            try {
                                await this.send('request', CONSTANTS.ApiUrls.SocketUrl, undefined, this.specjalizedSockedId);
                            } catch (error) {
                                this.emit('error', `Request specjalized socket error: ${error}.`);
                                await new Promise(resolve => setTimeout(resolve, 5000));
                                await this.send('request', CONSTANTS.ApiUrls.SocketUrl, undefined, this.specjalizedSockedId);
                            };
                            break;
                        case 'error':
                            const debug2 = this.debugLog ? this.emit('debug', `Register to TV error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug3 = this.debugLog ? this.emit('debug', this.emit('debug', `Register to TV unknown message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.specjalizedSockedId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Connecting to specjalized socket.`) : false;

                            const socketPath = messageData.socketPath;
                            const specializedSocket = this.sslWebSocket ? new WebSocket(socketPath, { rejectUnauthorized: false }) : new WebSocket(socketPath);
                            specializedSocket.on('open', async () => {
                                const debug = this.debugLog ? this.emit('debug', `Specialized socket connected, path: ${socketPath}.`) : false;
                                this.specializedSocket = specializedSocket;
                                this.specjalizedSocketConnected = true;

                                //connect to deice success
                                this.emit('success', `Specjalized Socket Connect Success.`)

                                specializedSocket.on('close', () => {
                                    const debug = this.debugLog ? this.emit('debug', 'Specialized socket closed.') : false;
                                    specializedSocket.emit('disconnect');
                                })

                                //Request system info data
                                try {
                                    this.systemInfoId = await this.getCid();
                                    await this.send('request', CONSTANTS.ApiUrls.GetSystemInfo, undefined, this.systemInfoId);
                                } catch (error) {
                                    this.emit('error', `Request system info error: ${error}`);
                                };
                            }).on('error', async (error) => {
                                const debug = this.debugLog ? this.emit('debug', `Specjalized socket connect error: ${error}.`) : false;
                                specializedSocket.emit('disconnect');
                                await new Promise(resolve => setTimeout(resolve, 5000));
                                await this.send('request', CONSTANTS.ApiUrls.SocketUrl, undefined, this.specjalizedSockedId);
                            }).on('disconnect', () => {
                                const message = this.specjalizedSocketConnected ? this.emit('message', 'Specjalized socket disconnected.') : false;
                                this.specjalizedSocketConnected = false;
                            });
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Connecting to specjalized socket error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Connecting to specjalized socket unknown message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.systemInfoId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `System info: ${stringifyMessage}`) : false;
                            this.modelName = messageData.modelName ?? 'LG TV';

                            //restFul
                            this.emit('restFul', 'systeminfo', messageData);

                            //mqtt
                            this.emit('mqtt', 'System info', messageData);

                            //Request software info data
                            try {
                                this.softwareInfoId = await this.getCid();
                                await this.send('request', CONSTANTS.ApiUrls.GetSoftwareInfo, undefined, this.softwareInfoId);
                            } catch (error) {
                                this.emit('error', `Request software info error: ${error}`);
                            };
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `System info error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `System info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.softwareInfoId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Software Info: ${stringifyMessage}`) : false;

                            const productName = messageData.product_name;
                            const deviceId = messageData.device_id;
                            const firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                            const match = productName.match(/\d+(\.\d+)?/);
                            this.webOS = match ? parseFloat(match[0]) : this.webOS;

                            //save device info to the file
                            const obj = {
                                manufacturer: 'LG Electronics',
                                modelName: this.modelName,
                                productName: productName,
                                deviceId: deviceId,
                                firmwareRevision: firmwareRevision,
                                webOS: this.webOS
                            };
                            await this.saveData(this.devInfoFile, obj);

                            //emit device info
                            this.emit('deviceInfo', this.modelName, productName, deviceId, firmwareRevision);

                            //restFul
                            this.emit('restFul', 'softwareinfo', messageData);

                            //mqtt
                            this.emit('mqtt', 'Software info', messageData);

                            //Request channels list
                            try {
                                this.channelsId = await this.getCid();
                                await this.send('request', CONSTANTS.ApiUrls.GetChannelList, undefined, this.channelsId);
                            } catch (error) {
                                this.emit('error', `Request channels error: ${error}`);
                            };

                            //Request external inputs list
                            try {
                                this.externalInputListId = await this.getCid();
                                await this.send('subscribe', CONSTANTS.ApiUrls.GetExternalInputList, undefined, this.externalInputListId);
                            } catch (error) {
                                this.emit('error', `Request external inputs error: ${error}`);
                            };

                            //Request apps list
                            try {
                                this.appsId = await this.getCid();
                                await this.send('request', CONSTANTS.ApiUrls.GetInstalledApps, undefined, this.appsId);
                            } catch (error) {
                                this.emit('error', `Request apps error: ${error}`);
                            };

                            //Start prepare accessory
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            try {
                                await this.prepareAccessory();
                            } catch (error) {
                                this.emit('error', `Prepare accessory error: ${error}.`);
                            }

                            //Subscribe tv status
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            try {
                                const debug = this.debugLog ? this.emit('debug', `Subscirbe tv status.`) : false;
                                await this.subscribeTvStatus();
                                const debug1 = this.debugLog ? this.emit('debug', `Subscribe tv status successful.`) : false;
                            } catch (error) {
                                this.emit('error', `Subscribe tv status error: ${error}`);
                            };
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Software info error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Software info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.channelsId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Channels list: ${stringifyMessage}`) : false;
                            const channelsList = messageData.channelList;
                            const channelListExist = Array.isArray(channelsList) ? channelsList.length > 0 : false;
                            if (!channelListExist) {
                                return;
                            };

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

                            //save channels to the file
                            await this.saveData(this.channelsFile, channelsArr);

                            //restFul
                            this.emit('restFul', 'channels', messageData);

                            //mqtt
                            this.emit('mqtt', 'Channels', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Channels error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Channels list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.externalInputListId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `External input list: ${stringifyMessage}`) : false;
                            const externalInputList = messageData.devices;
                            const externalInputListExist = Array.isArray(externalInputList) ? externalInputList.length > 0 : false;
                            if (!externalInputListExist) {
                                return;
                            };

                            //parse inputs
                            for (const input of externalInputList) {
                                const name = input.label;
                                const reference = input.appId;
                                const mode = 0;
                                const obj = {
                                    'name': name,
                                    'reference': reference,
                                    'mode': mode
                                }
                                this.externalInputsArr.push(obj);
                            };

                            //restFul
                            this.emit('restFul', 'externalinputlist', messageData);

                            //mqtt
                            this.emit('mqtt', 'External Input List', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `External input list error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `External input list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.appsId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Apps list: ${stringifyMessage}`) : false;
                            const appsList = messageData.apps;
                            const appsListExist = Array.isArray(appsList) ? appsList.length > 0 : false;
                            if (!appsListExist) {
                                return;
                            };

                            //parse apps
                            const appsArr = [];
                            for (const input of appsList) {
                                const name = input.title;
                                const reference = input.id;
                                const mode = 0;
                                const obj = {
                                    'name': name,
                                    'reference': reference,
                                    'mode': mode
                                }
                                appsArr.push(obj);
                            };

                            //add service menu
                            const serviceMenuInput = {
                                'name': 'Service Menu',
                                'reference': 'service.menu',
                                'mode': 0
                            };
                            const pushServiceMenu = this.serviceMenu ? appsArr.push(serviceMenuInput) : false;

                            //add ez adjust menu
                            const ezAdjustMenuInput = {
                                'name': 'EZ Adjust',
                                'reference': 'ez.adjust',
                                'mode': 0
                            };
                            const pushEzAdjusteMenu = this.ezAdjustMenu ? appsArr.push(ezAdjustMenuInput) : false;

                            //add external inputs and apps to array
                            const inputsApps = this.getInputsFromDevice ? [...this.externalInputsArr, ...appsArr] : this.inputs;

                            //chack duplicated object in array and filter system apps
                            const inputsArr = [];
                            for (const input of inputsApps) {
                                const inputName = input.name;
                                const inputReference = input.reference;
                                const duplicatedInput = inputsArr.some(input => input.reference === inputReference);
                                const filter = this.filterSystemApps ? CONSTANTS.SystemApps.includes(inputReference) : false;
                                const push = inputName && inputReference && !filter && !duplicatedInput ? inputsArr.push(input) : false;
                            }

                            //save apps to the file                             
                            await this.saveData(this.inputsFile, inputsArr);

                            //restFul
                            this.emit('restFul', 'apps', messageData);

                            //mqtt
                            this.emit('mqtt', 'Apps', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Apps list error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Apps list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.powerStateId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Power: ${stringifyMessage}`) : false;

                            switch (messageData.state) {
                                case 'Active':
                                    this.power = true;
                                    this.screenState = 'Active';
                                    break;
                                case 'Active Standby':
                                    this.power = false;
                                    this.screenState = 'Active Standby';
                                    break;
                                case 'Screen Saver':
                                    this.power = true;
                                    this.screenState = 'Screen Saver';
                                    break;
                                case 'Screen Off':
                                    this.power = true;
                                    this.screenState = 'Screen Off';
                                    break;
                                case 'Suspend':
                                    this.power = false;
                                    this.screenState = 'Suspend';
                                    break;
                                default:
                                    this.screenState = messageData.state;
                                    const debug1 = this.debugLog ? this.emit('debug', `Unknown power state: ${this.screenState}`) : false;
                                    break;
                            }

                            this.emit('powerState', this.power, this.screenState);
                            const disconnect = !this.power ? socket.emit('powerOff') : false;
                            const emit = this.screenState === 'Screen Saver' ? this.emit('currentApp', 'com.webos.app.screensaver') : this.emit('currentApp', this.appId);

                            //restFul
                            this.emit('restFul', 'power', messageData);

                            //mqtt
                            this.emit('mqtt', 'Power', messageData);
                            break;
                        case 'error':
                            if (this.webOS < 3.0) {
                                this.power = this.socketConnected;
                                this.screenState = this.socketConnected ? 'Active' : 'Suspend';
                                this.emit('powerState', this.power, this.screenState);
                                const disconnect = !this.power ? socket.emit('powerOff') : false;
                                const debug1 = this.debugLog ? this.emit('debug', `Installed system webOS: ${this.webOS}`) : false;
                            } else {
                                const debug1 = this.debugLog ? this.emit('debug', `Power error: ${stringifyMessage}`) : false;
                            }
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Power received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.currentAppId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `App: ${stringifyMessage}`) : false;
                            const appId = messageData.appId ?? false;
                            if (!appId) {
                                return;
                            };

                            const app = appId === 'com.webos.app.factorywin' ? 'service.menu' : appId
                            const emit = this.screenState === 'Screen Saver' ? this.emit('currentApp', 'com.webos.app.screensaver') : this.emit('currentApp', app);
                            this.appId = app;

                            //restFul
                            this.emit('restFul', 'currentapp', messageData);

                            //mqtt
                            this.emit('mqtt', 'Current App', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `App error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `App received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.audioStateId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Audio: ${stringifyMessage}`) : false;
                            const messageDataKeys = Object.keys(messageData);
                            const scenarioExist = messageDataKeys.includes('scenario');
                            const volumeStatusExist = messageDataKeys.includes('volumeStatus');
                            const volumeStatusKeys = volumeStatusExist ? Object.keys(messageData.volumeStatus) : false;
                            const soundOutputExist = volumeStatusKeys ? volumeStatusKeys.includes('soundOutput') : false;

                            //data
                            const volume = messageData.volume ?? -1;
                            const mute = messageData.mute === true;
                            if (volume === -1) {
                                return;
                            };;

                            this.emit('audioState', volume, mute);
                            this.volume = volume;
                            this.mute = mute

                            //restFul
                            this.emit('restFul', 'audio', messageData);

                            //mqtt
                            this.emit('mqtt', 'Audio', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Audio error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Audio received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.currentChannelId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Channel: ${stringifyMessage}`) : false;
                            const channelId = messageData.channelId ?? false;
                            const channelName = messageData.channelName;
                            const channelNumber = messageData.channelNumber;
                            if (!channelId) {
                                return;
                            };

                            this.emit('currentChannel', channelId, channelName, channelNumber);

                            //restFul
                            this.emit('restFul', 'currentchannel', messageData);

                            //mqtt
                            this.emit('mqtt', 'Current Channel', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Channel error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Channel received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.pictureSettingsId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Picture settings: ${stringifyMessage}`) : false;
                            const brightness = messageData.settings.brightness ?? this.brightness;
                            const backlight = messageData.settings.backlight ?? this.backlight;
                            const contrast = messageData.settings.contrast ?? this.contrast;
                            const color = messageData.settings.color ?? this.color;

                            this.brightness = brightness;
                            this.backlight = backlight;
                            this.contrast = contrast;
                            this.color = color;

                            this.emit('pictureSettings', brightness, backlight, contrast, color, this.power);
                            this.emit('pictureMode', 'Unknown', this.power);

                            //restFul
                            this.emit('restFul', 'picturesettings', messageData);

                            //mqtt
                            this.emit('mqtt', 'Picture Settings', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Picture settings error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Picture settings received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.pictureModeId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Picture mode: ${stringifyMessage}`) : false;
                            const pictureMode = stringifyMessage.pictureMode ?? false;
                            if (!pictureMode) {
                                return;
                            }

                            this.emit('pictureMode', pictureMode, this.power);
                            this.pictureMode = pictureMode;

                            //restFul
                            this.emit('restFul', 'picturemode', messageData);

                            //mqtt
                            this.emit('mqtt', 'Picture Mode', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Picture mode error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Picture mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.soundModeId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Sound mode: ${stringifyMessage}`) : false;
                            const soundMode = messageData.settings.soundMode ?? false;
                            if (!soundMode) {
                                return;
                            }

                            this.emit('soundMode', soundMode, this.power);
                            this.soundMode = soundMode;

                            //restFul
                            this.emit('restFul', 'soundmode', messageData);

                            //mqtt
                            this.emit('mqtt', 'Sound Mode', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Sound mode error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Sound mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.soundOutputId:
                    switch (messageType) {
                        case 'response':
                            const debug = this.debugLog ? this.emit('debug', `Sound output: ${stringifyMessage}`) : false;
                            const soundOutput = messageData.soundOutput ?? false;
                            if (!soundOutput) {
                                return;
                            }

                            this.emit('soundOutput', soundOutput, this.power);
                            this.soundOutput = soundOutput;

                            //restFul
                            this.emit('restFul', 'soundoutput', messageData);

                            //mqtt
                            this.emit('mqtt', 'Sound Output', messageData);
                            break;
                        case 'error':
                            const debug1 = this.debugLog ? this.emit('debug', `Sound output error: ${stringifyMessage}`) : false;
                            break;
                        default:
                            const debug2 = this.debugLog ? this.emit('debug', this.emit('debug', `Sound output received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                            break;
                    };
                    break;
                case this.alertCid:
                    const debug = this.debugLog ? this.emit('debug', `Alert: ${stringifyMessage}`) : false;
                    const alertId = messageData.alertId ?? false;
                    if (!alertId) {
                        return;
                    }

                    const closeAlert = this.webOS >= 4.0 ? await this.send('request', CONSTANTS.ApiUrls.CloseAletrt, { alertId: alertId }) : await this.send('button', undefined, { name: 'ENTER' });
                    break;
                case this.toastCid:
                    const debug1 = this.debugLog ? this.emit('debug', `Toast: ${stringifyMessage}`) : false;
                    const toastId = messageData.toastId ?? false;
                    if (!toastId) {
                        return;
                    }

                    const closeToast = this.webOS >= 4.0 ? await this.send('request', CONSTANTS.ApiUrls.CloseToast, { toastId: toastId }) : await this.send('button', undefined, { name: 'ENTER' });
                    break;
                default:
                    const debug3 = this.debugLog ? this.emit('debug', `Received message type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`) : false;
                    break;
            };
        }).on('error', (error) => {
            const debug = this.debugLog ? this.emit('debug', `Socket connect error: ${error}.`) : false;
            socket.emit('disconnect');
        }).on('powerOff', async () => {
            //update TV state
            this.emit('powerState', false, this.screenState);
            this.emit('audioState', this.volume, true);
            this.emit('pictureSettings', 0, 0, 0, 0, false);
            this.emit('pictureMode', 'Unknown', false);
            this.emit('soundMode', this.soundMode, false);
            this.emit('soundOutput', this.soundOutput, false);
        }).on('disconnect', async () => {
            const message = this.socketConnected ? this.emit('message', 'Socket disconnected.') : false;
            this.socketConnected = false;
            this.cidCount = 0;
            this.power = false;
            this.screenState = 'Suspend';

            //update TV state
            this.emit('powerState', false, 'Suspend');
            this.emit('audioState', this.volume, true);
            this.emit('pictureSettings', 0, 0, 0, 0, false);
            this.emit('pictureMode', this.pictureMode, false);
            this.emit('soundMode', this.soundMode, false);
            this.emit('soundOutput', this.soundOutput, false);
        });

        return true;
    }

    async savePairingKey(path, data) {
        try {
            await fsPromises.writeFile(path, data);
            const debug = this.debugLog ? this.emit('debug', `Saved payring key: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save payring key error: ${error.message || error}}`);
        };
    };

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            const debug = this.debugLog ? this.emit('debug', `Saved data: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error.message || error}}`);
        };
    };

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            const debug = this.debugLog ? this.emit('debug', `Read data: ${JSON.stringify(data, null, 2)}`) : false;
            return data;;
        } catch (error) {
            throw new Error(`Read data error: ${error}`);
        };
    }

    async prepareAccessory() {
        try {
            const pairingKey = await this.readData(this.keyFile);
            const key = pairingKey.length > 10 ? pairingKey.toString() : '0';
            if (key === '0') {
                this.emit('warn', `Prepare accessory not possible, pairing key: ${key}.`);
                return;
            }

            //start external integration
            this.emit('externalIntegration');

            //prepare accessory
            this.emit('prepareAccessory');

            return true;
        } catch (error) {
            throw new Error(error.message ?? error);
        }
    }

    async subscribeTvStatus() {
        try {
            this.powerStateId = await this.getCid();
            await this.send('subscribe', CONSTANTS.ApiUrls.GetPowerState, undefined, this.powerStateId);
            this.currentAppId = await this.getCid();
            await this.send('subscribe', CONSTANTS.ApiUrls.GetForegroundAppInfo, undefined, this.currentAppId);
            this.currentChannelId = await this.getCid();
            await this.send('subscribe', CONSTANTS.ApiUrls.GetCurrentChannel, undefined, this.currentChannelId);
            this.audioStateId = await this.getCid();
            await this.send('subscribe', CONSTANTS.ApiUrls.GetAudioStatus, undefined, this.audioStateId);
            this.soundOutputId = await this.getCid();
            await this.send('subscribe', CONSTANTS.ApiUrls.GetSoundOutput, undefined, this.soundOutputId);

            //picture settings
            if (this.webOS >= 4.0) {
                const payload = {
                    category: 'picture',
                    keys: ['brightness', 'backlight', 'contrast', 'color']
                }
                this.pictureSettingsId = await this.getCid();
                await this.send('subscribe', CONSTANTS.ApiUrls.GetSystemSettings, payload, this.pictureSettingsId);
            }

            //picture mode
            if (this.webOS >= 4.0) {
                const payload = {
                    category: 'picture',
                    keys: ['pictureMode']
                }
                this.pictureModeId = await this.getCid();
                //await this.send('alert', CONSTANTS.ApiUrls.GetSystemSettings, payload, this.pictureModeId);
            }

            //sound mode
            if (this.webOS >= 6.0) {
                const payload = {
                    category: 'sound',
                    keys: ['soundMode']
                }
                this.soundModeId = await this.getCid();
                await this.send('subscribe', CONSTANTS.ApiUrls.GetSystemSettings, payload, this.soundModeId);
            }
            return true;
        } catch (error) {
            throw new Error(error.message ?? error);
        };
    }

    async getCid(type) {
        try {
            switch (type) {
                case 'Power':
                    return this.powerStateId;
                case 'App':
                    return this.currentAppId;
                case 'Channel':
                    return this.currentChannelId;
                case 'Audio':
                    return this.audioStateId;
                case 'PictureSettings':
                    return this.pictureSettingsId;
                case 'PictureMode':
                    return this.pictureModeId;
                case 'SoundMode':
                    return this.soundModeId;
                case 'SoundOutput':
                    return this.soundOutputId;
                case 'ExternalInputList':
                    return this.externalInoutListId;
                default:
                    this.cidCount++;
                    const randomPart = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8);
                    const counterPart = (`000${(this.cidCount).toString(16)}`).slice(-4);
                    const cid = randomPart + counterPart;
                    return cid;
            }
        } catch (error) {
            throw new Error(error.message ?? error);
        }
    }


    async send(type, uri, payload, cid, title, message) {
        try {
            payload = payload ?? {};
            cid = cid ?? await this.getCid();
            title = title ?? 'Unknown Title';
            message = message ?? 'Unknown Message';
            let data = {};
            let messageContent = {};

            switch (type) {
                case 'button':
                    if (!this.specjalizedSocketConnected) {
                        this.emit('warn', 'Specialized socket not connected.');
                        return;
                    };

                    const keyValuePairs = Object.entries(payload).map(([key, value]) => `${key}:${value}`);
                    keyValuePairs.unshift(`type:${type}`);
                    const array = keyValuePairs.join('\n') + '\n\n';

                    this.specializedSocket.send(array);
                    return true;
                case 'alert':
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected.');
                        return;
                    };

                    this.alertCid = cid;
                    const buttons = [{ label: 'Ok', focus: true, buttonType: 'ok', onClick: uri, params: payload }];
                    const onClose = { uri: uri, params: payload };
                    const onFail = { uri: uri, params: payload };
                    const alertPayload = { title: title, message: message, modal: true, buttons: buttons, onclose: onClose, onfail: onFail, type: 'confirm', isSysReq: true };
                    data = {
                        id: cid,
                        type: 'request',
                        uri: CONSTANTS.ApiUrls.CreateAlert,
                        payload: alertPayload
                    };

                    messageContent = JSON.stringify(data);
                    this.socket.send(messageContent);
                    const debug = this.debugLog ? this.emit('debug', `Alert send: ${messageContent}`) : false;
                    return true;
                case 'toast':
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected.');
                        return;
                    };

                    this.toastCid = cid;
                    const toastPayload = { message: message, iconData: null, iconExtension: null, onClick: payload };
                    data = {
                        id: cid,
                        type: 'request',
                        uri: CONSTANTS.ApiUrls.CreateToast,
                        payload: toastPayload
                    };

                    messageContent = JSON.stringify(data);
                    this.socket.send(messageContent);
                    const debug1 = this.debugLog ? this.emit('debug', `Toast send: ${messageContent}`) : false;
                    return true;
                default:
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected.');
                        return;
                    };

                    data = {
                        id: cid,
                        type: type,
                        uri: uri,
                        payload: payload
                    };

                    messageContent = JSON.stringify(data);
                    this.socket.send(messageContent);
                    const debug2 = this.debugLog ? this.emit('debug', `Socket send: ${messageContent}`) : false;
                    return true;
            };
        } catch (error) {
            throw new Error(error.message ?? error);
        }
    }
};
module.exports = LgWebOsSocket;
