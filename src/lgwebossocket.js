import WebSocket from 'ws';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, Pairing } from './constants.js';

class LgWebOsSocket extends EventEmitter {
    constructor(config, keyFile, devInfoFile, inputsFile, channelsFile, restFulEnabled, mqttEnabled) {
        super();
        this.host = config.host;
        this.getInputsFromDevice = config.inputs?.getFromDevice || false;
        this.inputs = (config.inputs?.data || []).filter(input => input.name && input.reference);
        this.logWarn = config.log?.warn || true;
        this.logError = config.log?.error || true;
        this.logDebug = config.log?.debug || false;
        this.sslWebSocket = config.sslWebSocket || false;
        this.keyFile = keyFile;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.channelsFile = channelsFile;
        this.webSocketPort = this.sslWebSocket ? 3001 : 3000;

        this.restFulEnabled = restFulEnabled;
        this.mqttEnabled = mqttEnabled;

        this.functions = new Functions();
        this.socket = null;
        this.specializedSocket = null;
        this.socketOpen = false;
        this.heartbeat = null;
        this.externalInputsArr = [];
        this.inputsArr = [];
        this.socketConnected = false;
        this.specializedSocketConnected = false;
        this.cidCount = 0;

        this.power = false;
        this.screenState = 'Suspend';
        this.appId = '';
        this.channelId = '';
        this.appType = '';
        this.volume = 0;
        this.mute = false;
        this.playState = false;

        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.pictureMode = '';
        this.soundMode = '';
        this.soundOutput = '';

        this.tvInfo = {
            manufacturer: 'LG Electronics',
            modelName: 'LG TV',
            productName: '',
            deviceId: '',
            firmwareRevision: '',
            webOS: 2.0
        };

        //create impulse generator
        this.impulseGenerator = new ImpulseGenerator()
            .on('heartBeat', async () => {
                try {
                    await this.connect();
                } catch (error) {
                    if (this.logError) this.emit('error', `Impulse generator error: ${error}, trying again`);
                }
            })
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Heartbeat ${state ? 'started' : 'stopped'}`);
            });
    }

    cleanupSocket = () => {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }

        this.socket = null;
        this.socketOpen = false;
        this.socketConnected = false;
        this.specializedSocketConnected = false;
        this.cidCount = 0;
        this.power = false;
        this.screenState = 'Suspend';
        this.updateTvState();
    };

    updateTvState() {
        this.emit('powerState', this.power, this.screenState);
        this.emit('currentApp', this.appId, this.power);
        this.emit('audioState', this.volume, this.mute, this.power);
        this.emit('pictureSettings', this.brightness, this.backlight, this.contrast, this.color, this.power);
        this.emit('pictureMode', this.pictureMode, this.power);
        this.emit('soundMode', this.soundMode, this.power);
        this.emit('mediaInfo', this.appId, this.playState, this.appType, this.power);
    }

    updateSensors() {
        this.emit('updateSensors', this.power, this.screenState, this.appId, this.volume, this.mute, this.soundMode, this.soundOutput, this.pictureMode, this.playState, this.channelId);
    }

    async getCid(type) {
        try {
            switch (type) {
                case 'Power': return this.powerStateId;
                case 'App': return this.currentAppId;
                case 'Channel': return this.currentChannelId;
                case 'Audio': return this.audioStateId;
                case 'PictureSettings': return this.pictureSettingsId;
                case 'PictureMode': return this.pictureModeId;
                case 'SoundMode': return this.soundModeId;
                case 'SoundOutput': return this.soundOutputId;
                // fix #13: was 'externalInoutListId' (typo), now matches the correctly named property
                case 'ExternalInputList': return this.externalInputListId;
                case 'MediaInfo': return this.mediaInfoId;
                default: {
                    this.cidCount++;
                    const randomPart = (`0000000${Math.floor(Math.random() * 0xFFFFFFFF).toString(16)}`).slice(-8);
                    const counterPart = (`000${(this.cidCount).toString(16)}`).slice(-4);
                    return randomPart + counterPart;
                }
            }
        } catch (error) {
            throw new Error(`Get Cid error: ${error}`);
        }
    }

    async getSystemInfo() {
        try {
            this.systemInfoId = await this.getCid();
            await this.send('request', ApiUrls.GetSystemInfo, undefined, this.systemInfoId);
            this.systemInfoReceived = true;
        } catch (err) {
            if (this.logError) this.emit('error', `Get system info error: ${err}`);
        }
    }

    async registerToTv() {
        try {
            Pairing['client-key'] = this.pairingKey;
            this.registerId = await this.getCid();
            await this.send('register', undefined, Pairing, this.registerId);
            return;
        } catch (err) {
            if (this.logError) this.emit('error', `Socket register error: ${err}`);
        }
    }

    async getSoftwareInfo() {
        try {
            this.softwareInfoId = await this.getCid();
            await this.send('request', ApiUrls.GetSoftwareInfo, undefined, this.softwareInfoId);
            return;
        } catch (err) {
            if (this.logError) this.emit('error', `Get software info error: ${err}`);
        }
    }

    async getSpecjalizedSocket() {
        try {
            this.specializedSocketId = await this.getCid();
            await this.send('request', ApiUrls.SocketUrl, undefined, this.specializedSocketId);
            return;
        } catch (err) {
            if (this.logError) this.emit('error', `Get specjalized socket error: ${err}`);
        }
    }

    async subscribeTvStatus() {
        if (this.logDebug) this.emit('debug', `Subscribe tv status`);

        try {
            this.channelsId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetChannelList, undefined, this.channelsId);
            this.externalInputListId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetExternalInputList, undefined, this.externalInputListId);
            this.appsId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetInstalledApps, undefined, this.appsId);

            await new Promise(resolve => setTimeout(resolve, 500));
            this.powerStateId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetPowerState, undefined, this.powerStateId);

            await new Promise(resolve => setTimeout(resolve, 1500));
            this.currentAppId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetForegroundAppInfo, undefined, this.currentAppId);
            this.currentChannelId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetCurrentChannel, undefined, this.currentChannelId);
            this.audioStateId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetAudioStatus, undefined, this.audioStateId);
            this.soundOutputId = await this.getCid();
            await this.send('subscribe', ApiUrls.GetSoundOutput, undefined, this.soundOutputId);

            //picture
            if (this.tvInfo.webOS >= 4.0) {
                let payload = {
                    category: 'picture',
                    keys: ['brightness', 'backlight', 'contrast', 'color']
                };
                this.pictureSettingsId = await this.getCid();
                await this.send('subscribe', ApiUrls.GetSystemSettings, payload, this.pictureSettingsId);

                //mode
                payload = {
                    category: 'picture',
                    keys: ['pictureMode']
                };
            }

            //sound mode
            if (this.tvInfo.webOS >= 6.0) {
                const payload = {
                    category: 'sound',
                    keys: ['soundMode']
                };
                this.soundModeId = await this.getCid();
                await this.send('subscribe', ApiUrls.GetSystemSettings, payload, this.soundModeId);
            }

            //media info
            if (this.tvInfo.webOS >= 7.0) {
                this.mediaInfoId = await this.getCid();
                await this.send('subscribe', ApiUrls.GetForegroundAppMediaInfo, undefined, this.mediaInfoId);
            }

            if (this.logDebug) this.emit('debug', `Subscribe tv status successful`);

            return true;
        } catch (error) {
            throw new Error(`Subscribe TV status error: ${error}`);
        }
    }

    async send(type, uri, payload, cid, title, message) {
        if (!this.socketOpen) {
            if (this.logDebug) this.emit('debug', 'Socket not connected');
            return;
        }

        try {
            payload = payload ?? {};
            cid = cid ?? await this.getCid();
            title = title ?? 'Unknown Title';
            message = message ?? 'Unknown Message';
            let data;
            let messageContent;

            const sendAsync = (socket, content) =>
                new Promise((resolve, reject) => {
                    socket.send(content, (err) => err ? reject(err) : resolve(true));
                });

            switch (type) {
                case 'button': {
                    if (!this.specializedSocketConnected) {
                        if (this.logWarn) this.emit('warn', 'Specialized socket not connected');
                        return;
                    }
                    const keyValuePairs = Object.entries(payload).map(([k, v]) => `${k}:${v}`);
                    keyValuePairs.unshift(`type:${type}`);
                    const array = keyValuePairs.join('\n') + '\n\n';
                    await sendAsync(this.specializedSocket, array);
                    return true;
                }
                case 'alert': {
                    this.alertCid = cid;
                    const buttons = [{ label: 'Ok', focus: true, buttonType: 'ok', onClick: uri, params: payload }];
                    const onClose = { uri, params: payload };
                    const onFail = { uri, params: payload };
                    const alertPayload = { title, message, modal: true, buttons, onclose: onClose, onfail: onFail, type: 'confirm', isSysReq: true };
                    data = { id: cid, type: 'request', uri: ApiUrls.CreateAlert, payload: alertPayload };
                    messageContent = JSON.stringify(data);
                    await sendAsync(this.socket, messageContent);
                    if (this.logDebug) this.emit('debug', `Alert send: ${messageContent}`);
                    return true;
                }
                case 'toast': {
                    this.toastCid = cid;
                    const toastPayload = { message, iconData: null, iconExtension: null, onClick: payload };
                    data = { id: cid, type: 'request', uri: ApiUrls.CreateToast, payload: toastPayload };
                    messageContent = JSON.stringify(data);
                    await sendAsync(this.socket, messageContent);
                    if (this.logDebug) this.emit('debug', `Toast send: ${messageContent}`);
                    return true;
                }
                default: {
                    data = { id: cid, type, uri, payload };
                    messageContent = JSON.stringify(data);
                    await sendAsync(this.socket, messageContent);
                    if (this.logDebug) this.emit('debug', `Socket send: ${messageContent}`);
                    return true;
                }
            }
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        }
    }

    async connectSocket() {
        try {
            if (this.logDebug) this.emit('debug', `Connect to TV`);

            const pairingKey = await this.functions.readData(this.keyFile);
            this.pairingKey = pairingKey.length > 10 ? pairingKey.toString() : '0';

            const url = this.sslWebSocket ? ApiUrls.WssUrl.replace('lgwebostv', this.host) : ApiUrls.WsUrl.replace('lgwebostv', this.host);
            const options = this.sslWebSocket ? { rejectUnauthorized: false } : {};
            const socket = new WebSocket(url, options)
                .on('error', (error) => {
                    if (this.logDebug) this.emit('debug', `Socket error: ${error}`);
                    socket.close();
                })
                .on('close', () => {
                    if (this.logDebug) this.emit('debug', `Socket closed`);
                    this.cleanupSocket();
                })
                .on('open', async () => {
                    if (this.logDebug) this.emit('debug', `Plugin received heartbeat from TV`);
                    if (this.socketConnected) return;

                    this.socket = socket;
                    this.emit('success', `Socket Connect Success`);
                    this.socketConnected = true;

                    this.heartbeat = setInterval(() => {
                        if (socket.readyState === socket.OPEN) {
                            if (this.logDebug) this.emit('debug', `Socket send heartbeat`);
                            socket.ping();
                        }
                    }, 5000);
                })
                .on('pong', async () => {
                    if (this.logDebug) this.emit('debug', `Socket received heartbeat`);
                    if (!this.socketOpen) {
                        this.socketOpen = true;
                        await this.getSystemInfo();
                        await this.registerToTv();
                    }
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
                                    if (this.logDebug) this.emit('debug', `Start registering to TV: ${stringifyMessage}`);
                                    if (this.logWarn) this.emit('warn', 'Please accept authorization on TV');
                                    break;
                                case 'registered': {
                                    if (this.logDebug) this.emit('debug', `Registered to TV with key: ${messageData['client-key']}`);
                                    const pairingKey = messageData['client-key'];
                                    if (pairingKey !== this.pairingKey) {
                                        await this.functions.saveData(this.keyFile, pairingKey, false);
                                        this.emit('success', 'Pairing key saved');
                                    }
                                    await this.getSpecjalizedSocket();
                                    break;
                                }
                                case 'error':
                                    if (this.logError) this.emit('error', `Register to TV error: ${stringifyMessage}, trying again`);
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                    await this.registerToTv();
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Register to TV unknown message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.specializedSocketId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Connecting to specialized socket`);
                                    const socketUrl = messageData.socketPath;
                                    const specializedSocket = new WebSocket(socketUrl, options)
                                        .on('error', (error) => {
                                            if (this.logDebug) this.emit('debug', `Specialized socket connect error: ${error}`);
                                            specializedSocket.close();
                                        })
                                        .on('close', async () => {
                                            if (this.logDebug) this.emit('debug', 'Specialized socket closed');
                                            this.specializedSocketConnected = false;
                                            this.specializedSocket = null;
                                            await new Promise(resolve => setTimeout(resolve, 5000));
                                            if (this.logDebug) this.emit('debug', 'Retrying connect to specialized socket...');
                                            try {
                                                await this.getSpecjalizedSocket();
                                            } catch (error) {
                                                if (this.logError) this.emit('error', `Specialized socket retry connect error: ${error}`);
                                            }
                                        })
                                        .on('open', () => {
                                            if (this.logDebug) this.emit('debug', `Specialized socket connected, path: ${socketUrl}`);
                                            this.specializedSocket = specializedSocket;
                                            this.specializedSocketConnected = true;
                                            this.emit('success', `Specialized Socket Connect Success`);
                                        });
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Specialized socket error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Specialized socket unknown message: type=${messageType}, id=${messageId}, data=${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.systemInfoId:
                            switch (messageType) {
                                case 'response':
                                    if (this.logDebug) this.emit('debug', `System info: ${stringifyMessage}`);
                                    this.tvInfo.modelName = messageData.modelName ?? 'LG TV';
                                    await this.getSoftwareInfo();
                                    if (this.restFulEnabled) this.emit('restFul', 'systeminfo', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'System info', messageData);
                                    break;
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `System info error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `System info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.softwareInfoId:
                            switch (messageType) {
                                case 'response':
                                    if (this.logDebug) this.emit('debug', `Software Info: ${stringifyMessage}`);
                                    this.tvInfo.productName = messageData.product_name;
                                    this.tvInfo.deviceId = messageData.device_id;
                                    this.tvInfo.firmwareRevision = `${messageData.major_ver}.${messageData.minor_ver}`;
                                    this.tvInfo.webOS = Number.isFinite(Number(messageData.product_name?.match(/\d+(\.\d+)?/)?.[0])) ? Number(messageData.product_name.match(/\d+(\.\d+)?/)[0]) : this.tvInfo.webOS;
                                    await this.functions.saveData(this.devInfoFile, this.tvInfo);
                                    this.emit('deviceInfo', this.tvInfo);
                                    await this.subscribeTvStatus();
                                    if (this.restFulEnabled) this.emit('restFul', 'softwareinfo', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Software info', messageData);
                                    break;
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Software info error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Software info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.channelsId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Channels list: ${stringifyMessage}`);
                                    const channelsList = messageData.channelList;
                                    const channelListExist = Array.isArray(channelsList) ? channelsList.length > 0 : false;
                                    if (!channelListExist) return;

                                    const channelsArr = [];
                                    for (const channel of channelsList) {
                                        channelsArr.push({
                                            name: channel.channelName,
                                            reference: channel.channelId,
                                            number: channel.channelNumber,
                                            mode: 1
                                        });
                                    }
                                    await this.functions.saveData(this.channelsFile, channelsArr);
                                    if (this.restFulEnabled) this.emit('restFul', 'channels', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Channels', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Channels error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Channels list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.externalInputListId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `External input list: ${stringifyMessage}`);
                                    const externalInputList = messageData.devices;
                                    const externalInputListExist = this.getInputsFromDevice && Array.isArray(externalInputList) ? externalInputList.length > 0 : false;
                                    if (!externalInputListExist) return;

                                    const arr = [];
                                    for (const input of externalInputList) {
                                        arr.push({
                                            name: input.label,
                                            reference: input.appId,
                                            mode: 0,
                                            visible: input.visible ?? true
                                        });
                                    }
                                    this.externalInputsArr = arr;
                                    if (this.restFulEnabled) this.emit('restFul', 'externalinputlist', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'External Input List', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `External input list error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `External input list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.appsId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Apps list: ${stringifyMessage}`);

                                    if (this.getInputsFromDevice) {
                                        const appInstalled = messageData.changeReason === 'appInstalled';
                                        const appUninstalled = messageData.changeReason === 'appUninstalled';
                                        const appUpdated = !appInstalled && !appUninstalled;

                                        if (appUninstalled && messageData.app) {
                                            this.inputs = this.inputs.filter(input => input.reference !== messageData.app.id);
                                            const inputs = [{ name: messageData.app.title, reference: messageData.app.id }];
                                            await this.functions.saveData(this.inputsFile, this.inputs);
                                            this.emit('installedApps', inputs, true);
                                            return;
                                        }

                                        const appsList = appInstalled ? [messageData.app] : messageData.apps;
                                        if (!Array.isArray(appsList) || appsList.length === 0) return;

                                        const arr = [];
                                        for (const app of appsList) {
                                            if (app?.id && app?.title) {
                                                arr.push({
                                                    name: app.title,
                                                    reference: app.id,
                                                    mode: 0,
                                                    visible: app.visible
                                                });
                                            }
                                        }

                                        if (appUpdated && this.tvInfo.webOS >= 4.0) arr.push({ name: 'Screen Off', reference: 'com.webos.app.screenoff', mode: 0 });
                                        this.inputs = [...this.externalInputsArr, ...arr];
                                    }

                                    await this.functions.saveData(this.inputsFile, this.inputs);
                                    this.emit('installedApps', this.inputs, false);
                                    if (this.restFulEnabled) this.emit('restFul', 'apps', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Apps', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Apps list error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Apps list received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.powerStateId:
                            switch (messageType) {
                                case 'response':
                                    if (this.logDebug) this.emit('debug', `Power: ${stringifyMessage}`);
                                    switch (messageData.state) {
                                        case 'Active':
                                            this.power = true;
                                            this.screenState = 'Active';
                                            this.emit('currentApp', this.appId);
                                            break;
                                        case 'Active Standby':
                                            this.power = false;
                                            this.screenState = 'Active Standby';
                                            break;
                                        case 'Screen Saver':
                                            this.power = true;
                                            this.screenState = 'Screen Saver';
                                            this.emit('currentApp', 'com.webos.app.screensaver');
                                            break;
                                        case 'Screen Off':
                                            this.power = true;
                                            this.screenState = 'Screen Off';
                                            this.emit('currentApp', 'com.webos.app.screenoff');
                                            break;
                                        case 'Suspend':
                                            this.power = false;
                                            this.screenState = 'Suspend';
                                            break;
                                        default:
                                            if (this.logDebug) this.emit('debug', `Unknown power state: ${stringifyMessage}`);
                                            return;
                                    }
                                    this.emit('powerState', this.power, this.screenState);
                                    this.updateSensors();
                                    if (!this.power) this.updateTvState();
                                    if (this.restFulEnabled) this.emit('restFul', 'powerstate', this.power);
                                    if (this.restFulEnabled) this.emit('restFul', 'power', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Power State', this.power);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Power', messageData);
                                    break;
                                case 'error':
                                    if (this.tvInfo.webOS < 3.0) {
                                        this.power = this.socketConnected;
                                        this.screenState = this.socketConnected ? 'Active' : 'Suspend';
                                        this.emit('powerState', this.power, this.screenState);
                                        if (!this.power) this.updateTvState();
                                        if (this.logDebug) this.emit('debug', `Installed system webOS: ${this.tvInfo.webOS}`);
                                    } else {
                                        if (this.logDebug) this.emit('debug', `Power error: ${stringifyMessage}`);
                                    }
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Power received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.currentAppId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `App: ${stringifyMessage}`);
                                    const appId = messageData.appId;
                                    if (!appId) return;
                                    this.appId = appId;
                                    this.emit('currentApp', appId, this.power);
                                    this.updateSensors();
                                    if (this.restFulEnabled) this.emit('restFul', 'currentapp', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Current App', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `App error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `App received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.audioStateId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Audio: ${stringifyMessage}`);
                                    const volume = messageData.volume >= 0 ? messageData.volume : this.volume;
                                    const mute = (messageData.mute ?? messageData.muteStatus) !== undefined ? !!(messageData.mute ?? messageData.muteStatus) : this.mute;
                                    this.volume = volume;
                                    this.mute = mute;
                                    this.emit('audioState', volume, mute, this.power);
                                    this.updateSensors();
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Audio error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Audio received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            if (this.restFulEnabled) this.emit('restFul', 'audio', messageData);
                            if (this.mqttEnabled) this.emit('mqtt', 'Audio', messageData);
                            break;
                        case this.currentChannelId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Channel: ${stringifyMessage}`);
                                    const channelId = messageData.channelId;
                                    const channelName = messageData.channelName;
                                    const channelNumber = messageData.channelNumber;
                                    if (!channelId) return;
                                    this.channelId = channelId;
                                    this.emit('currentChannel', channelId, channelName, channelNumber, this.power);
                                    this.updateSensors();
                                    if (this.restFulEnabled) this.emit('restFul', 'currentchannel', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Current Channel', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Channel error: ${stringifyMessage}`);
                                    break;
                                default:
                                    // fix #11: was 'his.emit' (missing 't')
                                    if (this.logDebug) this.emit('debug', `Channel received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.pictureSettingsId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Picture settings: ${stringifyMessage}`);
                                    const settings = messageData.settings;
                                    if (!settings) return;
                                    const brightness = settings.brightness ?? this.brightness;
                                    const backlight = settings.backlight ?? this.backlight;
                                    const contrast = settings.contrast ?? this.contrast;
                                    const color = settings.color ?? this.color;
                                    this.brightness = brightness;
                                    this.backlight = backlight;
                                    this.contrast = contrast;
                                    this.color = color;
                                    this.emit('pictureSettings', brightness, backlight, contrast, color, this.power);
                                    this.updateSensors();
                                    if (this.restFulEnabled) this.emit('restFul', 'picturesettings', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Picture Settings', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Picture settings error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Picture settings received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.pictureModeId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Picture mode: ${stringifyMessage}`);
                                    const pictureMode = messageData.settings?.pictureMode;
                                    if (!pictureMode) return;
                                    this.pictureMode = pictureMode;
                                    this.emit('pictureMode', pictureMode, this.power);
                                    this.updateSensors();
                                    if (this.restFulEnabled) this.emit('restFul', 'picturemode', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Picture Mode', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Picture mode error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Picture mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.soundModeId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Sound mode: ${stringifyMessage}`);
                                    const settings = messageData.settings;
                                    if (!settings) return;
                                    const soundMode = settings.soundMode ?? this.soundMode;
                                    this.soundMode = soundMode;
                                    this.emit('soundMode', soundMode, this.power);
                                    this.updateSensors();
                                    if (this.restFulEnabled) this.emit('restFul', 'soundmode', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Sound Mode', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Sound mode error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Sound mode received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.soundOutputId:
                            switch (messageType) {
                                case 'response': {
                                    if (this.logDebug) this.emit('debug', `Sound output: ${stringifyMessage}`);
                                    const soundOutput = messageData.soundOutput ?? this.soundOutput;
                                    if (!soundOutput) return;
                                    this.soundOutput = soundOutput;
                                    this.emit('soundOutput', soundOutput, this.power);
                                    this.updateSensors();
                                    if (this.restFulEnabled) this.emit('restFul', 'soundoutput', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Sound Output', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Sound output error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Sound output received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.mediaInfoId:
                            switch (messageType) {
                                case 'response': {
                                    // {"subscribed":true,"returnValue":true,"foregroundAppInfo":[{"appId":"netflix","playState":"loaded","type":"media","mediaId":"_fdTzfnKXXXXX","windowId":"_Window_Id_1"}]}
                                    // reported playState values: starting, loaded, playing, paused
                                    if (this.logDebug) this.emit('debug', `Media info: ${stringifyMessage}`);
                                    const foregroundAppInfo = messageData.foregroundAppInfo ?? [];
                                    const mediaAppOpen = foregroundAppInfo.length > 0;
                                    if (!mediaAppOpen) return;

                                    const appId = foregroundAppInfo[0].appId ?? this.appId;
                                    const playState = foregroundAppInfo[0].playState === 'playing';
                                    const appType = foregroundAppInfo[0].type ?? this.appType;
                                    this.appId = appId;
                                    this.playState = playState;
                                    this.appType = appType;

                                    // fix #12: event name unified to 'mediaInfo'
                                    this.emit('mediaInfo', appId, playState, appType, this.power);
                                    this.updateSensors();
                                    if (this.restFulEnabled) this.emit('restFul', 'mediainfo', messageData);
                                    if (this.mqttEnabled) this.emit('mqtt', 'Media Info', messageData);
                                    break;
                                }
                                case 'error':
                                    if (this.logDebug) this.emit('debug', `Media info error: ${stringifyMessage}`);
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Media info received message, type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                                    return;
                            }
                            break;
                        case this.alertCid: {
                            if (this.logDebug) this.emit('debug', `Alert: ${stringifyMessage}`);
                            const alertId = messageData.alertId ?? false;
                            if (!alertId) return;
                            if (this.tvInfo.webOS >= 4.0) {
                                await this.send('request', ApiUrls.CloseAlert, { alertId });
                            } else {
                                await this.send('button', undefined, { name: 'ENTER' });
                            }
                            break;
                        }
                        case this.toastCid: {
                            if (this.logDebug) this.emit('debug', `Toast: ${stringifyMessage}`);
                            const toastId = messageData.toastId ?? false;
                            if (!toastId) return;
                            // fix #15: wrapped in block to avoid const-in-switch warning
                            if (this.tvInfo.webOS >= 4.0) {
                                await this.send('request', ApiUrls.CloseToast, { toastId });
                            } else {
                                await this.send('button', undefined, { name: 'ENTER' });
                            }
                            break;
                        }
                        default:
                            if (this.logDebug) this.emit('debug', `Received message type: ${messageType}, id: ${messageId}, data: ${stringifyMessage}`);
                            return;
                    }
                });

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error}`);
        }
    }

    async connect() {
        try {
            if (this.restFulEnabled) this.emit('restFul', 'powerstate', this.power);
            if (this.mqttEnabled) this.emit('mqtt', 'Power State', this.power);
            if (this.socketConnected || this.connecting) return true;
            if (this.logDebug) this.emit('debug', `Plugin send heartbeat to TV`);

            this.connecting = true;
            try {
                const state = await this.functions.ping(this.host, this.webSocketPort);
                if (!state.online || this.socketConnected) return true;
                if (this.logDebug) this.emit('debug', `Plugin received heartbeat from TV`);
                await this.connectSocket();
            } catch (error) {
                if (this.logError) this.emit('error', `Connection error: ${error}`);
            } finally {
                this.connecting = false;
            }

            return true;
        } catch (error) {
            if (this.logError) this.emit('error', `Impulse generator error: ${error}, trying again`);
        }
    }
}

export default LgWebOsSocket;