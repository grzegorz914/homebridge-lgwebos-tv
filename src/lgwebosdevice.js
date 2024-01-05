'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const Wol = require('./wol.js');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const LgWebOsSocket = require('./lgwebossocket');
const CONSTANS = require('./constans.json');
let Accessory, Characteristic, Service, Categories, Encode, UUID;

class LgWebOsDevice extends EventEmitter {
    constructor(api, prefDir, config) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        UUID = api.hap.uuid;

        //device configuration
        this.name = config.name;
        this.host = config.host;
        this.mac = config.mac;
        this.getInputsFromDevice = config.getInputsFromDevice || false;
        this.filterSystemApps = this.getInputsFromDevice ? config.filterSystemApps : false;
        this.disableLoadDefaultInputs = config.disableLoadDefaultInputs || false;
        this.inputs = config.inputs || [];
        this.inputsDisplayOrder = config.inputsDisplayOrder || 0;
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
        this.soundsModesServices = [];
        this.picturesModesServices = [];
        this.sensorsInputsServices = [];

        //add configured inputs to the default inputs
        this.inputs = this.disableLoadDefaultInputs ? this.inputs : [...CONSTANS.DefaultInputs, ...this.inputs];
        this.inputsConfigured = [];
        this.inputIdentifier = 1;

        //state variable
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
        this.sensorsInputsConfigured = [];
        this.sensorVolumeState = false;
        this.sensorInputState = false;
        this.sensorChannelState = false;
        this.sensorSoundModeState = false;
        this.sensorPicturedModeState = false;

        //buttons variable
        this.buttonsConfigured = [];

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
                    fs.writeFileSync(file, '');
                }
            });
        } catch (error) {
            this.emit('error', `prepare files error: ${error}`);
        }

        //Wake On Lan
        this.wol = new Wol({
            mac: this.mac,
            host: this.host,
            debugLog: this.enableDebugMode
        })
            .on('error', (error) => {
                this.emit('error', error);
            })
            .on('debug', (debug) => {
                this.emit('debug', debug);
            });

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
            inputs: this.inputs,
            keyFile: this.keyFile,
            devInfoFile: this.devInfoFile,
            inputsFile: this.inputsFile,
            channelsFile: this.channelsFile,
            getInputsFromDevice: this.getInputsFromDevice,
            debugLog: this.enableDebugMode,
            restFulEnabled: this.restFulEnabled,
            mqttEnabled: this.mqttEnabled,
            sslWebSocket: this.sslWebSocket
        });

        this.lgWebOsSocket.on('deviceInfo', (modelName, productName, deviceId, firmwareRevision) => {
            this.emit('message', 'Connected.');
            if (!this.disableLogDeviceInfo) {
                this.emit('devInfo', `-------- ${this.name} --------`);
                this.emit('devInfo', `Manufacturer: LG Electronics`);
                this.emit('devInfo', `Model: ${modelName}`);
                this.emit('devInfo', `System: ${productName}`);
                this.emit('devInfo', `Serialnr: ${deviceId}`);
                this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                this.emit('devInfo', `----------------------------------`);
            };
        })
            .on('powerState', (power, pixelRefresh, screenState, tvScreenState) => {
                this.power = power;
                this.pixelRefresh = pixelRefresh;
                this.screenState = screenState;

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.Active, power);
                };

                if (this.turnScreenOnOffService) {
                    this.turnScreenOnOffService
                        .updateCharacteristic(Characteristic.On, screenState);
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
                    this.screenOnOff = state;
                    this.sensorScreenOnOffService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (this.sensorScreenSaverService) {
                    const state = power ? (tvScreenState === 'Screen Saver') : false;
                    this.screenSaver = state;
                    this.sensorScreenSaverService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (!this.disableLogInfo) {
                    this.emit('message', `Power: ${power ? 'ON' : 'OFF'}`);
                };
            })
            .on('currentApp', (appId) => {
                const index = this.inputsConfigured.findIndex(input => input.reference === appId) ?? -1;
                const inputIdentifier = index !== -1 ? this.inputsConfigured[index].identifier : this.inputIdentifier;

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                };

                if (this.sensorInputService) {
                    const state = this.power ? (this.inputIdentifier !== inputIdentifier) : false;
                    this.sensorInputService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorInputState = state;
                }

                if (appId !== undefined) {
                    this.appId = appId;
                    if (this.sensorsInputsServices) {
                        const servicesCount = this.sensorsInputsServices.length;
                        for (let i = 0; i < servicesCount; i++) {
                            const state = this.power ? (this.sensorsInputsConfigured[i].reference === appId) : false;
                            const displayType = this.sensorsInputsConfigured[i].displayType;
                            const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                            this.sensorsInputsServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }
                }
                this.inputIdentifier = inputIdentifier;

                if (!this.disableLogInfo) {
                    const name = index !== -1 ? this.inputsConfigured[index].name : appId;
                    this.emit('message', `Input Name: ${name}`);
                    this.emit('message', `Reference: ${appId}`);
                };
            })
            .on('audioState', (volume, mute, audioOutput) => {

                if (this.speakerService && volume !== undefined) {
                    this.volume = volume;
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
                };

                if (this.speakerService) {
                    this.mute = mute;
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
                };

                if (this.sensorVolumeService && volume !== undefined) {
                    const state = this.power ? (this.volume !== volume) : false;
                    this.sensorVolumeState = state;
                    this.volume = volume;

                    this.sensorVolumeService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (this.sensorMuteService) {
                    const state = this.power ? mute : false;
                    this.mute = mute;

                    this.sensorMuteService
                        .updateCharacteristic(Characteristic.ContactSensorState, state);
                }

                if (!this.disableLogInfo) {
                    this.emit('message', `Volume: ${volume}%`);
                    this.emit('message', `Mute: ${mute ? 'ON' : 'OFF'}`);
                };
            })
            .on('currentChannel', (channelId, channelName, channelNumber) => {
                const index = this.inputsConfigured.findIndex(input => input.reference === channelId) ?? -1;
                const inputIdentifier = index !== -1 ? this.inputsConfigured[index].identifier : this.inputIdentifier;

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                };

                if (this.sensorChannelService) {
                    this.sensorChannelState = state;

                    const state = this.power ? (this.inputIdentifier !== inputIdentifier) : false;
                    this.sensorChannelService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (channelId !== undefined) {
                    this.channelId = channelId;
                }

                if (channelName !== undefined) {
                    this.channelName = channelName;
                }

                if (channelNumber !== undefined) {
                    this.channelNumber = channelNumber;
                }
                this.inputIdentifier = inputIdentifier;

                if (!this.disableLogInfo) {
                    this.emit('message', `Channel Number: ${channelNumber}`);
                    this.emit('message', `Channel Name: ${channelName}`);
                    this.emit('message', `Reference: ${channelId}`);
                };
            })
            .on('pictureSettings', (brightness, backlight, contrast, color, pictureMode, power) => {

                if (this.televisionService) {
                    this.brightness = brightness;
                    this.pictureMode = pictureMode;

                    this.televisionService
                        .updateCharacteristic(Characteristic.Brightness, brightness)
                        .updateCharacteristic(Characteristic.PictureMode, pictureMode);
                };

                if (this.brightnessService) {
                    this.brightness = brightness;

                    this.brightnessService
                        .updateCharacteristic(Characteristic.Brightness, brightness);
                };

                if (this.backlightService) {
                    this.backlight = backlight;

                    this.backlightService
                        .updateCharacteristic(Characteristic.Brightness, backlight);
                };

                if (this.contrastService) {
                    this.contrast = contrast;

                    this.contrastService
                        .updateCharacteristic(Characteristic.Brightness, contrast);
                };

                if (this.colorService) {
                    this.color = color;

                    this.colorService
                        .updateCharacteristic(Characteristic.Brightness, color);
                };

                if (this.picturesModesServices) {
                    const servicesCount = this.picturesModesServices.length;
                    this.pictureMode = pictureMode;

                    for (let i = 0; i < servicesCount; i++) {
                        const state = power ? (this.pictureModes[i].reference === pictureMode) : false;
                        this.picturesModesServices[i]
                            .updateCharacteristic(Characteristic.On, state);
                    };
                };

                if (this.sensorPicturedModeService) {
                    const state = power ? (this.pictureMode !== pictureMode) : false;
                    this.sensorPicturedModeState = state;
                    this.pictureMode = pictureMode;

                    this.sensorPicturedModeService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (!this.disableLogInfo) {
                    this.emit('message', `Brightness: ${brightness}%`);
                    this.emit('message', `Backlight: ${backlight}%`);
                    this.emit('message', `Contrast: ${contrast}%`);
                    this.emit('message', `Color: ${color}%`);
                    this.emit('message', `Picture Mode: ${pictureMode}`);
                };
            })
            .on('soundMode', (soundMode, power) => {

                if (this.soundsModesServices && soundMode !== undefined) {
                    const servicesCount = this.soundsModesServices.length;
                    this.soundMode = soundMode;

                    for (let i = 0; i < servicesCount; i++) {
                        const state = power ? (this.soundModes[i].reference === soundMode) : false;
                        this.soundsModesServices[i]
                            .updateCharacteristic(Characteristic.On, state);
                    };
                };

                if (this.sensorSoundModeService && soundMode !== undefined) {
                    const state = this.power ? (this.soundMode !== soundMode) : false;
                    this.sensorSoundModeState = state;
                    this.soundMode = soundMode;

                    this.sensorSoundModeService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (!this.disableLogInfo) {
                    this.emit('message', `Sound Mode: ${soundMode}`);
                };
            })
            .on('prepareAccessory', async () => {
                try {
                    //read dev info from file
                    try {
                        const data = await fsPromises.readFile(this.devInfoFile);
                        this.savedInfo = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`) : false;
                        this.webOS = this.savedInfo.webOS ?? 2.0;
                    } catch (error) {
                        this.emit('error', `Read saved Info error: ${error}`);
                    };

                    //read inputs file
                    try {
                        const data = await fsPromises.readFile(this.inputsFile);
                        this.savedInputs = this.getInputsFromDevice && data.length > 0 ? JSON.parse(data) : this.inputs;
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved Inputs error: ${error}`);
                    };

                    //read channels from file
                    try {
                        const data = await fsPromises.readFile(this.channelsFile);
                        this.savedChannels = data.length > 0 ? JSON.parse(data) : [];
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Channels: ${JSON.stringify(this.savedChannels, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved Channels error: ${error}`);
                    };

                    //read inputs names from file
                    try {
                        const data = await fsPromises.readFile(this.inputsNamesFile);
                        this.savedInputsNames = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved Inputs/Channels Names error: ${error}`);
                    };

                    //read inputs visibility from file
                    try {
                        const data = await fsPromises.readFile(this.inputsTargetVisibilityFile);
                        this.savedInputsTargetVisibility = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved Inputs/Channels Target Visibility error: ${error}`);
                    };

                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const accessory = await this.prepareAccessory();
                    this.emit('publishAccessory', accessory);

                    //sort inputs list
                    const sortInputsDisplayOrder = this.televisionService ? await this.displayOrder() : false;
                } catch (error) {
                    this.emit('error', `Prepare accessory error: ${error}`);
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

    displayOrder() {
        return new Promise((resolve, reject) => {
            try {
                switch (this.inputsDisplayOrder) {
                    case 0:
                        this.inputsConfigured.sort((a, b) => a.identifier - b.identifier);
                        break;
                    case 1:
                        this.inputsConfigured.sort((a, b) => a.name.localeCompare(b.name));
                        break;
                    case 2:
                        this.inputsConfigured.sort((a, b) => b.name.localeCompare(a.name));
                        break;
                    case 3:
                        this.inputsConfigured.sort((a, b) => a.reference.localeCompare(b.reference));
                        break;
                    case 4:
                        this.inputsConfigured.sort((a, b) => b.reference.localeCompare(a.reference));
                        break;
                }
                const debug = this.enableDebugMode ? this.emit('debug', `Inputs display order: ${JSON.stringify(this.inputsConfigured, null, 2)}`) : false;

                const displayOrder = this.inputsConfigured.map(input => input.identifier);
                this.televisionService.setCharacteristic(Characteristic.DisplayOrder, Encode(1, displayOrder).toString('base64'));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    //Prepare accessory
    prepareAccessory() {
        return new Promise((resolve, reject) => {
            try {
                //accessory
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare accessory`) : false;

                const accessoryName = this.name;
                const accessoryUUID = UUID.generate(this.mac);
                const accessoryCategory = Categories.TELEVISION;
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //information service
                const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare information service`) : false;
                this.informationService = accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer ?? 'LG Electronics')
                    .setCharacteristic(Characteristic.Model, this.savedInfo.modelName ?? 'Model Name')
                    .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.deviceId ?? 'Serial Number')
                    .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision ?? 'Firmware Revision');
                this.allServices.push(this.informationService);

                //prepare television service 
                if (!this.disableTvService) {
                    const debug2 = this.enableDebugMode ? this.emit('debug', `Prepare television service`) : false;
                    this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
                    this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
                    this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);

                    this.televisionService.getCharacteristic(Characteristic.Active)
                        .onGet(async () => {
                            const state = this.power;
                            return state;
                        })
                        .onSet(async (state) => {
                            if (state == this.power) {
                                return;
                            }

                            try {
                                switch (state) {
                                    case 1:
                                        await this.wol.wakeOnLan();
                                        break;
                                    case 0:
                                        const cid = await this.lgWebOsSocket.getCids('Power');
                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.TurnOff, undefined, cid);
                                        break;
                                }
                                const info = this.disableLogInfo ? false : this.emit('message', `set Power: ${state ? 'ON' : 'OFF'}`);
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            } catch (error) {
                                this.emit('error', `set Power error: ${error}`);
                            }
                        });

                    this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                        .onGet(async () => {
                            const inputIdentifier = this.inputIdentifier;
                            return inputIdentifier;
                        })
                        .onSet(async (activeIdentifier) => {
                            try {
                                const index = this.inputsConfigured.findIndex(input => input.identifier === activeIdentifier);
                                const inputMode = this.inputsConfigured[index].mode;
                                const inputName = this.inputsConfigured[index].name;
                                const inputReference = this.inputsConfigured[index].reference;

                                switch (this.power) {
                                    case false:
                                        await new Promise(resolve => setTimeout(resolve, 4000));
                                        const tryAgain = this.power ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier) : false;
                                        break;
                                    case true:
                                        switch (inputMode) {
                                            case 0:
                                                const cid = await this.lgWebOsSocket.getCids('App');
                                                await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.LaunchApp, { id: inputReference }, cid);
                                                break;
                                            case 1:
                                                const liveTv = 'com.webos.app.livetv';
                                                const cid1 = this.appId !== liveTv ? await this.lgWebOsSocket.getCids('App') : false;
                                                const openLiveTv = this.appId !== liveTv ? await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.LaunchApp, { id: liveTv }, cid1) : false;
                                                const cid2 = await this.lgWebOsSocket.getCids('Channel');
                                                await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.OpenChannel, { channelId: inputReference }, cid2)
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
                                await this.lgWebOsSocket.send('button', undefined, payload);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Remote Key: ${command}`);
                            } catch (error) {
                                this.emit('error', `set Remote Key error: ${error}`);
                            };
                        });

                    //optional television characteristics
                    this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
                        .onGet(async () => {
                            const state = 0;
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
                            return value;
                        });

                    this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
                        .onGet(async () => {
                            //0 - PLAY, 1 - PAUSE, 2 - STOP
                            const value = 2;
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
                                await this.lgWebOsSocket.send('button', undefined, payload);
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

                                    const cid = await this.lgWebOsSocket.getCids('Pisture');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload, cid);
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

                                    const cid = await this.lgWebOsSocket.getCids('Pisture');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload, cid);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Picture Mode: ${command}`);
                                } catch (error) {
                                    this.emit('error', `set Picture Mode error: ${error}`);
                                };
                            });
                    };

                    this.allServices.push(this.televisionService);
                    accessory.addService(this.televisionService);

                    //Prepare speaker service
                    const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare speaker service`) : false;
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
                                await this.lgWebOsSocket.send('button', undefined, payload);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Volume Selector: ${command}`);
                            } catch (error) {
                                this.emit('error', `set Volume Selector error: ${error}`);
                            };
                        });

                    this.speakerService.getCharacteristic(Characteristic.Volume)
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

                                const cid = await this.lgWebOsSocket.getCids('Audio');
                                await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetVolume, payload, cid);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
                            } catch (error) {
                                this.emit('error', `set Volume error: ${error}`);
                            };
                        });

                    this.speakerService.getCharacteristic(Characteristic.Mute)
                        .onGet(async () => {
                            const state = this.power ? this.mute : true;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const payload = {
                                    mute: state
                                };

                                const cid = await this.lgWebOsSocket.getCids('Audio');
                                await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetMute, payload, cid);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                this.emit('error', `set Mute error: ${error}`);
                            };
                        });
                    this.allServices.push(this.speakerService);
                    accessory.addService(this.speakerService);

                    //prepare inputs service
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare inputs service`) : false;

                    //filter unnecessary inputs
                    const filteredInputsArr = [];
                    for (const input of this.savedInputs) {
                        const reference = input.reference;
                        const filterSystemApps = this.filterSystemApps ? CONSTANS.SystemApps.includes(reference) : false;
                        const push = filterSystemApps ? false : filteredInputsArr.push(input);
                    }

                    //check possible inputs count (max 85)
                    const inputs = filteredInputsArr;
                    const inputsCount = inputs.length;
                    const possibleInputsCount = 85 - this.allServices.length;
                    const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
                    for (let i = 0; i < maxInputsCount; i++) {
                        //input
                        const input = inputs[i];

                        //get input identifier
                        const inputIdentifier = i + 1;

                        //get input reference
                        const inputReference = input.reference;

                        //get input name
                        const name = input.name ?? `Input ${inputIdentifier}`;
                        const savedInputsNames = this.savedInputsNames[inputReference] ?? false;
                        const inputName = savedInputsNames ? savedInputsNames : name;
                        input.name = inputName;

                        //get input mode
                        const inputMode = input.mode;

                        //get input type
                        const inputSourceType = 0;

                        //get input configured
                        const isConfigured = 1;

                        //get visibility
                        const currentVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;
                        input.visibility = currentVisibility;

                        //add identifier to the input
                        input.identifier = inputIdentifier;

                        //input service
                        if (inputReference && inputName && inputMode >= 0) {
                            const inputService = new Service.InputSource(`inputName`, `Input ${inputIdentifier}`);
                            inputService
                                .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                                .setCharacteristic(Characteristic.Name, inputName)
                                .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                                .setCharacteristic(Characteristic.InputSourceType, inputSourceType)
                                .setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)

                            inputService.getCharacteristic(Characteristic.ConfiguredName)
                                .onGet(async () => {
                                    return inputName;
                                })
                                .onSet(async (value) => {
                                    if (value === this.savedInputsNames[inputReference]) {
                                        return;
                                    }

                                    try {
                                        this.savedInputsNames[inputReference] = value;
                                        await fsPromises.writeFile(this.inputsNamesFile, JSON.stringify(this.savedInputsNames, null, 2));
                                        const debug = this.enableDebugMode ? this.emit('debug', `Saved ${inputMode === 0 ? 'Input' : 'Channel'} Name: ${value}, Reference: ${inputReference}`) : false;

                                        //sort inputs
                                        const index = this.inputsConfigured.findIndex(input => input.reference === inputReference);
                                        this.inputsConfigured[index].name = value;
                                        await this.displayOrder();
                                    } catch (error) {
                                        this.emit('error', `save Input error: ${error}`);
                                    }
                                });

                            inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                                .onGet(async () => {
                                    return currentVisibility;
                                })
                                .onSet(async (state) => {
                                    if (state === this.savedInputsTargetVisibility[inputReference]) {
                                        return;
                                    }

                                    try {
                                        this.savedInputsTargetVisibility[inputReference] = state;
                                        await fsPromises.writeFile(this.inputsTargetVisibilityFile, JSON.stringify(this.savedInputsTargetVisibility, null, 2));
                                        const debug = this.enableDebugMode ? this.emit('debug', `Saved ${inputMode === 0 ? 'Input' : 'Channel'}: ${inputName}, Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
                                    } catch (error) {
                                        this.emit('error', `save Target Visibility error: ${error}`);
                                    }
                                });

                            this.inputsConfigured.push(input);
                            this.televisionService.addLinkedService(inputService);
                            this.allServices.push(inputService);
                            accessory.addService(inputService);
                        } else {
                            this.emit('message', `Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}, Mode: ${inputMode ? inputMode : 'Missing'}.`);
                        };
                    }

                    if (this.inputsConfigured.length === 0) {
                        this.emit('message', `No any inputs are configured, check your config and settings.`);
                        return;
                    }
                }


                //Prepare volume service
                if (this.volumeControl >= 0) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare volume service`) : false;
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

                                    const cid = await this.lgWebOsSocket.getCids('Audio');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetVolume, payload, cid);
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

                                    const cid = await this.lgWebOsSocket.getCids('Audio');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetMute, payload, cid);
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    this.emit('error', `set Mute error: ${error}`);
                                };
                            });

                        this.allServices.push(this.volumeService);
                        accessory.addService(this.volumeService);
                    }

                    if (this.volumeControl === 1) {
                        this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume Fan');
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

                                    const cid = await this.lgWebOsSocket.getCids('Audio');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetVolume, payload, cid);
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

                                    const cid = await this.lgWebOsSocket.getCids('Audio')
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetMute, payload, cid);
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
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare backlight service`) : false;
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

                                    const cid = await this.lgWebOsSocket.getCids('Picture');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload, cid);
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
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare brightness service`) : false;
                        this.brightnessService = new Service.Lightbulb(`${accessoryName} Brightness`, 'Brightness');
                        this.brightnessService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.brightnessService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Brightness`);
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

                                    const cid = await this.lgWebOsSocket.getCids('Picture');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload), cid;
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
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare contrast service`) : false;
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

                                    const cid = await this.lgWebOsSocket.getCids('Picture');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload, cid);
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
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare color service`) : false;
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

                                    const cid = await this.lgWebOsSocket.getCids('Picture');
                                    await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload, cid);
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
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare picture mode service`) : false;
                        const pictureModes = this.pictureModes;
                        const pictureModesCount = pictureModes.length;
                        for (let i = 0; i < pictureModesCount; i++) {
                            const pictureModeName = pictureModes[i].name;
                            const pictureModeReference = pictureModes[i].reference;
                            const pictureModeNamePrefix = pictureModes[i].namePrefix;
                            const name = pictureModeNamePrefix ? `${accessoryName} ${pictureModeName}` : pictureModeName;
                            const pictureModeService = new Service.Switch(`${accessoryName} ${pictureModeName}`, `Picture Mode ${i}`);
                            pictureModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            pictureModeService.setCharacteristic(Characteristic.ConfiguredName, name);
                            pictureModeService.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = this.power ? (this.pictureMode === pictureModeReference) : false;
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

                                        const cid = await this.lgWebOsSocket.getCids('Picture');
                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload, cid);
                                        const info = this.disableLogInfo ? false : this.emit('message', `set Picture Mode: ${pictureModeName}`);
                                    } catch (error) {
                                        this.emit('error', `set Picture Mode error: ${error}`);
                                    };
                                });

                            this.picturesModesServices.push(pictureModeService);
                            this.allServices.push(pictureModeService);
                            accessory.addService(pictureModeService);
                        }
                    }

                    //turn screen ON/OFF
                    if (this.turnScreenOnOff) {
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare screen off service`) : false;
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
                                    let url;
                                    switch (state) {
                                        case false:
                                            url = this.webOS >= 4.5 ? CONSTANS.ApiUrls.TurnOffScreen45 : CONSTANS.ApiUrls.TurnOffScreen;
                                            break;
                                        case true:
                                            url = this.webOS >= 4.5 ? CONSTANS.ApiUrls.TurnOnScreen45 : CONSTANS.ApiUrls.TurnOnScreen;
                                            break;
                                    }

                                    const cid = await this.lgWebOsSocket.getCids('Power');
                                    await this.lgWebOsSocket.send('request', url, undefined, cid);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Turn Screen ${state ? 'ON' : 'OFF'}.`);
                                } catch (error) {
                                    this.emit('error', `Turn Screen ${state ? 'ON' : 'OFF'}, error: ${error}`);
                                };
                            });

                        this.allServices.push(this.turnScreenOnOffService);
                        accessory.addService(this.turnScreenOnOffService);
                    };
                };

                //Sound mode
                if (this.soundModeControl && this.webOS >= 6.0) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare sound mode service`) : false;
                    const soundModes = this.soundModes;
                    const soundModesCount = soundModes.length;
                    for (let i = 0; i < soundModesCount; i++) {
                        //get button name prefix
                        const soundModeName = soundModes[i].name;
                        const soundModeReference = soundModes[i].reference;
                        const soundModeNamePrefix = soundModes[i].namePrefix;
                        const name = soundModeNamePrefix ? `${accessoryName} ${soundModeName}` : soundModeName;
                        const soundModeService = new Service.Switch(`${accessoryName} ${soundModeName}`, `Sound Mode ${i}`);
                        soundModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        soundModeService.setCharacteristic(Characteristic.ConfiguredName, name);
                        soundModeService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? (this.soundMode === soundModeReference) : false;
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

                        this.soundsModesServices.push(soundModeService);
                        this.allServices.push(soundModeService);
                        accessory.addService(soundModeService);
                    }
                }

                //prepare sensor service
                if (this.sensorPower) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare power sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare pixel refresh sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare volume sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare mute sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare input sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare channel sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare screen off sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare screen saver sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare sound mode sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare picture mode sensor service`) : false;
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare inputs sensor service`) : false;
                    for (let i = 0; i < maxSensorInputsCount; i++) {
                        //get sensor
                        const sensorInput = sensorInputs[i];

                        //get sensor name		
                        const sensorInputName = sensorInput.name;

                        //get sensor reference
                        const sensorInputReference = sensorInput.reference;

                        //get sensor display type
                        const sensorInputDisplayType = sensorInput.displayType >= 0 ? sensorInput.displayType : -1;

                        //get sensor name prefix
                        const namePrefix = sensorInput.namePrefix ?? false;

                        if (sensorInputDisplayType >= 0) {
                            if (sensorInputName && sensorInputReference) {
                                const name = namePrefix ? `${accessoryName} ${sensorInputName}` : sensorInputName
                                const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                                const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                                const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${i}`);
                                sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                sensorInputService.setCharacteristic(Characteristic.ConfiguredName, name);
                                sensorInputService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = this.power ? (sensorInputReference === this.appId) : false;
                                        return state;
                                    });

                                this.sensorsInputsConfigured.push(sensorInput);
                                this.sensorsInputsServices.push(sensorInputService);
                                this.allServices.push(sensorInputService);
                                accessory.addService(sensorInputService);
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
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare button service`) : false;
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

                        //get button name prefix
                        const namePrefix = button.namePrefix ?? false;

                        if (buttonDisplayType >= 0) {
                            if (buttonName && buttonReferenceCommand && buttonMode) {
                                const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
                                const name = namePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                                const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, name);
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
                                                        const cid = await this.lgWebOsSocket.getCids('App');
                                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.LaunchApp, { id: buttonReference }, cid);
                                                        break;
                                                    case 1:
                                                        const liveTv = 'com.webos.app.livetv';
                                                        const cid1 = this.appId !== liveTv ? await this.lgWebOsSocket.getCids('App') : false;
                                                        const openLiveTv = this.appId !== liveTv ? await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.LaunchApp, { id: liveTv }, cid1) : false;
                                                        const cid2 = await this.lgWebOsSocket.getCids('Channel');
                                                        await this.lgWebOsSocket.send('request', CONSTANS.ApiUrls.OpenChannel, { channelId: buttonReference }, cid2)
                                                        break;
                                                    case 2:
                                                        await this.lgWebOsSocket.send('button', undefined, { name: buttonCommand });
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

                                this.buttonsConfigured.push(button);
                                this.buttonsServices.push(buttonService);
                                this.allServices.push(buttonService);
                                accessory.addService(buttonService);
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
