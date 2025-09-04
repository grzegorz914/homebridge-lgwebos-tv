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
        this.getInputsFromDevice = config.getInputsFromDevice;
        this.keyFile = config.keyFile;
        this.devInfoFile = config.devInfoFile;
        this.inputsFile = config.inputsFile;
        this.channelsFile = config.channelsFile;
        this.serviceMenu = config.serviceMenu;
        this.ezAdjustMenu = config.ezAdjustMenu;
        this.enableDebugMode = config.enableDebugMode;
        this.sslWebSocket = config.sslWebSocket;
        this.webSocketPort = this.sslWebSocket ? 3001 : 3000;

        this.socket = null;
        this.specializedSocket = null;
        this.heartbeat = null;
        this.externalInputsArr = [];
        this.inputsArr = [];
        this.socketConnected = false;
        this.specializedSocketConnected = false;
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
        this.impulseGenerator = new ImpulseGenerator()
            .on('heartBeat', async () => {
                try {
                    if (this.socketConnected || this.connecting) return;
                    if (this.enableDebugMode) this.emit('debug', `Plugin send heartbeat to TV`);

                    tcpp.probe(this.host, this.webSocketPort, async (error, online) => {
                        if (error) {
                            this.emit('error', `TCP probe error: ${error.message}`);
                            return;
                        }

                        if (online) {
                            if (this.enableDebugMode) this.emit('debug', `Plugin received heartbeat from TV`);

                            this.connecting = true;
                            try {
                                await this.connect();
                            } catch (error) {
                                this.emit('error', `Connection error: ${error}`);
                            } finally {
                                this.connecting = false;
                            }
                        }
                    });
                } catch (error) {
                    this.emit('error', `Impulse generator error: ${error}, trying again`);
                }
            })
            .on('state', (state) => {
                this.emit('success', `Heartbeat ${state ? 'started' : 'stopped'}`);
            });
    };

    cleanupSocket = () => {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        this.socket = null;
        this.socketConnected = false;
        this.cidCount = 0;
        this.power = false;
        this.screenState = 'Suspend';
    };

    updateTvState(disconnect) {
        try {
            this.emit('powerState', false, this.screenState);
            this.emit('mediaInfo', false, this.appType);
            this.emit('audioState', this.volume, this.mute, this.power);
            this.emit('pictureSettings', this.brightness, this.backlight, this.contrast, this.color, false);
            this.emit('pictureMode', this.pictureMode, false);
            this.emit('soundMode', this.soundMode, false);
            this.emit('soundOutput', this.soundOutput, false);
        } catch (error) {
            throw new Error(`Save pairing key error: ${error}`);
        }
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            if (this.enableDebugMode) this.emit('debug', `Saved data: ${data}`);
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

    async subscribeTvStatus() {
        if (this.enableDebugMode) this.emit('debug', `Subscirbe tv status`);

        try {
            await new Promise(resolve => setTimeout(resolve, 3000));

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

            if (this.enableDebugMode) this.emit('debug', `Subscribe tv status successful`);

            return true;
        } catch (error) {
            throw new Error(`Subscribe TV status error: ${error}`);
        }
    }

    async send(type, uri, payload, cid, title, message) {
        try {
            payload = payload ?? {};
            cid = cid ?? await this.getCid();
            title = title ?? 'Unknown Title';
            message = message ?? 'Unknown Message';
            let data;
            let messageContent;

            // helper to await send without breaking working behavior
            const sendAsync = (socket, content) =>
                new Promise((resolve, reject) => {
                    socket.send(content, (err) => err ? reject(err) : resolve(true));
                });

            switch (type) {
                case 'button':
                    if (!this.specializedSocketConnected) {
                        this.emit('warn', 'Specialized socket not connected');
                        return;
                    }

                    const keyValuePairs = Object.entries(payload).map(([k, v]) => `${k}:${v}`);
                    keyValuePairs.unshift(`type:${type}`);
                    const array = keyValuePairs.join('\n') + '\n\n';

                    await sendAsync(this.specializedSocket, array);
                    return true;
                case 'alert':
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected');
                        return;
                    }

                    this.alertCid = cid;
                    const buttons = [{ label: 'Ok', focus: true, buttonType: 'ok', onClick: uri, params: payload }];
                    const onClose = { uri, params: payload };
                    const onFail = { uri, params: payload };
                    const alertPayload = { title, message, modal: true, buttons, onclose: onClose, onfail: onFail, type: 'confirm', isSysReq: true };

                    data = { id: cid, type: 'request', uri: ApiUrls.CreateAlert, payload: alertPayload };
                    messageContent = JSON.stringify(data);
                    await sendAsync(this.socket, messageContent);
                    if (this.enableDebugMode) this.emit('debug', `Alert send: ${messageContent}`);
                    return true;
                case 'toast':
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected');
                        return;
                    }

                    this.toastCid = cid;
                    const toastPayload = { message, iconData: null, iconExtension: null, onClick: payload };
                    data = { id: cid, type: 'request', uri: ApiUrls.CreateToast, payload: toastPayload };
                    messageContent = JSON.stringify(data);
                    await sendAsync(this.socket, messageContent);
                    if (this.enableDebugMode) this.emit('debug', `Toast send: ${messageContent}`);
                    return true;
                default:
                    if (!this.socketConnected) {
                        this.emit('warn', 'Socket not connected');
                        return;
                    }

                    data = { id: cid, type, uri, payload };
                    messageContent = JSON.stringify(data);
                    await sendAsync(this.socket, messageContent);
                    if (this.enableDebugMode) this.emit('debug', `Socket send: ${messageContent}`);
                    return true;
            }
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        }
    }

    async connect() {
        try {
            if (this.enableDebugMode) this.emit('debug', `Plugin send heartbeat to TV`);

            //Read pairing key from file
            const pairingKey = await this.readData(this.keyFile);
            this.pairingKey = pairingKey.toString().trim() !== '' ? pairingKey.toString() : '';

            //Socket
            const url = this.sslWebSocket ? ApiUrls.WssUrl.replace('lgwebostv', this.host) : ApiUrls.WsUrl.replace('lgwebostv', this.host);
            const options = this.sslWebSocket ? { rejectUnauthorized: false } : {};
            const socket = new WebSocket(url, options)
                .on('error', (error) => {
                    if (this.enableDebugMode) this.emit('debug', `Socket connect error: ${error}`);
                    this.cleanupSocket();
                    this.updateTvState();
                })
                .on('close', () => {
                    if (this.enableDebugMode) this.emit('debug', `Socket closed`);
                    this.cleanupSocket();
                    this.updateTvState();
                })
                .on('open', async () => {
                    if (this.enableDebugMode) this.emit('debug', `Plugin received heartbeat from TV`);

                    this.socket = socket;
                    this.socketConnected = true;

                    // connect to device success
                    this.emit('success', `Socket Connect Success`);

                    // start heartbeat
                    this.heartbeat = setInterval(() => {
                        if (socket.readyState === socket.OPEN) {
                            if (this.enableDebugMode) this.emit('debug', `Socket send heartbeat`);
                            socket.ping();
                        }
                    }, 5000);

                    // Register to TV
                    try {
                        Pairing['client-key'] = this.pairingKey;
                        this.registerId = await this.getCid();
                        await this.send('register', undefined, Pairing, this.registerId);
                    } catch (err) {
                        this.emit('error', `Socket register error: ${err}`);
                    }
                })
                .on('pong', () => {
                    if (this.enableDebugMode) this.emit('debug', `Socket received heartbeat`);
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
                                    if (this.enableDebugMode) this.emit('debug', `Start registering to TV: ${stringifyMessage}`);
                                    this.emit('warn', 'Please accept authorization on TV');
                                    break;
                                case 'registered':
                                    if (this.enableDebugMode) this.emit('debug', `Registered to TV with key: ${messageData['client-key']}`);

                                    //Save key in file if not saved before
                                    const pairingKey = messageData['client-key'];
                                    if (pairingKey !== this.pairingKey) {
                                        await this.saveData(this.keyFile, pairingKey);
                                        this.emit('success', 'Pairing key saved');
                                    }

                                    //Request specjalized socket
                                    this.specializedSocketId = await this.getCid();
                                    await this.send('request', ApiUrls.SocketUrl, undefined, this.specializedSocketId);

                                    //Request system info data
                                    this.systemInfoId = await this.getCid();
                                    await this.send('request', ApiUrls.GetSystemInfo, undefined, this.systemInfoId);

                                    //Request software info data
                                    this.softwareInfoId = await this.getCid();
                                    await this.send('request', ApiUrls.GetSoftwareInfo, undefined, this.softwareInfoId);

                                    //Subscribe tv status
                                    await this.subscribeTvStatus();
                                    break;
                                case 'error':
                                    this.emit('error', `Register to TV error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Register to TV unknown message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.specializedSocketId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Connecting to specialized socket`);

                                    const socketPath = messageData.socketPath;
                                    const specializedSocket = this.sslWebSocket ? new WebSocket(socketPath, { rejectUnauthorized: false }) : new WebSocket(socketPath);
                                    specializedSocket.on('open', async () => {
                                        if (this.enableDebugMode) this.emit('debug', `Specialized socket connected, path: ${socketPath}`);

                                        this.specializedSocket = specializedSocket;
                                        this.specializedSocketConnected = true;
                                        this.emit('success', `Specialized socket connect success`);
                                    })
                                        .on('close', () => {
                                            if (this.enableDebugMode) this.emit('debug', 'Specialized socket closed');

                                            this.specializedSocketConnected = false;
                                            this.specializedSocket = null;
                                        })
                                        .on('error', async (error) => {
                                            if (this.enableDebugMode) this.emit('debug', `Specialized socket connect error: ${error}`);

                                            this.specializedSocketConnected = false;
                                            this.specializedSocket = null;

                                            // Retry with backoff
                                            await new Promise(resolve => setTimeout(resolve, 5000));
                                            if (this.enableDebugMode) this.emit('debug', 'Retrying connect to specialized socket...');

                                            try {
                                                await this.send('request', ApiUrls.SocketUrl, undefined, this.specializedSocketId);
                                            } catch (error) {
                                                this.emit('error', `Specialized socket retry connect error: ${error}`);
                                            }
                                        });
                                    break;
                                case 'error':
                                    if (this.enableDebugMode) this.emit('debug', `Specialized socket error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', `Specialized socket unknown message: type=${messageType}, id=${messageId}, data=${stringifyMessage}`);
                                    break;
                            }
                            break;
                        case this.systemInfoId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `System info: ${stringifyMessage}`);
                                    this.tvInfo.modelName = messageData.modelName ?? 'LG TV';

                                    //restFul
                                    this.emit('restFul', 'systeminfo', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'System info', messageData);
                                    break;
                                case 'error':
                                    if (this.enableDebugMode) this.emit('debug', `System info error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `System info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.softwareInfoId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Software Info: ${stringifyMessage}`);

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
                                    if (this.enableDebugMode) this.emit('debug', `Software info error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Software info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.channelsId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Channels list: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `Channels error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Channels list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.externalInputListId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `External input list: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `External input list error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `External input list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.appsId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Apps list: ${stringifyMessage}`);

                                    // Handle app change reason
                                    const appInstalled = messageData.changeReason === 'appInstalled';
                                    const appUninstalled = messageData.changeReason === 'appUninstalled';
                                    const appUpdated = !appInstalled && !appUninstalled;

                                    // --- Handle uninstall ---
                                    if (this.getInputsFromDevice && appUninstalled && messageData.app) {
                                        this.inputsArr = this.inputsArr.filter(inp => inp.reference !== messageData.app.id);
                                        const inputs = {
                                            name: messageData.app.title,
                                            reference: messageData.app.id
                                        };

                                        await this.saveData(this.inputsFile, this.inputsArr);
                                        this.emit('addRemoveOrUpdateInput', inputs, true);
                                        return;
                                    }

                                    // Build apps list
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

                                    // Merge external inputs + apps
                                    this.inputsArr = this.getInputsFromDevice ? [...this.externalInputsArr, ...appsArr] : this.inputs;

                                    // Save result
                                    await this.saveData(this.inputsFile, this.inputsArr);

                                    // Emit the inputs
                                    this.emit('installedApps', this.inputsArr, false);

                                    //restFul
                                    this.emit('restFul', 'apps', messageData);

                                    //mqtt
                                    this.emit('mqtt', 'Apps', messageData);
                                    break;
                                case 'error':
                                    if (this.enableDebugMode) this.emit('debug', `Apps list error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Apps list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.powerStateId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Power: ${stringifyMessage}`);

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
                                            if (this.enableDebugMode) this.emit('debug', `Unknown power state: ${this.screenState}`);
                                            break;
                                    }

                                    this.emit('powerState', this.power, this.screenState);
                                    const emit = this.screenState === 'Screen Saver' ? this.emit('currentApp', 'com.webos.app.screensaver') : this.emit('currentApp', this.appId);
                                    if (!this.power) this.updateTvState();

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
                                        if (!this.power) this.updateTvState();
                                        if (this.enableDebugMode) this.emit('debug', `Installed system webOS: ${this.tvInfo.webOS}`);
                                    } else {
                                        if (this.enableDebugMode) this.emit('debug', `Power error: ${stringifyMessage}`);
                                    }
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Power received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.currentAppId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `App: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `App error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `App received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.audioStateId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Audio: ${stringifyMessage}`);
                                    const messageDataKeys = Object.keys(messageData);
                                    const scenarioExist = messageDataKeys.includes('scenario');
                                    const volumeStatusExist = messageDataKeys.includes('volumeStatus');
                                    const volumeStatusKeys = volumeStatusExist ? Object.keys(messageData.volumeStatus) : false;
                                    if (volumeStatusKeys) volumeStatusKeys.includes('soundOutput');

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
                                    if (this.enableDebugMode) this.emit('debug', `Audio error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Audio received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.currentChannelId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Channel: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `Channel error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Channel received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.pictureSettingsId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Picture settings: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `Picture settings error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Picture settings received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.pictureModeId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Picture mode: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `Picture mode error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Picture mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.soundModeId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Sound mode: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `Sound mode error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Sound mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.soundOutputId:
                            switch (messageType) {
                                case 'response':
                                    if (this.enableDebugMode) this.emit('debug', `Sound output: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `Sound output error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Sound output received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.mediaInfoId:
                            switch (messageType) {
                                case 'response':
                                    // {"subscribed":true,"returnValue":true,"foregroundAppInfo":[{"appId":"netflix","playState":"loaded","type":"media","mediaId":"_fdTzfnKXXXXX","windowId":"_Window_Id_1"}]}
                                    // reported playState values: starting, loaded, playing, paused
                                    if (this.enableDebugMode) this.emit('debug', `Media info: ${stringifyMessage}`);
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
                                    if (this.enableDebugMode) this.emit('debug', `Media info error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.enableDebugMode) this.emit('debug', this.emit('debug', `Medias info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`));
                                    break;
                            };
                            break;
                        case this.alertCid:
                            if (this.enableDebugMode) this.emit('debug', `Alert: ${stringifyMessage}`);
                            const alertId = messageData.alertId ?? false;
                            if (!alertId) {
                                return;
                            }

                            const closeAlert = this.tvInfo.webOS >= 400 ? await this.send('request', ApiUrls.CloseAletrt, { alertId: alertId }) : await this.send('button', undefined, { name: 'ENTER' });
                            break;
                        case this.toastCid:
                            if (this.enableDebugMode) this.emit('debug', `Toast: ${stringifyMessage}`);
                            const toastId = messageData.toastId ?? false;
                            if (!toastId) {
                                return;
                            }

                            const closeToast = this.tvInfo.webOS >= 400 ? await this.send('request', ApiUrls.CloseToast, { toastId: toastId }) : await this.send('button', undefined, { name: 'ENTER' });
                            break;
                        default:
                            if (this.enableDebugMode) this.emit('debug', `Received message type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                            break;
                    }
                });

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error}`);
        }
    }
}
export default LgWebOsSocket;