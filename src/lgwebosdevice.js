'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const wol = require('@mi-sec/wol');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const LgWebOsSocket = require('./lgwebossocket');
const CONSTANS = require('./constans.json');
let Accessory, Characteristic, Service, Categories, UUID;

class LgWebOsDevice extends EventEmitter {
    constructor(api, prefDir, config) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        UUID = api.hap.uuid;

        //device configuration
        this.name = config.name;
        this.host = config.host;
        this.mac = config.mac;
        this.getInputsFromDevice = config.getInputsFromDevice || false;
        this.filterSystemApps = config.filterSystemApps || false;
        this.inputs = config.inputs || [];
        this.buttons = config.buttons || [];
        this.sensorPower = config.sensorPower || false;
        this.sensorPixelRefresh = config.sensorPixelRefresh || false;
        this.sensorVolume = config.sensorVolume || false;
        this.sensorMute = config.sensorMute || false;
        this.sensorInput = config.sensorInput || false;
        this.sensorChannel = config.sensorChannel || false;
        this.sensorSoundMode = config.sensorSoundMode || false;
        this.sensorPictureMode = config.sensorPictureMode || false;
        this.sensorScreenOnOff = config.sensorScreenOnOff || false;
        this.sensorScreenSaver = config.sensorScreenSaver || false;
        this.sensorInputs = config.sensorInputs || [];
        this.brightnessControl = config.brightnessControl || false;
        this.backlightControl = config.backlightControl || false;
        this.contrastControl = config.contrastControl || false;
        this.colorControl = config.colorControl || false;
        this.pictureModeControl = config.pictureModeControl || false;
        this.pictureModes = config.pictureModes || [];
        this.soundModeControl = config.soundModeControl || false;
        this.soundModes = config.soundModes || [];
        this.enableDebugMode = config.enableDebugMode || false;
        this.disableLogInfo = config.disableLogInfo || false;
        this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
        this.disableTvService = config.disableTvService || false;
        this.turnScreenOnOff = config.turnScreenOnOff || false;
        this.sslWebSocket = config.sslWebSocket || false;
        this.infoButtonCommand = config.infoButtonCommand || 'INFO';
        this.volumeControl = config.volumeControl >= 0 ? config.volumeControl : -1;
        this.restFulEnabled = config.enableRestFul || false;
        this.restFulPort = config.restFulPort || 3000;
        this.restFulDebug = config.restFulDebug || false;
        this.mqttEnabled = config.enableMqtt || false;
        this.mqttHost = config.mqttHost;
        this.mqttPort = config.mqttPort || 1883;
        this.mqttClientId = config.mqttClientId || `lgwebos_${Math.random().toString(16).slice(3)}`;
        this.mqttPrefix = config.mqttPrefix;
        this.mqttAuth = config.mqttAuth || false;
        this.mqttUser = config.mqttUser;
        this.mqttPasswd = config.mqttPasswd;
        this.mqttDebug = config.mqttDebug || false;

        //external integrations variable
        this.restFulConnected = false;
        this.mqttConnected = false;

        //accessory services
        this.allServices = [];
        this.buttonsServices = [];
        this.pictureModesServices = [];
        this.sensorInputsServices = [];

        //tv variable
        this.inputs = [...CONSTANS.DefaultInputs, ...this.inputs];
        this.inputsMode = [];
        this.inputsName = [];
        this.inputsReference = [];
        this.inputIdentifier = 0;

        this.power = false;
        this.pixelRefresh = false;
        this.screenState = false;
        this.screenOnOff = false;
        this.screenSaver = false;
        this.appId = '';
        this.volume = 0;
        this.mute = true;
        this.channelId = 0;
        this.channelName = '';
        this.channelNumber = 0;
        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.pictureMode = 3;
        this.soundMode = '';
        this.invertMediaState = false;

        //sensors variable
        this.sensorInputsReference = [];
        this.sensorInputsDisplayType = [];
        this.sensorVolumeState = false;
        this.sensorInputState = false;
        this.sensorChannelState = false;
        this.sensorSoundModeState = false;
        this.sensorPicturedModeState = false;

        //check files exists, if not then create it
        const postFix = this.host.split('.').join('');
        this.keyFile = `${prefDir}/key_${postFix}`;
        this.devInfoFile = `${prefDir}/devInfo_${postFix}`;
        this.inputsFile = `${prefDir}/inputs_${postFix}`;
        this.inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
        this.inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;
        this.channelsFile = `${prefDir}/channels_${postFix}`;

        try {
            const files = [
                this.keyFile,
                this.devInfoFile,
                this.inputsFile,
                this.inputsNamesFile,
                this.inputsTargetVisibilityFile,
                this.channelsFile
            ];

            files.forEach((file) => {
                if (!fs.existsSync(file)) {
                    fs.writeFileSync(file, ' ');
                }
            });
        } catch (error) {
            this.emit('error', `prepare files error: ${error}`);
        }

        //RESTFul server
        if (this.restFulEnabled) {
            this.restFul = new RestFul({
                port: this.restFulPort,
                debug: this.restFulDebug
            });

            this.restFul.on('connected', (message) => {
                this.emit('message', `${message}`);
                this.restFulConnected = true;
            })
                .on('error', (error) => {
                    this.emit('error', error);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                });
        }

        //MQTT client
        if (this.mqttEnabled) {
            this.mqtt = new Mqtt({
                host: this.mqttHost,
                port: this.mqttPort,
                clientId: this.mqttClientId,
                user: this.mqttUser,
                passwd: this.mqttPasswd,
                prefix: `${this.mqttPrefix}/${this.name}`,
                debug: this.mqttDebug
            });

            this.mqtt.on('connected', (message) => {
                this.emit('message', message);
                this.mqttConnected = true;
            })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        }

        //lg tv client
        this.lgWebOsSocket = new LgWebOsSocket({
            host: this.host,
            keyFile: this.keyFile,
            debugLog: this.enableDebugMode,
            restFulEnabled: this.restFulEnabled,
            mqttEnabled: this.mqttEnabled,
            sslWebSocket: this.sslWebSocket
        });

        this.lgWebOsSocket.on('deviceInfo', async (modelName, productName, deviceId, firmwareRevision, webOS) => {
            try {
                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer: LG Electronics`);
                    this.emit('devInfo', `Model: ${modelName}`);
                    this.emit('devInfo', `System: ${productName}`);
                    this.emit('devInfo', `Serialnr: ${deviceId}`);
                    this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                    this.emit('devInfo', `----------------------------------`);
                };

                const data = await fsPromises.readFile(this.devInfoFile);
                const savedInfo = data.length > 5 ? JSON.parse(data) : {};
                const infoHasNotchanged =
                    'LG Electronics' === savedInfo.manufacturer
                    && modelName === savedInfo.modelName
                    && productName === savedInfo.productName
                    && deviceId === savedInfo.deviceId
                    && firmwareRevision === savedInfo.firmwareRevision
                    && webOS === savedInfo.webOS;

                if (infoHasNotchanged) {
                    return;
                };

                if (this.informationService) {
                    this.informationService
                        .setCharacteristic(Characteristic.Manufacturer, 'LG Electronics')
                        .setCharacteristic(Characteristic.Model, modelName)
                        .setCharacteristic(Characteristic.SerialNumber, deviceId)
                        .setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
                };

                const obj = {
                    manufacturer: 'LG Electronics',
                    modelName: modelName,
                    productName: productName,
                    deviceId: deviceId,
                    firmwareRevision: firmwareRevision,
                    webOS: webOS
                };
                const devInfo = JSON.stringify(obj, null, 2);
                await fsPromises.writeFile(this.devInfoFile, devInfo);
                const debug = this.enableDebugMode ? this.emit('debug', `Saved device info: ${devInfo}`) : false;
            } catch (error) {
                this.emit('error', `save device info error: ${error}`);
            }
        })
            .on('channelList', async (channelList) => {
                try {
                    const channelsArr = [];
                    for (const channell of channelList) {
                        const name = channell.channelName;
                        const channelId = channell.channelId;
                        const number = channell.channelNumber;
                        const channelsObj = {
                            'name': name,
                            'reference': channelId,
                            'number': number,
                            'mode': 1
                        }
                        channelsArr.push(channelsObj);
                    };
                    const channels = JSON.stringify(channelsArr, null, 2);
                    await fsPromises.writeFile(this.channelsFile, channels);
                    const debug = this.enableDebugMode ? this.emit('debug', `Channels list saved: ${channels}`) : false;
                } catch (error) {
                    this.emit('error', `save channels list error: ${error}`);
                }
            })
            .on('appsList', async (appsList) => {
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
                    await fsPromises.writeFile(this.inputsFile, inputs);
                    const debug = this.enableDebugMode ? this.emit('debug', `Apps list saved: ${inputs}`) : false;
                } catch (error) {
                    this.emit('error', `save apps list error: ${error}`);
                }
            })
            .on('powerState', (power, pixelRefresh, screenState, tvScreenState) => {

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.Active, power);
                    if (this.turnScreenOnOffService) {
                        this.turnScreenOnOffService
                            .updateCharacteristic(Characteristic.On, screenState);
                    };
                };

                if (this.sensorPowerService) {
                    this.sensorPowerService
                        .updateCharacteristic(Characteristic.ContactSensorState, power)
                }

                if (this.sensorPixelRefreshService) {
                    this.sensorPixelRefreshService
                        .updateCharacteristic(Characteristic.ContactSensorState, pixelRefresh)
                }

                if (this.sensorScreenOnOffService) {
                    const state = power ? (tvScreenState === 'Screen Off') : false;
                    this.sensorScreenOnOffService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.screenOnOff = state;
                }

                if (this.sensorScreenSaverService) {
                    const state = power ? (tvScreenState === 'Screen Saver') : false;
                    this.sensorScreenSaverService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.screenSaver = state;
                }

                this.power = power;
                this.screenState = screenState;
                this.pixelRefresh = pixelRefresh;
            })
            .on('currentApp', (appId) => {
                const inputIdentifier = this.inputsReference.includes(appId) ? this.inputsReference.findIndex(index => index === appId) : undefined;

                if (this.televisionService && inputIdentifier !== undefined) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                    this.inputIdentifier = inputIdentifier;
                };

                if (this.sensorInputService && inputIdentifier !== undefined) {
                    const state = this.power ? (this.inputIdentifier !== inputIdentifier) : false;
                    this.sensorInputService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorInputState = state;
                    this.inputIdentifier = inputIdentifier;
                }

                if (appId) {
                    if (this.sensorInputsServices) {
                        const servicesCount = this.sensorInputsServices.length;
                        for (let i = 0; i < servicesCount; i++) {
                            const state = this.power ? (this.sensorInputsReference[i] === appId) : false;
                            const displayType = this.sensorInputsDisplayType[i];
                            const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                            this.sensorInputsServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }
                    this.appId = appId;
                }
            })
            .on('audioState', (volume, mute) => {

                if (this.speakerService) {
                    if (volume) {
                        this.speakerService
                            .updateCharacteristic(Characteristic.Volume, volume)

                        if (this.volumeService) {
                            this.volumeService
                                .updateCharacteristic(Characteristic.Brightness, volume)
                        };

                        if (this.volumeServiceFan) {
                            this.volumeServiceFan
                                .updateCharacteristic(Characteristic.RotationSpeed, volume)
                        };
                        this.volume = volume;
                    };

                    if (mute) {
                        this.speakerService
                            .updateCharacteristic(Characteristic.Mute, mute);

                        if (this.volumeService) {
                            this.volumeService
                                .updateCharacteristic(Characteristic.On, !mute);
                        };

                        if (this.volumeServiceFan) {
                            this.volumeServiceFan
                                .updateCharacteristic(Characteristic.On, !mute);
                        };
                        this.mute = mute;
                    };
                };

                if (this.sensorVolumeService && volume) {
                    const state = this.power ? (this.volume !== volume) : false;
                    this.sensorVolumeService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorVolumeState = state;
                    this.volume = volume;
                }

                if (this.sensorMuteService && mute) {
                    const state = this.power ? mute : false;
                    this.sensorMuteService
                        .updateCharacteristic(Characteristic.ContactSensorState, state);
                    this.mute = mute;
                }
            })
            .on('currentChannel', (channelId, channelName, channelNumber) => {
                const inputIdentifier = this.inputsReference.includes(channelId) ? this.inputsReference.findIndex(index => index === channelId) : undefined;

                if (this.televisionService && inputIdentifier !== undefined) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                    this.inputIdentifier = inputIdentifier;
                };

                if (this.sensorChannelService && inputIdentifier !== undefined) {
                    const state = this.power ? (this.inputIdentifier !== inputIdentifier) : false;
                    this.sensorChannelService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorChannelState = state;
                    this.inputIdentifier = inputIdentifier;
                }

                if (channelId) {
                    this.channelId = channelId;
                }

                if (channelName) {
                    this.channelName = channelName;
                }

                if (channelNumber) {
                    this.channelNumber = channelNumber;
                }
            })
            .on('pictureSettings', (brightness, backlight, contrast, color, pictureMode, power) => {

                if (this.televisionService) {
                    if (brightness) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.PictureMode, pictureMode);
                        this.brightness = brightness;
                    };
                    if (pictureMode) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.PictureMode, pictureMode);
                        this.pictureMode = pictureMode;
                    };
                };

                if (this.brightnessService && brightness) {
                    this.brightnessService
                        .updateCharacteristic(Characteristic.Brightness, brightness);
                    this.brightness = brightness;
                };

                if (this.backlightService && backlight) {
                    this.backlightService
                        .updateCharacteristic(Characteristic.Brightness, backlight);
                    this.backlight = backlight;
                };

                if (this.contrastService && contrast) {
                    this.contrastService
                        .updateCharacteristic(Characteristic.Brightness, contrast);
                    this.contrast = contrast;
                };

                if (this.colorService && color) {
                    this.colorService
                        .updateCharacteristic(Characteristic.Brightness, color);
                    this.color = color;
                };

                if (this.pictureModesServices && pictureMode) {
                    const servicesCount = this.pictureModesServices.length;
                    for (let i = 0; i < servicesCount; i++) {
                        const state = power ? (this.pictureModes[i].reference === pictureMode) : false;
                        this.pictureModesServices[i]
                            .updateCharacteristic(Characteristic.On, state);
                    };
                    this.pictureMode = pictureMode;
                };

                if (this.sensorPicturedModeService && pictureMode) {
                    const state = power ? (this.pictureMode !== pictureMode) : false;
                    this.sensorPicturedModeService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorPicturedModeState = state;
                    this.pictureMode = pictureMode;
                }
            })
            .on('soundMode', (soundMode, power) => {

                if (this.soundModesServices && soundMode) {
                    const servicesCount = this.soundModesServices.length;
                    for (let i = 0; i < servicesCount; i++) {
                        const state = power ? (this.soundModes[i].reference === soundMode) : false;
                        this.soundModesServices[i]
                            .updateCharacteristic(Characteristic.On, state);
                    };
                    this.soundMode = soundMode;
                };

                if (this.sensorSoundModeService && soundMode) {
                    const state = this.power ? (this.soundMode !== soundMode) : false;
                    this.sensorSoundModeService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorSoundModeState = state;
                    this.soundMode = soundMode;
                }
            })
            .on('prepareAccessory', async () => {
                try {

                    //read dev info from file
                    try {
                        const data = await fsPromises.readFile(this.devInfoFile);
                        this.savedInfo = data.length > 5 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`) : false;
                        this.webOS = this.savedInfo.webOS ?? 2.0;
                    } catch (error) {
                        this.emit('error', `read saved Info error: ${error}`);
                    };

                    //read inputs file
                    try {
                        const data = await fsPromises.readFile(this.inputsFile);
                        this.savedInputs = data.length > 5 ? JSON.parse(data) : this.inputs;
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `read saved Inputs error: ${error}`);
                    };

                    //read channels from file
                    try {
                        const data = await fsPromises.readFile(this.channelsFile);
                        this.savedChannels = data.length > 5 ? JSON.parse(data) : [];
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Channels: ${JSON.stringify(this.savedChannels, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `read saved Channels error: ${error}`);
                    };

                    //read inputs names from file
                    try {
                        const data = await fsPromises.readFile(this.inputsNamesFile);
                        this.savedInputsNames = data.length > 5 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `read saved Inputs/Channels Names error: ${error}`);
                    };

                    //read inputs visibility from file
                    try {
                        const data = await fsPromises.readFile(this.inputsTargetVisibilityFile);
                        this.savedInputsTargetVisibility = data.length > 5 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `read saved Inputs/Channels Target Visibility error: ${error}`);
                    };

                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const accessory = await this.prepareAccessory();
                    this.emit('publishAccessory', accessory)
                } catch (error) {
                    this.emit('error', `prepare accessory error: ${error}`);
                };
            })
            .on('message', (message) => {
                this.emit('message', message);
            })
            .on('debug', (debug) => {
                this.emit('debug', debug);
            })
            .on('error', (error) => {
                this.emit('error', error);
            })
            .on('restFul', (path, data) => {
                const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
            })
            .on('mqtt', (topic, message) => {
                const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
            });
    };

    //Prepare accessory
    prepareAccessory() {
        return new Promise((resolve, reject) => {
            try {
                //accessory
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare accessory`);

                const accessoryName = this.name;
                const accessoryUUID = UUID.generate(this.mac);
                const accessoryCategory = Categories.TELEVISION;
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //information service
                const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Prepare information service`);
                this.informationService = accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer ?? 'LG Electronics')
                    .setCharacteristic(Characteristic.Model, this.savedInfo.modelName ?? 'Model Name')
                    .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.deviceId ?? 'Serial Number')
                    .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision ?? 'Firmware Revision');
                this.allServices.push(this.informationService);

                //prepare television service 
                if (!this.disableTvService) {
                    const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Prepare television service`);
                    this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
                    this.televisionService.getCharacteristic(Characteristic.ConfiguredName)
                        .onGet(async () => {
                            const info = this.disableLogInfo ? false : this.emit('message', `Accessory Name: ${accessoryName}.`);
                            return accessoryName;
                        })
                        .onSet(async (value) => {
                            try {
                                this.name = value;
                                const info = this.disableLogInfo ? false : this.emit('message', `set Accessory Name: ${value}`);
                            } catch (error) {
                                this.emit('error', `set Brightness error: ${error}`);
                            };
                        });
                    this.televisionService.getCharacteristic(Characteristic.SleepDiscoveryMode)
                        .onGet(async () => {
                            const state = 1;
                            const info = this.disableLogInfo ? false : this.emit('message', `Discovery Mode: ${state ? 'Always discoverable' : 'Not discoverable'}`);
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const info = this.disableLogInfo ? false : this.emit('message', `set Discovery Mode: ${state ? 'Always discoverable' : 'Not discoverable'}`);
                            } catch (error) {
                                this.emit('error', `set Discovery Mode error: ${error}`);
                            };
                        });

                    this.televisionService.getCharacteristic(Characteristic.Active)
                        .onGet(async () => {
                            const state = this.power;
                            const info = this.disableLogInfo ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                switch (this.power) {
                                    case false:
                                        const options = {
                                            address: '255.255.255.255',
                                            packets: 3,
                                            interval: 100,
                                            port: 9
                                        }
                                        await wol(this.mac, options);
                                        break;
                                    case true:
                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.TurnOff);
                                        break;
                                }
                                const info = this.disableLogInfo || (state == this.power) ? false : this.emit('message', `set Power: ${state ? 'ON' : 'OFF'}`);
                                await new Promise(resolve => setTimeout(resolve, 2500));
                            } catch (error) {
                                this.emit('error', `set Power error: ${error}`);
                            }
                        });

                    this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                        .onGet(async () => {
                            const inputIdentifier = this.inputIdentifier;
                            const inputMode = this.inputsMode[inputIdentifier];
                            const inputName = this.inputsName[inputIdentifier];
                            const inputReference = this.inputsReference[inputIdentifier];
                            const info = this.disableLogInfo ? false : this.emit('message', `${inputMode === 0 ? 'Input' : 'Channel'}, Name: ${inputName}, Reference: ${inputReference}`);
                            return inputIdentifier;
                        })
                        .onSet(async (inputIdentifier) => {
                            try {
                                const inputMode = this.inputsMode[inputIdentifier];
                                const inputName = this.inputsName[inputIdentifier];
                                const inputReference = this.inputsReference[inputIdentifier];

                                switch (this.power) {
                                    case false:
                                        await new Promise(resolve => setTimeout(resolve, 4000));
                                        this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                                        break;
                                    case true:
                                        switch (inputMode) {
                                            case 0:
                                                await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.LaunchApp, { id: inputReference });
                                                break;
                                            case 1:
                                                const liveTv = 'com.webos.app.livetv';
                                                const openLiveTv = this.appId !== liveTv ? await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.LaunchApp, { id: liveTv }) : false;
                                                await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.OpenChannel, { channelId: inputReference })
                                                break;
                                        }

                                        const info = this.disableLogInfo ? false : this.emit('message', `set ${inputMode === 0 ? 'Input' : 'Channel'}, Name: ${inputName}, Reference: ${inputReference}`);
                                        break;
                                }
                            } catch (error) {
                                this.emit('error', `set Input or Channel error: ${error}`);
                            };
                        });

                    this.televisionService.getCharacteristic(Characteristic.RemoteKey)
                        .onSet(async (command) => {
                            try {
                                switch (command) {
                                    case Characteristic.RemoteKey.REWIND:
                                        command = 'REWIND';
                                        break;
                                    case Characteristic.RemoteKey.FAST_FORWARD:
                                        command = 'FASTFORWARD';
                                        break;
                                    case Characteristic.RemoteKey.NEXT_TRACK:
                                        command = 'GOTONEXT';
                                        break;
                                    case Characteristic.RemoteKey.PREVIOUS_TRACK:
                                        command = 'GOTOPREV';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_UP:
                                        command = 'UP';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_DOWN:
                                        command = 'DOWN';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_LEFT:
                                        command = 'LEFT';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_RIGHT:
                                        command = 'RIGHT';
                                        break;
                                    case Characteristic.RemoteKey.SELECT:
                                        command = 'ENTER';
                                        break;
                                    case Characteristic.RemoteKey.BACK:
                                        command = 'BACK';
                                        break;
                                    case Characteristic.RemoteKey.EXIT:
                                        command = 'EXIT';
                                        break;
                                    case Characteristic.RemoteKey.PLAY_PAUSE:
                                        command = this.invertMediaState ? 'PLAY' : 'PAUSE';
                                        this.invertMediaState = !this.invertMediaState;
                                        break;
                                    case Characteristic.RemoteKey.INFORMATION:
                                        command = this.infoButtonCommand;
                                        break;
                                }

                                const payload = {
                                    name: command
                                };
                                await this.lgWebOsSocket.send('button', payload);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Remote Key: ${command}`);
                            } catch (error) {
                                this.emit('error', `set Remote Key error: ${error}`);
                            };
                        });

                    //optional television characteristics
                    this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
                        .onGet(async () => {
                            const state = 0;
                            const info = this.disableLogInfo ? false : this.emit('message', `Closed Captions: ${state}`);
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const info = this.disableLogInfo ? false : this.emit('message', `set Closed Captions: ${state}`);
                            } catch (error) {
                                this.emit('error', `set Closed Captions error: ${error}`);
                            };
                        });

                    this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
                        .onGet(async () => {
                            //0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
                            const value = 2;
                            const info = this.disableLogInfo ? false : this.emit('message', `Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                            return value;
                        });

                    this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
                        .onGet(async () => {
                            //0 - PLAY, 1 - PAUSE, 2 - STOP
                            const value = 2;
                            const info = this.disableLogInfo ? false : this.emit('message', `Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                const newMediaState = [CONSTANS.ApiUrls.SetMediaPlay, CONSTANS.ApiUrls.SetMediaPause, CONSTANS.ApiUrls.SetMediaStop][value]
                                await this.lgWebOsSocket.send('request', newMediaState);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                            } catch (error) {
                                this.emit('error', `set Media error: ${error}`);
                            };
                        });

                    this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
                        .onSet(async (command) => {
                            try {
                                switch (command) {
                                    case Characteristic.PowerModeSelection.SHOW:
                                        command = 'MENU';
                                        break;
                                    case Characteristic.PowerModeSelection.HIDE:
                                        command = 'BACK';
                                        break;
                                };

                                const payload = {
                                    name: command
                                };
                                await this.lgWebOsSocket.send('button', payload);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Power Mode Selection: ${command === 'MENU' ? 'SHOW' : 'HIDE'}`);
                            } catch (error) {
                                this.emit('error', `set Power Mode Selection error: ${error}`);
                            };
                        });

                    if (this.webOS >= 4.0) {
                        this.televisionService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const brightness = this.brightness;
                                return brightness;
                            })
                            .onSet(async (value) => {
                                try {
                                    const payload = {
                                        'settings': {
                                            'brightness': value
                                        }
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Brightness: ${value}`);
                                } catch (error) {
                                    this.emit('error', `set Brightness error: ${error}`);
                                };
                            });

                        this.televisionService.getCharacteristic(Characteristic.PictureMode)
                            .onGet(async () => {
                                const value = this.pictureMode;
                                const info = this.disableLogInfo ? false : this.emit('message', `Picture Mode: ${value}`);
                                return value;
                            })
                            .onSet(async (command) => {
                                try {
                                    switch (command) {
                                        case Characteristic.PictureMode.OTHER:
                                            command = 'cinema';
                                            break;
                                        case Characteristic.PictureMode.STANDARD:
                                            command = 'normal';
                                            break;
                                        case Characteristic.PictureMode.CALIBRATED:
                                            command = 'expert1';
                                            break;
                                        case Characteristic.PictureMode.CALIBRATED_DARK:
                                            command = 'expert2';
                                            break;
                                        case Characteristic.PictureMode.VIVID:
                                            command = 'vivid';
                                            break;
                                        case Characteristic.PictureMode.GAME:
                                            command = 'game';
                                            break;
                                        case Characteristic.PictureMode.COMPUTER:
                                            command = 'photo';
                                            break;
                                        case Characteristic.PictureMode.CUSTOM:
                                            command = 'sport';
                                            break;
                                    };

                                    const payload = {
                                        category: 'picture',
                                        settings: {
                                            'pictureMode': command
                                        }
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Picture Mode: ${command}`);
                                } catch (error) {
                                    this.emit('error', `set Picture Mode error: ${error}`);
                                };
                            });
                    };

                    this.allServices.push(this.televisionService);
                    accessory.addService(this.televisionService);

                    //Prepare speaker service
                    const debug3 = !this.enableDebugMode ? false : this.emit('debug', `Prepare speaker service`);
                    this.speakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
                    this.speakerService.getCharacteristic(Characteristic.Active)
                        .onGet(async () => {
                            const state = this.power;
                            return state;
                        })
                        .onSet(async (state) => {
                        });

                    this.speakerService.getCharacteristic(Characteristic.VolumeControlType)
                        .onGet(async () => {
                            const state = 3; //none, relative, relative with current, absolute
                            return state;
                        });

                    this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
                        .onSet(async (command) => {
                            try {
                                switch (command) {
                                    case Characteristic.VolumeSelector.INCREMENT:
                                        command = 'VOLUMEUP';
                                        break;
                                    case Characteristic.VolumeSelector.DECREMENT:
                                        command = 'VOLUMEDOWN';
                                        break;
                                };

                                const payload = {
                                    name: command
                                };
                                await this.lgWebOsSocket.send('button', payload);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Volume Selector: ${command}`);
                            } catch (error) {
                                this.emit('error', `set Volume Selector error: ${error}`);
                            };
                        });

                    this.speakerService.getCharacteristic(Characteristic.Volume)
                        .onGet(async () => {
                            const volume = this.volume;
                            const info = this.disableLogInfo ? false : this.emit('message', `Volume: ${volume}`);
                            return volume;
                        })
                        .onSet(async (volume) => {
                            try {
                                if (volume === 0 || volume === 100) {
                                    volume = this.volume;
                                };

                                const payload = {
                                    volume: volume,
                                    soundOutput: this.soundOutput
                                };
                                await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetVolume, payload);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
                            } catch (error) {
                                this.emit('error', `set Volume error: ${error}`);
                            };
                        });

                    this.speakerService.getCharacteristic(Characteristic.Mute)
                        .onGet(async () => {
                            const state = this.power ? this.mute : true;
                            const info = this.disableLogInfo ? false : this.emit('message', `Mute: ${state ? 'ON' : 'OFF'}`);
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const payload = {
                                    mute: state
                                };
                                await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetMute, payload);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                this.emit('error', `set Mute error: ${error}`);
                            };
                        });
                    this.allServices.push(this.tvSpeakerService);
                    accessory.addService(this.speakerService);

                    //Prepare inputs service
                    //check possible inputs and filter custom unnecessary inputs
                    const filteredInputsArr = [];
                    for (const input of this.savedInputs) {
                        const reference = input.reference;
                        const filterSystemApps = this.filterSystemApps ? CONSTANS.SystemApps.includes(reference) : false;
                        const push = this.getInputsFromDevice ? (!filterSystemApps) ? filteredInputsArr.push(input) : false : filteredInputsArr.push(input);
                    }

                    //check possible inputs and possible inputs count (max 90)
                    const inputs = filteredInputsArr;
                    const inputsCount = inputs.length;
                    const possibleInputsCount = 80 - this.allServices.length;
                    const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
                    for (let i = 0; i < maxInputsCount; i++) {
                        //input
                        const input = inputs[i];

                        //get input mode
                        const inputMode = input.mode;

                        //get input reference
                        const inputReference = input.reference;

                        //get input name		
                        const inputName = this.savedInputsNames[inputReference] ?? input.name;

                        //get input type
                        const inputType = 0;

                        //get input configured
                        const isConfigured = 1;

                        //get input visibility state
                        const currentVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;
                        const targetVisibility = currentVisibility;

                        if (inputReference && inputName && inputMode >= 0) {
                            const inputService = new Service.InputSource(inputName, `Input ${i}`);
                            inputService
                                .setCharacteristic(Characteristic.Identifier, i)
                                .setCharacteristic(Characteristic.Name, inputName)
                                .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                                .setCharacteristic(Characteristic.InputSourceType, inputType)
                                .setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)

                            inputService.getCharacteristic(Characteristic.ConfiguredName)
                                .onSet(async (value) => {
                                    try {
                                        this.savedInputsNames[inputReference] = value;
                                        const newCustomName = JSON.stringify(this.savedInputsNames, null, 2);

                                        await fsPromises.writeFile(this.inputsNamesFile, newCustomName);
                                        const debug = this.enableDebugMode ? this.emit('debug', `Saved ${inputMode === 0 ? 'Input' : 'Channel'} Name: ${value}, Reference: ${inputReference}`) : false;
                                        inputService.setCharacteristic(Characteristic.Name, value);
                                    } catch (error) {
                                        this.emit('error', `save Input error: ${error}`);
                                    }
                                });

                            inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                                .onGet(async () => {
                                    return targetVisibility;
                                })
                                .onSet(async (state) => {
                                    try {
                                        this.savedInputsTargetVisibility[inputReference] = state;
                                        const newTargetVisibility = JSON.stringify(this.savedInputsTargetVisibility, null, 2);

                                        await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility);
                                        const debug = this.enableDebugMode ? this.emit('debug', `Saved ${inputMode === 0 ? 'Input' : 'Channel'}: ${inputName}, Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
                                        inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
                                    } catch (error) {
                                        this.emit('error', `save Target Visibility error: ${error}`);
                                    }
                                });

                            this.inputsMode.push(inputMode);
                            this.inputsName.push(inputName);
                            this.inputsReference.push(inputReference);

                            this.televisionService.addLinkedService(inputService);
                            this.allServices.push(inputService);
                            accessory.addService(inputService);
                        } else {
                            this.emit('message', `Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}, Mode: ${inputMode ? inputMode : 'Missing'}.`);
                        };
                    }
                }

                //Prepare volume service
                if (this.volumeControl >= 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume service`);
                    if (this.volumeControl === 0) {
                        this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
                        this.volumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume`);
                        this.volumeService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (volume) => {
                                try {
                                    if (volume === 0 || volume === 100) {
                                        volume = this.volume;
                                    };

                                    const payload = {
                                        volume: volume,
                                        soundOutput: this.soundOutput
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetVolume, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
                                } catch (error) {
                                    this.emit('error', `set Volume error: ${error}`);
                                };
                            });
                        this.volumeService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const payload = {
                                        mute: !state
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetMute, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    this.emit('error', `set Mute error: ${error}`);
                                };
                            });

                        this.allServices.push(this.volumeService);
                        accessory.addService(this.volumeService);
                    }

                    if (this.volumeControl === 1) {
                        this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume`);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (volume) => {
                                try {
                                    if (volume === 0 || volume === 100) {
                                        volume = this.volume;
                                    };

                                    const payload = {
                                        volume: volume,
                                        soundOutput: this.soundOutput
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetVolume, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
                                } catch (error) {
                                    this.emit('error', `set Volume error: ${error}`);
                                };
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const payload = {
                                        mute: !state
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetMute, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    this.emit('error', `set Mute error: ${error}`);
                                };
                            });

                        this.allServices.push(this.volumeServiceFan);
                        accessory.addService(this.volumeServiceFan);
                    }
                }

                //Picture Control
                if (this.webOS >= 4.0) {
                    //Backlight
                    if (this.backlightControl) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare backlight service`);
                        this.backlightService = new Service.Lightbulb(`${accessoryName} Backlight`, 'Backlight');
                        this.backlightService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.backlightService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Backlight`);
                        this.backlightService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.backlightService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const value = this.backlight;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    const payload = {
                                        'settings': {
                                            'backlight': value
                                        }
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Backlight: ${value}`);
                                } catch (error) {
                                    this.emit('error', `set Backlight error: ${error}`);
                                };
                            });

                        this.allServices.push(this.backlightService);
                        accessory.addService(this.backlightService);
                    }

                    //Brightness
                    if (this.brightnessControl) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare brightness service`);
                        this.brightnessService = new Service.Lightbulb(`${accessoryName} Brightness`, 'Brightness');
                        this.brightnessService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.brightnessService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Backlight`);
                        this.brightnessService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { })
                        this.brightnessService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const value = this.brightness;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    const payload = {
                                        'settings': {
                                            'brightness': value
                                        }
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Brightness: ${value}`);
                                } catch (error) {
                                    this.emit('error', `set Brightness error: ${error}`);
                                };
                            });

                        this.allServices.push(this.brightnessService);
                        accessory.addService(this.brightnessService);
                    }

                    //Contrast
                    if (this.contrastControl) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare contrast service`);
                        this.contrastService = new Service.Lightbulb(`${accessoryName} Contrast`, 'Contrast');
                        this.contrastService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.contrastService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Contrast`);
                        this.contrastService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.contrastService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const value = this.contrast;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    const payload = {
                                        'settings': {
                                            'contrast': value
                                        }
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Contrast: ${value}`);
                                } catch (error) {
                                    this.emit('error', `set Contrast error: ${error}`);
                                };
                            });

                        this.allServices.push(this.contrastService);
                        accessory.addService(this.contrastService);
                    }

                    //Color
                    if (this.colorControl) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare color service`);
                        this.colorService = new Service.Lightbulb(`${accessoryName} Color`, 'Color');
                        this.colorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.colorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Color`);
                        this.colorService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.colorService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const value = this.color;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    const payload = {
                                        'settings': {
                                            'color': value
                                        }
                                    };
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Color: ${value}`);
                                } catch (error) {
                                    this.emit('error', `set Color error: ${error}`);
                                };
                            });

                        this.allServices.push(this.colorService);
                        accessory.addService(this.colorService);
                    }

                    //Picture mode
                    if (this.pictureModeControl) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare picture mode service`);
                        const pictureModes = this.pictureModes;
                        const pictureModesCount = pictureModes.length;
                        for (let i = 0; i < pictureModesCount; i++) {
                            const pictureModeName = pictureModes[i].name;
                            const pictureModeReference = pictureModes[i].reference;
                            const pictureModeService = new Service.Switch(`${accessoryName} ${pictureModeName}`, `Picture Mode ${i}`);
                            pictureModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            pictureModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${pictureModeName}`);
                            pictureModeService.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = this.power ? (this.pictureMode === pictureModeReference) : false;
                                    const info = this.disableLogInfo ? false : this.emit('message', `Picture Mode: ${pictureModeName}`);
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        const payload = {
                                            category: 'picture',
                                            settings: {
                                                'pictureMode': pictureModeReference
                                            }
                                        }

                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
                                        const info = this.disableLogInfo ? false : this.emit('message', `set Picture Mode: ${pictureModeName}`);
                                    } catch (error) {
                                        this.emit('error', `set Picture Mode error: ${error}`);
                                    };
                                });

                            this.pictureModesServices.push(pictureModeService);
                            this.allServices.push(pictureModeService);
                            accessory.addService(this.pictureModesServices[i]);
                        }
                    }

                    //Sound mode
                    if (this.soundModeControl && this.webOS >= 6.0) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare sound mode service`);
                        const soundModes = this.soundModes;
                        const soundModesCount = soundModes.length;
                        for (let i = 0; i < soundModesCount; i++) {
                            const soundModeName = soundModes[i].name;
                            const soundModeReference = soundModes[i].reference;
                            const soundModeService = new Service.Switch(`${accessoryName} ${soundModeName}`, `Sound Mode ${i}`);
                            soundModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            soundModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${soundModeName}`);
                            soundModeService.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = this.power ? (this.soundMode === soundModeReference) : false;
                                    const info = this.disableLogInfo ? false : this.emit('message', `Sound Mode: ${soundModeName}`);
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        const payload = {
                                            category: 'sound',
                                            settings: {
                                                'soundMode': soundModeReference
                                            }
                                        }

                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
                                        const info = this.disableLogInfo ? false : this.emit('message', `set Sound Mode: ${soundModeName}`);
                                    } catch (error) {
                                        this.emit('error', `set Sound Mode error: ${error}`);
                                    };
                                });

                            this.soundModesServices.push(soundModeService);
                            this.allServices.push(soundModeService);
                            accessory.addService(this.soundModesServices[i]);
                        }
                    }

                    //turn screen ON/OFF
                    if (this.turnScreenOnOff) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare screen off service`);
                        this.turnScreenOnOffService = new Service.Switch(`${accessoryName} Screen Off`, 'Screen Off');
                        this.turnScreenOnOffService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.turnScreenOnOffService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Off`);
                        this.turnScreenOnOffService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.screenState;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const mode = state ? 'screen_on' : 'screen_off';
                                    const payload = {
                                        category: 'picture',
                                        settings: {
                                            'energySaving': mode
                                        }
                                    }
                                    const url = this.webOS <= 5.0 ? (state ? CONSTANS.ApiUrls.TurnOnScreen : CONSTANS.ApiUrls.TurnOffScreen) : (state ? CONSTANS.ApiUrls.TurnOnScreen5 : CONSTANS.ApiUrls.TurnOffScreen5);
                                    await this.lgWebOsSocket.send('request', url);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Turn Screen ${state ? 'ON' : 'OFF'}.`);
                                } catch (error) {
                                    this.emit('error', `Turn Screen ${state ? 'ON' : 'OFF'}, error: ${error}`);
                                };
                            });

                        this.allServices.push(this.turnScreenOnOffService);
                        accessory.addService(this.turnScreenOnOffService);
                    };
                };

                //prepare sensor service
                if (this.sensorPower) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare power sensor service`);
                    this.sensorPowerService = new Service.ContactSensor(`${accessoryName} Power Sensor`, `Power Sensor`);
                    this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                    this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power;
                            return state;
                        });

                    this.allServices.push(this.sensorPowerService);
                    accessory.addService(this.sensorPowerService);
                };

                if (this.sensorPixelRefresh) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare pixel refresh sensor service`);
                    this.sensorPixelRefreshService = new Service.ContactSensor(`${accessoryName} Pixel Refresh Sensor`, `Pixel Refresh Sensor`);
                    this.sensorPixelRefreshService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorPixelRefreshService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Pixel Refresh Sensor`);
                    this.sensorPixelRefreshService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.pixelRefresh;
                            return state;
                        });

                    this.allServices.push(this.sensorPixelRefreshService);
                    accessory.addService(this.sensorPixelRefreshService);
                };

                if (this.sensorVolume) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume sensor service`);
                    this.sensorVolumeService = new Service.ContactSensor(`${accessoryName} Volume Sensor`, `Volume Sensor`);
                    this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                    this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.sensorVolumeState;
                            return state;
                        });

                    this.allServices.push(this.sensorVolumeService);
                    accessory.addService(this.sensorVolumeService);
                };

                if (this.sensorMute) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare mute sensor service`);
                    this.sensorMuteService = new Service.ContactSensor(`${accessoryName} Mute Sensor`, `Mute Sensor`);
                    this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                    this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.mute : false;
                            return state;
                        });

                    this.allServices.push(this.sensorMuteService);
                    accessory.addService(this.sensorMuteService);
                };

                if (this.sensorInput) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare input sensor service`);
                    this.sensorInputService = new Service.ContactSensor(`${accessoryName} Input Sensor`, `Input Sensor`);
                    this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                    this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.sensorInputState;
                            return state;
                        });

                    this.allServices.push(this.sensorInputService);
                    accessory.addService(this.sensorInputService);
                };

                if (this.sensorChannel) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare channel sensor service`);
                    this.sensorChannelService = new Service.ContactSensor(`${accessoryName} Channel Sensor`, `Channel Sensor`);
                    this.sensorChannelService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorChannelService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Channel Sensor`);
                    this.sensorChannelService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.sensorChannelState;
                            return state;
                        });

                    this.allServices.push(this.sensorChannelService);
                    accessory.addService(this.sensorChannelService);
                };

                if (this.sensorScreenOnOff && this.webOS >= 4.0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare screen off sensor service`);
                    this.sensorScreenOnOffService = new Service.ContactSensor(`${accessoryName} Screen On/Off Sensor`, `Screen On/Off Sensor`);
                    this.sensorScreenOnOffService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorScreenOnOffService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen On/Off Sensor`);
                    this.sensorScreenOnOffService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.screenOnOff : false;
                            return state;
                        });

                    this.allServices.push(this.sensorScreenOnOffService);
                    accessory.addService(this.sensorScreenOnOffService);
                };

                if (this.sensorScreenSaver) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare screen saver sensor service`);
                    this.sensorScreenSaverService = new Service.ContactSensor(`${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
                    this.sensorScreenSaverService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorScreenSaverService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Saver Sensor`);
                    this.sensorScreenSaverService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.screenSaver : false;
                            return state;
                        });

                    this.allServices.push(this.sensorScreenSaverService);
                    accessory.addService(this.sensorScreenSaverService);
                };

                if (this.sensorSoundMode && this.webOS >= 6.0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare sound mode sensor service`);
                    this.sensorSoundModeService = new Service.ContactSensor(`${accessoryName} Sound Mode Sensor`, `Sound Mode Sensor`);
                    this.sensorSoundModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorSoundModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Sound Mode Sensor`);
                    this.sensorSoundModeService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.soundModeState : false;
                            return state;
                        });

                    this.allServices.push(this.sensorSoundModeService);
                    accessory.addService(this.sensorSoundModeService);
                };

                if (this.sensorPictureMode && this.webOS >= 4.0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare picture mode sensor service`);
                    this.sensorPictureModeService = new Service.ContactSensor(`${accessoryName} Picture Mode Sensor`, `Picture Mode Sensor`);
                    this.sensorPictureModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorPictureModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Picture Mode Sensor`);
                    this.sensorPictureModeService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.pictureMode : false;
                            return state;
                        });

                    this.allServices.push(this.sensorPictureModeService);
                    accessory.addService(this.sensorPictureModeService);
                };

                //prepare sonsor service
                const sensorInputs = this.sensorInputs;
                const sensorInputsCount = sensorInputs.length;
                const possibleSensorInputsCount = 99 - this.allServices.length;
                const maxSensorInputsCount = sensorInputsCount >= possibleSensorInputsCount ? possibleSensorInputsCount : sensorInputsCount;
                if (maxSensorInputsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensor service`);
                    for (let i = 0; i < maxSensorInputsCount; i++) {
                        //get sensor
                        const sensorInput = sensorInputs[i];

                        //get sensor name		
                        const sensorInputName = sensorInput.name;

                        //get sensor reference
                        const sensorInputReference = sensorInput.reference;

                        //get sensor display type
                        const sensorInputDisplayType = sensorInput.displayType >= 0 ? sensorInput.displayType : -1;

                        if (sensorInputDisplayType >= 0) {
                            if (sensorInputName && sensorInputReference) {
                                const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                                const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                                const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${i}`);
                                sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${sensorInputName}`);
                                sensorInputService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = this.power ? (sensorInputReference === this.appId) : false;
                                        return state;
                                    });

                                this.sensorInputsReference.push(sensorInputReference);
                                this.sensorInputsDisplayType.push(sensorInputDisplayType);
                                this.sensorInputsServices.push(sensorInputService);
                                this.allServices.push(sensorInputService);
                                accessory.addService(this.sensorInputsServices[i]);
                            } else {
                                this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
                            };
                        }
                    }
                }

                //Prepare inputs button services
                const buttons = this.buttons;
                const buttonsCount = buttons.length;
                const possibleButtonsCount = 99 - this.allServices.length;
                const maxButtonsCount = buttonsCount >= possibleButtonsCount ? possibleButtonsCount : buttonsCount;
                if (maxButtonsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare button service`);
                    for (let i = 0; i < maxButtonsCount; i++) {
                        //get button
                        const button = buttons[i];

                        //get button name
                        const buttonName = button.name;

                        //get button mode
                        const buttonMode = button.mode;

                        //get button reference
                        const buttonReference = button.reference;

                        //get button command
                        const buttonCommand = button.command;

                        //get button reference/command
                        const buttonReferenceCommand = [buttonReference, 'com.webos.app.livetv', buttonCommand][buttonMode];

                        //get button display type
                        const buttonDisplayType = button.displayType >= 0 ? button.displayType : -1;

                        if (buttonDisplayType >= 0) {
                            if (buttonName && buttonReferenceCommand && buttonMode) {
                                const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
                                const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${buttonName}`);
                                buttonService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = false;
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            if (this.power && state) {
                                                switch (buttonMode) {
                                                    case 0:
                                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.LaunchApp, { id: buttonReference });
                                                        break;
                                                    case 1:
                                                        const liveTv = 'com.webos.app.livetv';
                                                        const openLiveTv = this.appId !== liveTv ? await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.LaunchApp, { id: liveTv }) : false;
                                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.OpenChannel, { channelId: buttonReference })
                                                        break;
                                                    case 2:
                                                        await this.lgWebOsSocket.send('button', { name: buttonCommand });
                                                        break;
                                                }
                                                const debug = this.enableDebugMode ? this.emit('debug', `Set ${['Input', 'Channel', 'Command'][buttonMode]} Name: ${buttonName}, Reference: ${[buttonReference, buttonReference, buttonCommand][buttonMode]}`) : false;
                                            }
                                            await new Promise(resolve => setTimeout(resolve, 300));
                                            const setChar = state ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
                                        } catch (error) {
                                            this.emit('error', `set ${['Input', 'Channel', 'Command'][buttonMode]} error: ${error}`);
                                        };
                                    });
                                this.buttonsServices.push(buttonService);
                                this.allServices.push(buttonService);
                                accessory.addService(this.buttonsServices[i]);
                            } else {
                                this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand ? buttonReferenceCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}..`);
                            };
                        };
                    };
                };

                resolve(accessory);
            } catch (error) {
                reject(error)
            };
        });
    };
};

module.exports = LgWebOsDevice;