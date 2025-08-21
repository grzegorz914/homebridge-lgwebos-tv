import { promises as fsPromises } from 'fs';
import tcpp from 'tcp-ping';
import WebSocket from 'ws';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls, Pairing } from './constants.js';

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
        this.serviceMenu = config.serviceMenu;
        this.ezAdjustMenu = config.ezAdjustMenu;
        this.enableDebugMode = config.enableDebugMode;
        this.sslWebSocket = config.sslWebSocket;
        this.url = this.sslWebSocket ? ApiUrls.WssUrl.replace('lgwebostv', this.host) : ApiUrls.WsUrl.replace('lgwebostv', this.host);
        this.webSocketPort = this.sslWebSocket ? 3001 : 3000;

        this.externalInputsArr = [];
        this.inputsArr = [];
        this.socketConnected = false;
        this.specjalizedSocketConnected = false;
        this.power = false;
        this.screenState = 'Suspend';
        this.appId = '';
        this.appType = '';
        this.volume = 0;
        this.mute = false;
        this.playState = false;

        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.picturedMode = '';
        this.soundMode = '';
        this.soundOutput = '';

        this.cidCount = 0;

        this.tvInfo = {
            manufacturer: 'LG Electronics',
            modelName: 'LG TV',
            productName: '',
            deviceId: '',
            firmwareRevision: '',
            webOS: 200
        }

        //create impulse generator
        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('heartBeat', async () => {
            try {
                if (this.socketConnected) {
                    return;
                }

                const debug = this.enableDebugMode ? this.emit('debug', `Plugin send heartbeat to TV`) : false;
                tcpp.probe(this.host, this.webSocketPort, async (error, online) => {
                    if (online) {
                        const debug = this.enableDebugMode ? this.emit('debug', `Plugin received heartbeat from TV`) : false
                        await this.connect();
                    }
                });
            } catch (error) {
                this.emit('error', `Impulse generatotr error: ${error}, trying again`);
            }
        }).on('state', (state) => {
            const emit = state ? this.emit('success', `Heartbeat started`) : this.emit('warn', `Heartbeat stopped`);
        });
    };

    async connect() {
        try {
            const debug = this.enableDebugMode ? this.emit('debug', `Plugin send heartbeat to TV`) : false;

            //Read pairing key from file
            const pairingKey = await this.readData(this.keyFile);
            this.pairingKey = pairingKey.length > 10 ? pairingKey.toString() : '0';

            //Socket
            const socket = this.sslWebSocket ? new WebSocket(this.url, { rejectUnauthorized: false }) : new WebSocket(this.url);
            socket.on('open', async () => {
                const debug = this.enableDebugMode ? this.emit('debug', `Plugin received heartbeat from TV`) : false
                const debug1 = this.enableDebugMode ? this.emit('debug', `Socket connected`) : false;
                this.socket = socket;
                this.socketConnected = true;

                //connect to device success
                this.emit('success', `Socket Connect Success`)

                this.heartbeat = setInterval(() => {
                    if (socket.readyState === socket.OPEN) {
                        const debug = this.enableDebugMode ? this.emit('debug', `Socket send heartbeat`) : false;
                        socket.ping(null, false, 'UTF-8');
                    }
                }, 5000);

                //Register to tv
                Pairing['client-key'] = this.pairingKey;
                this.registerId = await this.getCid();
                await this.send('register', undefined, Pairing, this.registerId);
            })
                .on('pong', () => {
                    const debug = this.enableDebugMode ? this.emit('debug', `Socket received heartbeat`) : false;
                })
                .on('close', () => {
                    const debug = this.enableDebugMode ? this.emit('debug', `Socket closed`) : false;
                    clearInterval(this.heartbeat);
                    socket.emit('disconnect');
                })
                .on('message', async (message) => {
                    const parsedMessage = JSON.parse(message);
                    const messageId = parsedMessage.id;
                    const messageType = parsedMessage.type;
                    const messageData = parsedMessage.payload;
                    const stringifyMessage = JSON.stringify(messageData, null, 2);

                    switch (messageId) {
                        case this.registerId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Start registering to TV: ${stringifyMessage}`) : false;
                                    this.emit('info', 'Please accept authorization on TV');
                                    break;
                                case 'registered':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Registered to TV with key: ${messageData['client-key']}`) : false;

                                    //Save key in file if not saved before
                                    const pairingKey = messageData['client-key'];
                                    if (pairingKey !== this.pairingKey) {
                                        await this.savePairingKey(this.keyFile, pairingKey);
                                        this.emit('info', 'Pairing key saved');
                                    }

                                    //Request specjalized socket
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    this.specjalizedSockedId = await this.getCid();
                                    await this.send('request', ApiUrls.SocketUrl, undefined, this.specjalizedSockedId);

                                    //Request system info data
                                    this.systemInfoId = await this.getCid();
                                    await this.send('request', ApiUrls.GetSystemInfo, undefined, this.systemInfoId);

                                    //Request software info data
                                    this.softwareInfoId = await this.getCid();
                                    await this.send('request', ApiUrls.GetSoftwareInfo, undefined, this.softwareInfoId);

                                    //Subscribe tv status
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                    const debug4 = this.enableDebugMode ? this.emit('debug', `Subscirbe tv status`) : false;
                                    await this.subscribeTvStatus();
                                    const debug5 = this.enableDebugMode ? this.emit('debug', `Subscribe tv status successful`) : false;
                                    break;
                                case 'error':
                                    const debug2 = this.enableDebugMode ? this.emit('debug', `Register to TV error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug3 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Register to TV unknown message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.specjalizedSockedId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Connecting to specjalized socket`) : false;

                                    const socketPath = messageData.socketPath;
                                    const specializedSocket = this.sslWebSocket ? new WebSocket(socketPath, { rejectUnauthorized: false }) : new WebSocket(socketPath);
                                    specializedSocket.on('open', async () => {
                                        const debug = this.enableDebugMode ? this.emit('debug', `Specialized socket connected, path: ${socketPath}`) : false;
                                        this.specializedSocket = specializedSocket;
                                        this.specjalizedSocketConnected = true;

                                        //connect to deice success
                                        this.emit('success', `Specjalized Socket Connect Success`)

                                        specializedSocket.on('close', () => {
                                            const debug = this.enableDebugMode ? this.emit('debug', 'Specialized socket closed') : false;
                                            specializedSocket.emit('disconnect');
                                        })
                                    }).on('error', async (error) => {
                                        const debug = this.enableDebugMode ? this.emit('debug', `Specjalized socket connect error: ${error}`) : false;
                                        specializedSocket.emit('disconnect');
                                        await new Promise(resolve => setTimeout(resolve, 5000));
                                        await this.send('request', ApiUrls.SocketUrl, undefined, this.specjalizedSockedId);
                                    }).on('disconnect', () => {
                                        const message = this.specjalizedSocketConnected ? this.emit('info', 'Specjalized socket disconnected') : false;
                                        this.specjalizedSocketConnected = false;
                                    });
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Connecting to specjalized socket error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Connecting to specjalized socket unknown message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.systemInfoId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `System info: ${stringifyMessage}`) : false;
                                    this.tvInfo.modelName = messageData.modelName ?? 'LG TV';

                                    //restFul
                                    this.emit('restFul', 'systeminfo', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'System info', messageData);
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `System info error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `System info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.softwareInfoId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Software Info: ${stringifyMessage}`) : false;

                                    this.tvInfo.productName = messageData.product_name;
                                    this.tvInfo.deviceId = messageData.device_id;
                                    this.tvInfo.firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                                    const minor = messageData.minor_ver.split('.')[0];
                                    this.tvInfo.webOS = parseInt(messageData.major_ver + minor, 10) ?? this.tvInfo.webOS;

                                    await this.saveData(this.devInfoFile, this.tvInfo);

                                    //emit device info
                                    this.emit('deviceInfo', this.tvInfo);

                                    //restFul
                                    this.emit('restFul', 'softwareinfo', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'Software info', messageData);
                                    break;
                                case 'error':
                                    const debug3 = this.enableDebugMode ? this.emit('debug', `Software info error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug4 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Software info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.channelsId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Channels list: ${stringifyMessage}`) : false;
                                    const channelsList = messageData.channelList;
                                    const channelListExist = Array.isArray(channelsList) ? channelsList.length > 0 : false;
                                    if (!channelListExist) {
                                        return;
                                    }

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
                                    }

                                    //save channels to the file
                                    await this.saveData(this.channelsFile, channelsArr);

                                    //restFul
                                    this.emit('restFul', 'channels', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'Channels', messageData);
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Channels error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Channels list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.externalInputListId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `External input list: ${stringifyMessage}`) : false;
                                    const externalInputList = messageData.devices;
                                    const externalInputListExist = Array.isArray(externalInputList) ? externalInputList.length > 0 : false;
                                    if (!externalInputListExist) {
                                        return;
                                    }

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
                                    }

                                    //restFul
                                    this.emit('restFul', 'externalinputlist', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'External Input List', messageData);
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `External input list error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `External input list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.appsId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Apps list: ${stringifyMessage}`) : false;

                                    // Handle app change reason
                                    const appInstalled = messageData.changeReason === 'appInstalled';
                                    const appUninstalled = messageData.changeReason === 'appUninstalled';
                                    const appUpdated = !appInstalled && !appUninstalled;

                                    // --- Handle uninstall ---
                                    if (appUninstalled && messageData.app) {
                                        this.inputsArr = this.inputsArr.filter(inp => inp.reference !== messageData.app.id);
                                        const inputs = [{
                                            name: messageData.app.title,
                                            reference: messageData.app.id
                                        }];

                                        await this.saveData(this.inputsFile, this.inputsArr);
                                        this.emit('addRemoveOrUpdateInput', inputs, true);
                                        return;
                                    }

                                    // --- Build apps list ---
                                    const appsList = appInstalled ? [messageData.app] : messageData.apps;
                                    if (!Array.isArray(appsList) || appsList.length === 0) return;

                                    // Reset apps array to avoid duplicates
                                    const appsArr = [];

                                    // Parse apps into appsArr
                                    for (const app of appsList) {
                                        if (app?.id && app?.title) {
                                            const input = {
                                                name: app.title,
                                                reference: app.id,
                                                mode: 0
                                            };
                                            appsArr.push(input);
                                        }
                                    }

                                    // Add special menus on app updated
                                    if (appUpdated) {
                                        if (this.serviceMenu) appsArr.push({ name: 'Service Menu', reference: 'service.menu', mode: 0 });
                                        if (this.ezAdjustMenu) appsArr.push({ name: 'EZ Adjust', reference: 'ez.adjust', mode: 0 });
                                    }

                                    // --- Merge external inputs + apps ---
                                    this.inputsArr = this.getInputsFromDevice ? [...this.externalInputsArr, ...appsArr] : this.inputs;

                                    // --- Save result ---
                                    await this.saveData(this.inputsFile, this.inputsArr);
                                    // Emit the inputs

                                    this.emit('addRemoveOrUpdateInput', this.inputsArr, false);

                                    //restFul
                                    this.emit('restFul', 'apps', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'Apps', messageData);
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Apps list error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Apps list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.powerStateId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Power: ${stringifyMessage}`) : false;

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
                                            const debug1 = this.enableDebugMode ? this.emit('debug', `Unknown power state: ${this.screenState}`) : false;
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
                                    if (this.tvInfo.webOS < 300) {
                                        this.power = this.socketConnected;
                                        this.screenState = this.socketConnected ? 'Active' : 'Suspend';
                                        this.emit('powerState', this.power, this.screenState);
                                        const disconnect = !this.power ? socket.emit('powerOff') : false;
                                        const debug1 = this.enableDebugMode ? this.emit('debug', `Installed system webOS: ${this.tvInfo.webOS}`) : false;
                                    } else {
                                        const debug1 = this.enableDebugMode ? this.emit('debug', `Power error: ${stringifyMessage}`) : false;
                                    }
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Power received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.currentAppId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `App: ${stringifyMessage}`) : false;
                                    const appId = messageData.appId ?? false;
                                    if (!appId) {
                                        return;
                                    };

                                    const app = appId === 'com.webos.app.factorywin' ? 'service.menu' : appId
                                    this.appId = app;

                                    const emit = this.screenState === 'Screen Saver' ? this.emit('currentApp', 'com.webos.app.screensaver') : this.emit('currentApp', app);

                                    //restFul
                                    this.emit('restFul', 'currentapp', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'Current App', messageData);
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `App error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `App received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.audioStateId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Audio: ${stringifyMessage}`) : false;
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
                                    }

                                    this.emit('audioState', volume, mute, this.power);
                                    this.volume = volume;
                                    this.mute = mute

                                    //restFul
                                    this.emit('restFul', 'audio', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'Audio', messageData);
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Audio error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Audio received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.currentChannelId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Channel: ${stringifyMessage}`) : false;
                                    const channelId = messageData.channelId ?? false;
                                    const channelName = messageData.channelName;
                                    const channelNumber = messageData.channelNumber;
                                    if (!channelId) {
                                        return;
                                    }

                                    this.emit('currentChannel', channelId, channelName, channelNumber);

                                    //restFul
                                    this.emit('restFul', 'currentchannel', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'Current Channel', messageData);
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Channel error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Channel received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.pictureSettingsId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Picture settings: ${stringifyMessage}`) : false;
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
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Picture settings error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Picture settings received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.pictureModeId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Picture mode: ${stringifyMessage}`) : false;
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
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Picture mode error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Picture mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.soundModeId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Sound mode: ${stringifyMessage}`) : false;
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
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Sound mode error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Sound mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.soundOutputId:
                            switch (messageType) {
                                case 'response':
                                    const debug = this.enableDebugMode ? this.emit('debug', `Sound output: ${stringifyMessage}`) : false;
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
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Sound output error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Sound output received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.mediaInfoId:
                            switch (messageType) {
                                case 'response':
                                    // {"subscribed":true,"returnValue":true,"foregroundAppInfo":[{"appId":"netflix","playState":"loaded","type":"media","mediaId":"_fdTzfnKXXXXX","windowId":"_Window_Id_1"}]}
                                    // reported playState values: starting, loaded, playing, paused
                                    const debug = this.enableDebugMode ? this.emit('debug', `Media info: ${stringifyMessage}`) : false;
                                    const foregroundAppInfo = messageData.foregroundAppInfo ?? [];
                                    const mediaAppOpen = foregroundAppInfo.length > 0;
                                    if (!mediaAppOpen) {
                                        return;
                                    }

                                    const playState = foregroundAppInfo[0].playState === 'playing';
                                    const appType = foregroundAppInfo[0].type ?? '';
                                    this.playState = playState;
                                    this.appType = appType;

                                    //emit
                                    this.emit('mediaInfo', playState, appType);

                                    //restFul
                                    this.emit('restFul', 'mediainfo', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'Media Info', messageData);
                                    break;
                                case 'error':
                                    const debug1 = this.enableDebugMode ? this.emit('debug', `Media info error: ${stringifyMessage}`) : false;
                                    break;
                                default:
                                    const debug2 = this.enableDebugMode ? this.emit('debug', this.emit('debug', `Medias info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`)) : false;
                                    break;
                            };
                            break;
                        case this.alertCid:
                            const debug = this.enableDebugMode ? this.emit('debug', `Alert: ${stringifyMessage}`) : false;
                            const alertId = messageData.alertId ?? false;
                            if (!alertId) {
                                return;
                            }

                            const closeAlert = this.tvInfo.webOS >= 400 ? await this.send('request', ApiUrls.CloseAletrt, { alertId: alertId }) : await this.send('button', undefined, { name: 'ENTER' });
                            break;
                        case this.toastCid:
                            const debug1 = this.enableDebugMode ? this.emit('debug', `Toast: ${stringifyMessage}`) : false;
                            const toastId = messageData.toastId ?? false;
                            if (!toastId) {
                                return;
                            }

                            const closeToast = this.tvInfo.webOS >= 400 ? await this.send('request', ApiUrls.CloseToast, { toastId: toastId }) : await this.send('button', undefined, { name: 'ENTER' });
                            break;
                        default:
                            const debug3 = this.enableDebugMode ? this.emit('debug', `Received message type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`) : false;
                            break;
                    }
                })
                .on('error', (error) => {
                    const debug = this.enableDebugMode ? this.emit('debug', `Socket connect error: ${error}`) : false;
                    socket.emit('disconnect');
                })
                .on('powerOff', () => {
                    //update TV state
                    this.emit('powerState', false, this.screenState);
                    this.emit('playState', false, this.appType);
                    this.emit('audioState', this.volume, this.mute, this.power);
                    this.emit('pictureSettings', 0, 0, 0, 0, false);
                    this.emit('pictureMode', 'Unknown', false);
                    this.emit('soundMode', this.soundMode, false);
                    this.emit('soundOutput', this.soundOutput, false);
                })
                .on('disconnect', () => {
                    const message = this.socketConnected ? this.emit('info', 'Socket disconnected') : false;
                    this.socketConnected = false;
                    this.cidCount = 0;
                    this.power = false;
                    this.screenState = 'Suspend';

                    //update TV state
                    this.emit('powerState', false, 'Suspend');
                    this.emit('playState', false, this.appType);
                    this.emit('audioState', this.volume, this.mute, this.power);
                    this.emit('pictureSettings', 0, 0, 0, 0, false);
                    this.emit('pictureMode', this.pictureMode, false);
                    this.emit('soundMode', this.soundMode, false);
                    this.emit('soundOutput', this.soundOutput, false);
                });

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error}`);
        }
    }

    async savePairingKey(path, data) {
        try {
            await fsPromises.writeFile(path, data);
            const debug = this.enableDebugMode ? this.emit('debug', `Saved pairing key: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save pairing key error: ${error}`);
        }
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            const debug = this.enableDebugMode ? this.emit('debug', `Saved data: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        }
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;;
        } catch (error) {
            throw new Error(`Read data error: ${error}`);
        }
    }

    async subscribeTvStatus() {
        try {
            this.channelsId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetChannelList, undefined, this.channelsId);
            this.externalInputListId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetExternalInputList, undefined, this.externalInputListId);
            this.appsId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetInstalledApps, undefined, this.appsId);
            this.powerStateId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetPowerState, undefined, this.powerStateId);
            this.currentAppId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetForegroundAppInfo, undefined, this.currentAppId);
            this.currentChannelId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetCurrentChannel, undefined, this.currentChannelId);
            this.audioStateId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetAudioStatus, undefined, this.audioStateId);
            this.soundOutputId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetSoundOutput, undefined, this.soundOutputId);

            //picture settings
            if (this.tvInfo.webOS >= 400) {
                const payload = {
                    category: 'picture',
                    keys: ['brightness', 'backlight', 'contrast', 'color']
                }
                this.pictureSettingsId = await this.getCid();
                await this.send('subscribe', ApiUrls.GetSystemSettings, payload, this.pictureSettingsId);
            }

            //picture mode
            if (this.tvInfo.webOS >= 400) {
                const payload = {
                    category: 'picture',
                    keys: ['pictureMode']
                }
                this.pictureModeId = await this.getCid();
                //await this.send('alert', ApiUrls.GetSystemSettings, payload, this.pictureModeId);
            }

            //sound mode
            if (this.tvInfo.webOS >= 600) {
                const payload = {
                    category: 'sound',
                    keys: ['soundMode']
                }
                this.soundModeId = await this.getCid();
                await this.send('subscribe', ApiUrls.GetSystemSettings, payload, this.soundModeId);
            }

            //media info
            if (this.tvInfo.webOS >= 700) {
                this.mediaInfoId = await this.getCid();
                await this.send('subscribe', ApiUrls.GetForegroundAppMediaInfo, undefined, this.mediaInfoId);
            }
            return true;
        } catch (error) {
            throw new Error(`Subscribe TV status error: ${error}`);
        }
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
                case 'MediaInfo':
                    return this.mediaInfoId;
                default:
                    this.cidCount++;
                    const randomPart = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8);
                    const counterPart = (`000${(this.cidCount).toString(16)}`).slice(-4);
                    const cid = randomPart + counterPart;
                    return cid;
            }
        } catch (error) {
            throw new Error(`Get Cid error: ${error}`);
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
                        this.emit('warn', 'Specialized socket not connected');
                        return;
                    }

                    const keyValuePairs = Object.entries(payload).map(([key, value]) => `${key}:${value}`);
                    keyValuePairs.unshift(`type:${type}`);
                    const array = keyValuePairs.join('\n') + '\n\n';

                    this.specializedSocket.send(array);
                    return true;
                case 'alert':
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected');
                        return;
                    }

                    this.alertCid = cid;
                    const buttons = [{ label: 'Ok', focus: true, buttonType: 'ok', onClick: uri, params: payload }];
                    const onClose = { uri: uri, params: payload };
                    const onFail = { uri: uri, params: payload };
                    const alertPayload = { title: title, message: message, modal: true, buttons: buttons, onclose: onClose, onfail: onFail, type: 'confirm', isSysReq: true };
                    data = {
                        id: cid,
                        type: 'request',
                        uri: ApiUrls.CreateAlert,
                        payload: alertPayload
                    }

                    messageContent = JSON.stringify(data);
                    this.socket.send(messageContent);
                    const debug = this.enableDebugMode ? this.emit('debug', `Alert send: ${messageContent}`) : false;
                    return true;
                case 'toast':
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected');
                        return;
                    }

                    this.toastCid = cid;
                    const toastPayload = { message: message, iconData: null, iconExtension: null, onClick: payload };
                    data = {
                        id: cid,
                        type: 'request',
                        uri: ApiUrls.CreateToast,
                        payload: toastPayload
                    }

                    messageContent = JSON.stringify(data);
                    this.socket.send(messageContent);
                    const debug1 = this.enableDebugMode ? this.emit('debug', `Toast send: ${messageContent}`) : false;
                    return true;
                default:
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected');
                        return;
                    }

                    data = {
                        id: cid,
                        type: type,
                        uri: uri,
                        payload: payload
                    };

                    messageContent = JSON.stringify(data);
                    this.socket.send(messageContent);
                    const debug2 = this.enableDebugMode ? this.emit('debug', `Socket send: ${messageContent}`) : false;
                    return true;
            };
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        }
    }
}
export default LgWebOsSocket;
