
import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import WakeOnLan from './wol.js';
import LgWebOsSocket from './lgwebossocket.js';
import { ApiUrls, DefaultInputs, SystemApps, PictureModes, SoundModes, SoundOutputs, DiacriticsMap } from './constants.js';
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class LgWebOsDevice extends EventEmitter {
    constructor(api, device, keyFile, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        AccessoryUUID = api.hap.uuid;

        //device configuration
        this.name = device.name;
        this.host = device.host;
        this.mac = device.mac;
        this.broadcastAddress = device.broadcastAddress || '255.255.255.255';
        this.getInputsFromDevice = device.getInputsFromDevice || false;
        this.filterSystemApps = this.getInputsFromDevice ? device.filterSystemApps : false;
        this.disableLoadDefaultInputs = device.disableLoadDefaultInputs || false;
        this.inputs = device.inputs || [];
        this.inputsDisplayOrder = device.inputsDisplayOrder || 0;
        this.buttons = device.buttons || [];
        this.sensorPower = device.sensorPower || false;
        this.sensorPixelRefresh = device.sensorPixelRefresh || false;
        this.sensorVolume = device.sensorVolume || false;
        this.sensorMute = device.sensorMute || false;
        this.sensorInput = device.sensorInput || false;
        this.sensorChannel = device.sensorChannel || false;
        this.sensorSoundMode = device.sensorSoundMode || false;
        this.sensorSoundOutput = device.sensorSoundOutput || false;
        this.sensorPictureMode = device.sensorPictureMode || false;
        this.sensorScreenOnOff = device.sensorScreenOnOff || false;
        this.sensorScreenSaver = device.sensorScreenSaver || false;
        this.sensorPlayState = device.sensorPlayState || false;
        this.sensorInputs = device.sensorInputs || [];
        this.brightnessControl = device.brightnessControl || false;
        this.backlightControl = device.backlightControl || false;
        this.contrastControl = device.contrastControl || false;
        this.colorControl = device.colorControl || false;
        this.pictureModeControl = device.pictureModeControl || false;
        this.pictureModes = this.pictureModeControl ? device.pictureModes || [] : [];
        this.soundModeControl = device.soundModeControl || false;
        this.soundModes = this.soundModeControl ? device.soundModes || [] : [];
        this.soundOutputControl = device.soundOutputControl || false;
        this.soundOutputs = this.soundOutputControl ? device.soundOutputs || [] : [];
        this.serviceMenu = device.serviceMenu || false;
        this.ezAdjustMenu = device.ezAdjustMenu || false;
        this.disableTvService = device.disableTvService || false;
        this.turnScreenOnOff = device.turnScreenOnOff || false;
        this.turnScreenSaverOnOff = device.turnScreenSaverOnOff || false;
        this.sslWebSocket = device.sslWebSocket || false;
        this.infoButtonCommand = device.infoButtonCommand || 'INFO';
        this.volumeControlNamePrefix = device.volumeControlNamePrefix || false;
        this.volumeControlName = device.volumeControlName || 'Volume';
        this.volumeControl = device.volumeControl || false;
        this.enableDebugMode = device.enableDebugMode || false;
        this.disableLogInfo = device.disableLogInfo || false;
        this.keyFile = keyFile;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.channelsFile = channelsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;
        this.startPrepareAccessory = true;

        //external integrations
        this.restFul = device.restFul ?? {};
        this.restFulConnected = false;
        this.mqtt = device.mqtt ?? {};
        this.mqttConnected = false;

        //add configured inputs to the default inputs
        this.inputs = this.disableLoadDefaultInputs ? this.inputs : [...DefaultInputs, ...this.inputs];
        this.inputIdentifier = 1;

        //state variable
        this.power = false;
        this.pixelRefreshState = false;
        this.screenStateOff = false;
        this.screenSaverState = false;
        this.appId = '';
        this.volume = 0;
        this.mute = false;
        this.playState = false;
        this.appType = '';
        this.channelId = 0;
        this.channelName = '';
        this.channelNumber = 0;
        this.brightness = 0;
        this.backlight = 0;
        this.contrast = 0;
        this.color = 0;
        this.pictureModeHomeKit = 1;
        this.pictureMode = '';
        this.soundMode = '';
        this.soundOutput = '';
        this.invertMediaState = false;

        //picture mode variable
        this.picturesModesConfigured = [];
        for (const mode of this.pictureModes) {
            const pictureModeName = mode.name ?? false;
            const pictureModeReference = mode.reference ?? false;
            const pictureModeDisplayType = mode.displayType ?? 0;
            if (pictureModeName && pictureModeReference && pictureModeDisplayType > 0) {
                mode.serviceType = ['', Service.Outlet, Service.Switch][pictureModeDisplayType];
                mode.state = false;
                this.picturesModesConfigured.push(mode);
            } else {
                const log = pictureModeDisplayType === 0 ? false : this.emit('info', `Picture Mode Name: ${pictureModeName ? pictureModeName : 'Missing'}, 'Reference: ${pictureModeReference ? pictureModeReference : 'Missing'}`);
            };
        }
        this.picturesModesConfiguredCount = this.picturesModesConfigured.length || 0;

        //sound mode variable
        this.soundsModesConfigured = [];
        for (const mode of this.soundModes) {
            const soundModeName = mode.name ?? false;
            const soundModeReference = mode.reference ?? false;
            const soundModeDisplayType = mode.displayType ?? 0;
            if (soundModeName && soundModeReference && soundModeDisplayType > 0) {
                mode.serviceType = ['', Service.Outlet, Service.Switch][soundModeDisplayType];
                mode.state = false;
                this.soundsModesConfigured.push(mode);
            } else {
                const log = soundModeDisplayType === 0 ? false : this.emit('info', `Sound Mode Name: ${soundModeName ? soundModeName : 'Missing'}, 'Reference: ${soundModeReference ? soundModeReference : 'Missing'}`);
            };
        }
        this.soundsModesConfiguredCount = this.soundsModesConfigured.length || 0;

        //sound output variable
        this.soundsOutputsConfigured = [];
        for (const output of this.soundOutputs) {
            const soundOutputName = output.name ?? false;
            const soundOutputReference = output.reference ?? false;
            const soundOutputDisplayType = output.displayType ?? 0;
            if (soundOutputName && soundOutputReference && soundOutputDisplayType > 0) {
                output.serviceType = ['', Service.Outlet, Service.Switch][soundOutputDisplayType];
                output.state = false;
                this.soundsOutputsConfigured.push(output);
            } else {
                const log = soundOutputDisplayType === 0 ? false : this.emit('info', `Sound Mode Name: ${soundOutputName ? soundOutputName : 'Missing'}, 'Reference: ${soundOutputReference ? soundOutputReference : 'Missing'}`);
            };
        }
        this.soundsOutputsConfiguredCount = this.soundsOutputsConfigured.length || 0;

        //sensors variable
        this.sensorsInputsConfigured = [];
        for (const sensor of this.sensorInputs) {
            const sensorInputName = sensor.name ?? false;
            const sensorInputReference = sensor.reference ?? false;
            const sensorInputDisplayType = sensor.displayType ?? 0;
            if (sensorInputName && sensorInputReference && sensorInputDisplayType > 0) {
                sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                sensor.state = false;
                this.sensorsInputsConfigured.push(sensor);
            } else {
                const log = sensorInputDisplayType === 0 ? false : this.emit('info', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}`);
            };
        }
        this.sensorsInputsConfiguredCount = this.sensorsInputsConfigured.length || 0;
        this.sensorVolumeState = false;
        this.sensorInputState = false;
        this.sensorChannelState = false;
        this.sensorSoundModeState = false;
        this.sensorSoundOutputState = false;
        this.sensorPicturedModeState = false;

        //buttons variable
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const buttonName = button.name ?? false;
            const buttonMode = button.mode ?? -1;
            const buttonReferenceCommand = [button.reference, button.reference, button.command][buttonMode] ?? false;
            const buttonDisplayType = button.displayType ?? 0;
            if (buttonName && buttonMode >= 0 && buttonReferenceCommand && buttonDisplayType > 0) {
                button.serviceType = ['', Service.Outlet, Service.Switch][buttonDisplayType];
                button.state = false;
                this.buttonsConfigured.push(button);
            } else {
                const log = buttonDisplayType === 0 ? false : this.emit('info', `Button Name: ${buttonName ? buttonName : 'Missing'}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand ? buttonReferenceCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}`);
            };
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;
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
            return data;
        } catch (error) {
            throw new Error(`Read data error: ${error}`);
        }
    }

    async sanitizeString(str) {
        if (!str) return '';

        // Replace diacritics using map
        str = str.replace(/[^\u0000-\u007E]/g, ch => DiacriticsMap[ch] || ch);

        // Replace separators between words with space
        str = str.replace(/(\w)[.:;+\-\/]+(\w)/g, '$1 $2');

        // Replace remaining standalone separators with space
        str = str.replace(/[.:;+\-\/]/g, ' ');

        // Remove remaining invalid characters (keep letters, digits, space, apostrophe)
        str = str.replace(/[^A-Za-z0-9 ']/g, ' ');

        // Collapse multiple spaces
        str = str.replace(/\s+/g, ' ');

        // Trim
        return str.trim();
    }

    async setOverExternalIntegration(integration, key, value) {
        try {
            let set = false
            let payload = {};
            let cid;
            switch (key) {
                case 'Power':
                    switch (value) {
                        case true:
                            set = !this.power ? await this.wol.wakeOnLan() : true;
                            break;
                        case false:
                            cid = await this.lgWebOsSocket.getCid('Power');
                            set = this.power ? await this.lgWebOsSocket.send('request', ApiUrls.TurnOff, undefined, cid) : true;
                            break;
                    }
                    break;
                case 'App':
                    cid = await this.lgWebOsSocket.getCid('App');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: value }, cid);
                    break;
                case 'Channel':
                    cid = await this.lgWebOsSocket.getCid('Channel');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: value }, cid)
                    break;
                case 'Input':
                    cid = await this.lgWebOsSocket.getCid('App');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: value }, cid);
                    break;
                case 'Volume':
                    const volume = (value < 0 || value > 100) ? this.volume : value;
                    payload = {
                        volume: volume
                    };
                    cid = await this.lgWebOsSocket.getCid('Audio');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                    break;
                case 'Mute':
                    payload = {
                        mute: value
                    };
                    cid = await this.lgWebOsSocket.getCid('Audio');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                    break;
                case 'Brightness':
                    payload = {
                        category: 'picture',
                        settings: {
                            brightness: value
                        }
                    };
                    cid = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid);
                    break;
                case 'Backlight':
                    payload = {
                        category: 'picture',
                        settings: {
                            backlight: value
                        }
                    };
                    cid = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid);
                    break;
                case 'Contrast':
                    payload = {
                        category: 'picture',
                        settings: {
                            contrast: value
                        }
                    };
                    cid = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid);
                    break;
                case 'Color':
                    payload = {
                        category: 'picture',
                        settings: {
                            color: value
                        }
                    };
                    cid = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid);
                    break;
                case 'PictureMode':
                    payload = {
                        category: 'picture',
                        settings: {
                            pictureMode: value
                        }
                    };
                    cid = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid);
                    break;
                case 'SoundMode':
                    payload = {
                        category: 'sound',
                        settings: {
                            soundMode: value
                        }
                    };
                    cid = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid);
                    break;
                case 'SoundOutput':
                    payload = {
                        output: value
                    };
                    cid = await this.lgWebOsSocket.getCid('SoundOutput');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.SetSoundOutput, payload, cid);
                    break;
                case 'PlayState':
                    payload = {
                        playState: value
                    };
                    cid = await this.lgWebOsSocket.getCid('MediaInfo');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.GetForegroundAppMediaInfo, payload, cid);
                    break;
                case 'RcControl':
                    payload = {
                        name: value
                    };
                    set = await this.lgWebOsSocket.send('button', undefined, payload);
                    break;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error}`);
        }
    }

    async externalIntegrations() {
        try {
            //RESTFul server
            const restFulEnabled = this.restFul.enable || false;
            if (restFulEnabled) {
                this.restFul1 = new RestFul({
                    port: this.restFul.port || 3000,
                    debug: this.restFul.debug || false
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.restFulConnected = true;
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('RESTFul', key, value);
                        } catch (error) {
                            this.emit('warn', `RESTFul set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('warn', (warn) => {
                        this.emit('warn', warn);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    });
            }

            //mqtt client
            const mqttEnabled = this.mqtt.enable || false;
            if (mqttEnabled) {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `lg_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `lg_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `lg/${this.mqtt.prefix}/${this.name}` : `lg/${this.name}`,
                    user: this.mqtt.user,
                    passwd: this.mqtt.passwd,
                    debug: this.mqtt.debug || false
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.mqttConnected = true;
                    })
                    .on('subscribed', (message) => {
                        this.emit('success', message);
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('MQTT', key, value);
                        } catch (error) {
                            this.emit('warn', `MQTT set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('warn', (warn) => {
                        this.emit('warn', warn);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    });
            }

            return true;
        } catch (error) {
            this.emit('warn', `External integration start error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            const savedInfo = await this.readData(this.devInfoFile);
            this.savedInfo = savedInfo.toString().trim() !== '' ? JSON.parse(savedInfo) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);
            this.webOS = this.savedInfo.webOS ?? 200;

            //read inputs file
            const savedInputs = await this.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : this.inputs;
            if (this.enableDebugMode) this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read channels from file
            const savedChannels = await this.readData(this.channelsFile);
            this.savedChannels = savedChannels.toString().trim() !== '' ? JSON.parse(savedChannels) : [];
            if (this.enableDebugMode) this.emit('debug', `Read saved Channels: ${JSON.stringify(this.savedChannels, null, 2)}`);

            //read inputs names from file
            const savedInputsNames = await this.readData(this.inputsNamesFile);
            this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Inputs/Channels Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Inputs/Channels Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return true;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
    }

    async startImpulseGenerator() {
        try {
            //start impulse generator
            await new Promise(resolve => setTimeout(resolve, 3000));
            await this.lgWebOsSocket.impulseGenerator.start([{ name: 'heartBeat', sampling: 10000 }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async displayOrder() {
        try {
            const sortStrategies = {
                1: (a, b) => a.name.localeCompare(b.name),      // A → Z
                2: (a, b) => b.name.localeCompare(a.name),      // Z → A
                3: (a, b) => a.reference.localeCompare(b.reference),
                4: (a, b) => b.reference.localeCompare(a.reference),
            };

            const sortFn = sortStrategies[this.inputsDisplayOrder];
            if (!sortFn) return;

            // Sort inputs in memory
            this.inputsServices.sort(sortFn);

            // Debug dump
            if (this.enableDebugMode) {
                const orderDump = this.inputsServices.map(svc => ({ name: svc.name, reference: svc.reference, identifier: svc.identifier, }));
                this.emit('debug', `Inputs display order:\n${JSON.stringify(orderDump, null, 2)}`);
            }

            // Update DisplayOrder characteristic (base64 encoded)
            const displayOrder = this.inputsServices.map(svc => svc.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');
            this.televisionService.updateCharacteristic(Characteristic.DisplayOrder, encodedOrder);
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    async addRemoveOrUpdateInput(inputs, remove = false) {
        try {
            if (!this.inputsServices) return;

            for (const input of inputs) {
                if (this.inputsServices.length >= 85 && !remove) continue;

                const inputReference = input.reference;

                // Filter system apps (only block on add)
                if (this.filterSystemApps && !remove && SystemApps.includes(inputReference)) {
                    if (this.enableDebugMode) this.emit('debug', `Skipped system app: ${inputReference}`);
                    continue;
                }

                if (remove) {
                    const svc = this.inputsServices.find(s => s.reference === inputReference);
                    if (svc) {
                        if (this.enableDebugMode) this.emit('debug', `Removing input: ${input.name}, reference: ${inputReference}`);
                        this.accessory.removeService(svc);
                        this.inputsServices = this.inputsServices.filter(s => s.reference !== inputReference);
                        await this.displayOrder();
                    }
                    continue;
                }

                let inputService = this.inputsServices.find(s => s.reference === inputReference);

                const savedName = this.savedInputsNames[inputReference] ?? input.name;
                const sanitizedName = await this.sanitizeString(savedName);
                const inputMode = input.mode ?? 0;
                const inputVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                if (inputService) {
                    const nameChanged = inputService.name !== sanitizedName;
                    if (nameChanged) {
                        inputService.name = sanitizedName;
                        inputService
                            .updateCharacteristic(Characteristic.Name, sanitizedName)
                            .updateCharacteristic(Characteristic.ConfiguredName, sanitizedName);
                        if (this.enableDebugMode) this.emit('debug', `Updated Input: ${input.name}, reference: ${inputReference}`);
                    }
                } else {
                    const identifier = this.inputsServices.length + 1;
                    inputService = this.accessory.addService(Service.InputSource, sanitizedName, `Input ${identifier}`);
                    inputService.identifier = identifier;
                    inputService.reference = inputReference;
                    inputService.name = sanitizedName;
                    inputService.mode = inputMode;
                    inputService.visibility = inputVisibility;

                    inputService
                        .setCharacteristic(Characteristic.Identifier, identifier)
                        .setCharacteristic(Characteristic.Name, sanitizedName)
                        .setCharacteristic(Characteristic.ConfiguredName, sanitizedName)
                        .setCharacteristic(Characteristic.IsConfigured, 1)
                        .setCharacteristic(Characteristic.InputSourceType, inputMode)
                        .setCharacteristic(Characteristic.CurrentVisibilityState, inputVisibility)
                        .setCharacteristic(Characteristic.TargetVisibilityState, inputVisibility);

                    // ConfiguredName persistence
                    inputService.getCharacteristic(Characteristic.ConfiguredName)
                        .onSet(async (value) => {
                            try {
                                value = await this.sanitizeString(value);
                                inputService.name = value;
                                this.savedInputsNames[inputReference] = value;
                                await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                                if (this.enableDebugMode) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}`);
                                await this.displayOrder();
                            } catch (error) {
                                this.emit('warn', `Save Input Name error: ${error}`);
                            }
                        });

                    // TargetVisibility persistence
                    inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                        .onSet(async (state) => {
                            try {
                                inputService.visibility = state;
                                this.savedInputsTargetVisibility[inputReference] = state;
                                await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                                if (this.enableDebugMode) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}, target visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);
                            } catch (error) {
                                this.emit('warn', `Save Target Visibility error: ${error}`);
                            }
                        });

                    this.inputsServices.push(inputService);
                    this.televisionService.addLinkedService(inputService);

                    if (this.enableDebugMode) this.emit('debug', `Added Input: ${input.name}, reference: ${inputReference}`);
                }
            }

            await this.displayOrder();
            return true;
        } catch (error) {
            throw new Error(`Add/Remove/Update input error: ${error}`);
        }
    }

    //prepare accessory
    async prepareAccessory() {
        try {
            //accessory
            if (this.enableDebugMode) this.emit('debug', `Prepare accessory`);

            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.mac);
            const accessoryCategory = Categories.TELEVISION;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
            this.accessory = accessory;

            //information service
            if (this.enableDebugMode) this.emit('debug', `Prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer ?? 'LG Electronics')
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName ?? 'Model Name')
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.deviceId ?? 'Serial Number')
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision ?? 'Firmware Revision')
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //prepare television service 
            if (!this.disableTvService) {
                if (this.enableDebugMode) this.emit('debug', `Prepare television service`);
                this.televisionService = accessory.addService(Service.Television, `${accessoryName} Television`, 'Television');
                this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
                this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);
                this.televisionService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    })
                    .onSet(async (state) => {
                        if (state === this.power) {
                            return;
                        }

                        try {
                            switch (state) {
                                case 1:
                                    await this.wol.wakeOnLan();
                                    break;
                                case 0:
                                    const cid = await this.lgWebOsSocket.getCid('Power');
                                    await this.lgWebOsSocket.send('request', ApiUrls.TurnOff, undefined, cid);
                                    break;
                            }
                            if (!this.disableLogInfo) this.emit('info', `set Power: ${state ? 'ON' : 'OFF'}`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            this.emit('warn', `set Power error: ${error}`);
                        }
                    });

                this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                    .onGet(async () => {
                        return this.inputIdentifier;
                    })
                    .onSet(async (activeIdentifier) => {
                        try {
                            const input = this.inputsServices.find(input => input.identifier === activeIdentifier);
                            if (!input) {
                                this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
                                return;
                            }

                            const { mode: inputMode, name: inputName, reference: inputReference } = input;

                            if (!this.power) {
                                // Schedule retry attempts without blocking Homebridge
                                this.emit('debug', `TV is off, deferring input switch to '${activeIdentifier}'`);

                                (async () => {
                                    for (let attempt = 0; attempt < 20; attempt++) {
                                        await new Promise(resolve => setTimeout(resolve, 1500));
                                        if (this.power && this.inputIdentifier !== activeIdentifier) {
                                            this.emit('debug', `TV powered on, retrying input switch`);
                                            this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier);
                                            break;
                                        }
                                    }
                                })();

                                return;
                            }

                            let cid = await this.lgWebOsSocket.getCid('App');
                            switch (inputMode) {
                                case 0: // App/Input Source
                                    switch (inputReference) {
                                        case 'com.webos.app.screensaver':
                                            cid = await this.lgWebOsSocket.getCid();
                                            await this.lgWebOsSocket.send('alert', ApiUrls.TurnOnScreenSaver, undefined, cid, 'Screen Saver', 'ON');
                                            break;
                                        case 'service.menu': {
                                            const payload = {
                                                id: ApiUrls.ServiceMenu,
                                                params: { id: 'executeFactory', irKey: 'inStart' }
                                            };
                                            await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload, cid);
                                            break;
                                        }
                                        case 'ez.adjust': {
                                            const payload = {
                                                id: ApiUrls.ServiceMenu,
                                                params: { id: 'executeFactory', irKey: 'ezAdjust' }
                                            };
                                            await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload, cid);
                                            break;
                                        }
                                        default: {
                                            const payload = { id: inputReference };
                                            await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload, cid);
                                            break;
                                        }
                                    }
                                    break;
                                case 1: // Channel
                                    const liveTv = 'com.webos.app.livetv';
                                    if (this.appId !== liveTv) {
                                        await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: liveTv }, cid);
                                    }

                                    cid = await this.lgWebOsSocket.getCid('Channel');
                                    await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: inputReference }, cid);
                                    break;
                            }

                            if (!this.disableLogInfo) {
                                this.emit('info', `set ${inputMode === 0 ? 'Input' : 'Channel'}, Name: ${inputName}, Reference: ${inputReference}`);
                            }
                        } catch (error) {
                            this.emit('warn', `set Input or Channel error: ${error}`);
                        }
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
                            if (!this.disableLogInfo) this.emit('info', `set Remote Key: ${command}`);
                        } catch (error) {
                            this.emit('warn', `set Remote Key error: ${error}`);
                        }
                    });

                //optional television characteristics
                this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
                    .onGet(async () => {
                        const state = 0;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            if (!this.disableLogInfo) this.emit('info', `set Closed Captions: ${state}`);
                        } catch (error) {
                            this.emit('warn', `set Closed Captions error: ${error}`);
                        }
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
                            const newMediaState = [ApiUrls.SetMediaPlay, ApiUrls.SetMediaPause, ApiUrls.SetMediaStop][value]
                            await this.lgWebOsSocket.send('request', newMediaState);
                            if (!this.disableLogInfo) this.emit('info', `set Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        } catch (error) {
                            this.emit('warn', `set Media error: ${error}`);
                        }
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
                            if (!this.disableLogInfo) this.emit('info', `set Power Mode Selection: ${command === 'MENU' ? 'SHOW' : 'HIDE'}`);
                        } catch (error) {
                            this.emit('warn', `set Power Mode Selection error: ${error}`);
                        }
                    });

                if (this.webOS >= 400) {
                    this.televisionService.getCharacteristic(Characteristic.Brightness)
                        .onGet(async () => {
                            const brightness = this.brightness;
                            return brightness;
                        })
                        .onSet(async (value) => {
                            try {
                                const payload = {
                                    category: 'picture',
                                    settings: {
                                        brightness: value
                                    }
                                };

                                const cid = await this.lgWebOsSocket.getCid();
                                await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Set Brightness', `Value: ${value}`);
                                if (!this.disableLogInfo) this.emit('info', `set Brightness: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Brightness error: ${error}`);
                            }
                        });

                    this.televisionService.getCharacteristic(Characteristic.PictureMode)
                        .onGet(async () => {
                            const value = this.pictureModeHomeKit;
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
                                        pictureMode: command
                                    }
                                };

                                const cid = await this.lgWebOsSocket.getCid();
                                await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid), 'Set Picture Mode', `Value: ${PictureModes[command] ?? 'Unknown'}`;
                                if (!this.disableLogInfo) this.emit('info', `set Picture Mode: ${PictureModes[command] ?? 'Unknown'}`);
                            } catch (error) {
                                this.emit('warn', `set Picture Mode error: ${error}`);
                            }
                        });
                }

                //Prepare volume service
                if (this.volumeControl > 0) {
                    if (this.enableDebugMode) this.emit('debug', `Prepare television speaker service`);
                    const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                    this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceName, 'TV Speaker');
                    this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                    this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                        .onGet(async () => {
                            const state = this.power;
                            return state;
                        })
                        .onSet(async (state) => {
                        });

                    this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                        .onGet(async () => {
                            const state = 3; //none, relative, relative with current, absolute
                            return state;
                        });

                    this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
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
                                if (!this.disableLogInfo) this.emit('info', `set Volume Selector: ${command}`);
                            } catch (error) {
                                this.emit('warn', `set Volume Selector error: ${error}`);
                            }
                        });

                    this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                        .onGet(async () => {
                            const volume = this.volume;
                            return volume;
                        })
                        .onSet(async (volume) => {
                            try {
                                const payload = {
                                    volume: volume
                                };

                                const cid = await this.lgWebOsSocket.getCid('Audio');
                                await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                                if (!this.disableLogInfo) this.emit('info', `set Volume: ${volume}`);
                            } catch (error) {
                                this.emit('warn', `set Volume error: ${error}`);
                            }
                        });

                    this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                        .onGet(async () => {
                            const state = this.mute;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const payload = {
                                    mute: state
                                };

                                const cid = await this.lgWebOsSocket.getCid('Audio');
                                await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                if (!this.disableLogInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                this.emit('warn', `set Mute error: ${error}`);
                            }
                        });

                    //legacy control
                    switch (this.volumeControl) {
                        case 1: //lightbulb
                            if (this.enableDebugMode) this.emit('debug', `Prepare volume service lightbulb`);
                            this.volumeServiceLightbulb = accessory.addService(Service.Lightbulb, volumeServiceName, 'Lightbulb Speaker');
                            this.volumeServiceLightbulb.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.volumeServiceLightbulb.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                            this.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness)
                                .onGet(async () => {
                                    const volume = this.volume;
                                    return volume;
                                })
                                .onSet(async (value) => {
                                    this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                                });
                            this.volumeServiceLightbulb.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = this.power ? !this.mute : false;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, !state);
                                });
                            break;
                        case 2: //fan
                            if (this.enableDebugMode) this.emit('debug', `Prepare volume service fan`);
                            this.volumeServiceFan = accessory.addService(Service.Fan, volumeServiceName, 'Fan Speaker');
                            this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                            this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                                .onGet(async () => {
                                    const volume = this.volume;
                                    return volume;
                                })
                                .onSet(async (value) => {
                                    this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                                });
                            this.volumeServiceFan.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = this.power ? !this.mute : false;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, !state);
                                });
                            break;
                        case 3: // speaker
                            if (this.enableDebugMode) this.emit('debug', `Prepare volume service speaker`);
                            this.volumeServiceSpeaker = accessory.addService(Service.Speaker, volumeServiceName, 'Speaker');
                            this.volumeServiceSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.volumeServiceSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                            this.volumeServiceSpeaker.getCharacteristic(Characteristic.Mute)
                                .onGet(async () => {
                                    const state = this.mute;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, state);
                                });
                            this.volumeServiceSpeaker.getCharacteristic(Characteristic.Active)
                                .onGet(async () => {
                                    const state = this.power;
                                    return state;
                                })
                                .onSet(async (state) => {
                                });
                            this.volumeServiceSpeaker.getCharacteristic(Characteristic.Volume)
                                .onGet(async () => {
                                    const volume = this.volume;
                                    return volume;
                                })
                                .onSet(async (value) => {
                                    this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                                });
                            break;
                    }
                }

                //prepare inputs service
                if (this.enableDebugMode) this.emit('debug', `Prepare inputs service`);

                // Check possible inputs count (max 85)
                this.inputsServices = [];
                await this.addRemoveOrUpdateInput(this.savedInputs, false);
            }

            //Picture Control
            if (this.webOS >= 400) {
                //Backlight
                if (this.backlightControl) {
                    if (this.enableDebugMode) this.emit('debug', `Prepare backlight service`);
                    this.backlightService = accessory.addService(Service.Lightbulb, `${accessoryName} Backlight`, 'Backlight');
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
                                    category: 'picture',
                                    settings: {
                                        backlight: value
                                    }
                                };

                                const cid = await this.lgWebOsSocket.getCid();
                                await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Backlight', `Value: ${value}`);
                                if (!this.disableLogInfo) this.emit('info', `set Backlight: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Backlight error: ${error}`);
                            }
                        });
                }

                //Brightness
                if (this.brightnessControl) {
                    if (this.enableDebugMode) this.emit('debug', `Prepare brightness service`);
                    this.brightnessService = accessory.addService(Service.Lightbulb, `${accessoryName} Brightness`, 'Brightness');
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
                                    category: 'picture',
                                    settings: {
                                        brightness: value
                                    }
                                };

                                const cid = await this.lgWebOsSocket.getCid();
                                await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Brightness', `Value: ${value}`);
                                if (!this.disableLogInfo) this.emit('info', `set Brightness: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Brightness error: ${error}`);
                            }
                        });
                }

                //Contrast
                if (this.contrastControl) {
                    if (this.enableDebugMode) this.emit('debug', `Prepare contrast service`);
                    this.contrastService = accessory.addService(Service.Lightbulb, `${accessoryName} Contrast`, 'Contrast');
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
                                    category: 'picture',
                                    settings: {
                                        contrast: value
                                    }
                                };

                                const cid = await this.lgWebOsSocket.getCid();
                                await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Contrast', `Value: ${value}`);
                                if (!this.disableLogInfo) this.emit('info', `set Contrast: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Contrast error: ${error}`);
                            }
                        });
                }

                //Color
                if (this.colorControl) {
                    if (this.enableDebugMode) this.emit('debug', `Prepare color service`);
                    this.colorService = accessory.addService(Service.Lightbulb, `${accessoryName} Color`, 'Color');
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
                                    category: 'picture',
                                    settings: {
                                        color: value
                                    }
                                };

                                const cid = await this.lgWebOsSocket.getCid();
                                await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Color', `Value: ${value}`);
                                if (!this.disableLogInfo) this.emit('info', `set Color: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Color error: ${error}`);
                            }
                        });
                }

                //Picture mode
                if (this.picturesModesConfiguredCount > 0) {
                    this.picturesModesServices = [];
                    if (this.enableDebugMode) this.emit('debug', `Prepare picture mode service`);
                    for (let i = 0; i < this.picturesModesConfiguredCount; i++) {
                        const mode = this.picturesModesConfigured[i];
                        const modeName = mode.name;
                        const modeReference = mode.reference;
                        const modeNamePrefix = mode.namePrefix || false;
                        const serviceType = mode.serviceType;
                        const serviceName = modeNamePrefix ? `${accessoryName} ${modeName}` : modeName;
                        const pictureModeService = new serviceType(serviceName, `Picture Mode ${i}`);
                        pictureModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        pictureModeService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                        pictureModeService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? mode.state : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const payload = {
                                        category: 'picture',
                                        settings: {
                                            pictureMode: modeReference
                                        }
                                    }

                                    const cid = state ? await this.lgWebOsSocket.getCid() : false;
                                    const set = state ? await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Picture Mode', `Value: ${modeName}`) : false;
                                    if (!this.disableLogInfo) this.emit('info', `set Picture Mode: ${modeName}`);
                                } catch (error) {
                                    this.emit('warn', `set Picture Mode error: ${error}`);
                                }
                            });
                        this.picturesModesServices.push(pictureModeService);
                        accessory.addService(pictureModeService);
                    }
                }

                //turn screen ON/OFF
                if (this.turnScreenOnOff) {
                    if (this.enableDebugMode) this.emit('debug', `Prepare screen off service`);
                    this.turnScreenOnOffService = accessory.addService(Service.Switch, `${accessoryName} Screen Off`, 'Screen Off');
                    this.turnScreenOnOffService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.turnScreenOnOffService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Off`);
                    this.turnScreenOnOffService.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = this.screenStateOff;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                let url;
                                switch (state) {
                                    case true:
                                        url = this.webOS >= 450 ? ApiUrls.TurnOffScreen45 : ApiUrls.TurnOffScreen;
                                        break;
                                    case false:
                                        url = this.webOS >= 450 ? ApiUrls.TurnOnScreen45 : ApiUrls.TurnOnScreen;
                                        break;
                                }

                                const cid = await this.lgWebOsSocket.getCid('Power');
                                await this.lgWebOsSocket.send('request', url, undefined, cid);
                                if (!this.disableLogInfo) this.emit('info', `Turn Screen ${state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                this.emit('warn', `Turn Screen ${state ? 'ON' : 'OFF'}, error: ${error}`);
                            }
                        });
                };
            }

            //turn screen saver ON/OFF
            if (this.turnScreenSaverOnOff) {
                if (this.enableDebugMode) this.emit('debug', `Prepare screen saver service`);
                this.turnScreenSaverOnOffService = accessory.addService(Service.Switch, `${accessoryName} Screen Saver`, 'Screen Saver');
                this.turnScreenSaverOnOffService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.turnScreenSaverOnOffService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Saver`);
                this.turnScreenSaverOnOffService.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = this.screenSaverState;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            const cid = await this.lgWebOsSocket.getCid();
                            const set = state ? await this.lgWebOsSocket.send('alert', ApiUrls.TurnOnScreenSaver, undefined, cid, 'Screen Saver', `ON`) : await this.lgWebOsSocket.send('button', undefined, { name: 'EXIT' });
                            if (!this.disableLogInfo) this.emit('info', `set Screen Saver: ${state}`);
                        } catch (error) {
                            this.emit('warn', `set Color error: ${error}`);
                        }
                    });
            }

            //Sound mode
            if (this.soundsModesConfiguredCount > 0 && this.webOS >= 600) {
                this.soundsModesServices = [];
                if (this.enableDebugMode) this.emit('debug', `Prepare sound mode service`);
                for (let i = 0; i < this.soundsModesConfiguredCount; i++) {
                    const mode = this.soundsModesConfigured[i];
                    const modeName = mode.name;
                    const modeReference = mode.reference;
                    const modeNamePrefix = mode.namePrefix || false;
                    const serviceType = mode.serviceType;
                    const serviceName = modeNamePrefix ? `${accessoryName} ${modeName}` : modeName;
                    const soundModeService = new serviceType(serviceName, `Sound Mode ${i}`);
                    soundModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    soundModeService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    soundModeService.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = this.power ? mode.state : false;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const payload = {
                                    category: 'sound',
                                    settings: {
                                        soundMode: modeReference
                                    }
                                }

                                const cid = state ? await this.lgWebOsSocket.getCid() : false;
                                const set = state ? await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Sound Mode', `Value: ${modeName}`) : false;
                                if (!this.disableLogInfo) this.emit('info', `set Sound Mode: ${modeName}`);
                            } catch (error) {
                                this.emit('warn', `set Sound Mode error: ${error}`);
                            }
                        });
                    this.soundsModesServices.push(soundModeService);
                    accessory.addService(soundModeService);
                }
            }

            //Sound output
            if (this.soundsOutputsConfiguredCount > 0) {
                this.soundsOutputsServices = [];
                if (this.enableDebugMode) this.emit('debug', `Prepare sound output service`);
                for (let i = 0; i < this.soundsOutputsConfiguredCount; i++) {
                    const output = this.soundsOutputsConfigured[i];
                    const outputName = output.name;
                    const outputReference = output.reference;
                    const outputNamePrefix = output.namePrefix || false;
                    const serviceType = output.serviceType;
                    const serviceName = outputNamePrefix ? `${accessoryName} ${outputName}` : outputName;
                    const soundOutputService = new serviceType(serviceName, `Sound Output ${i}`);
                    soundOutputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    soundOutputService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    soundOutputService.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = this.power ? output.state : false;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const payload = {
                                    output: outputReference
                                }

                                const cid = state ? await this.lgWebOsSocket.getCid('SoundOutput') : false;
                                const send = state ? await this.lgWebOsSocket.send('request', ApiUrls.SetSoundOutput, payload, cid) : false;
                                if (!this.disableLogInfo) this.emit('info', `set Sound Output: ${outputName}`);
                            } catch (error) {
                                this.emit('warn', `set Sound Output error: ${error}`);
                            }
                        });
                    this.soundsOutputsServices.push(soundOutputService);
                    accessory.addService(soundOutputService);
                }
            }

            //prepare sensor service
            if (this.sensorPower) {
                if (this.enableDebugMode) this.emit('debug', `Prepare power sensor service`);
                this.sensorPowerService = accessory.addService(Service.ContactSensor, `${accessoryName} Power Sensor`, `Power Sensor`);
                this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    });
            }

            if (this.sensorPixelRefresh) {
                if (this.enableDebugMode) this.emit('debug', `Prepare pixel refresh sensor service`);
                this.sensorPixelRefreshService = accessory.addService(Service.ContactSensor, `${accessoryName} Pixel Refresh Sensor`, `Pixel Refresh Sensor`);
                this.sensorPixelRefreshService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPixelRefreshService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Pixel Refresh Sensor`);
                this.sensorPixelRefreshService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.pixelRefreshState;
                        return state;
                    });
            }

            if (this.sensorVolume) {
                if (this.enableDebugMode) this.emit('debug', `Prepare volume sensor service`);
                this.sensorVolumeService = accessory.addService(Service.ContactSensor, `${accessoryName} Volume Sensor`, `Volume Sensor`);
                this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorVolumeState;
                        return state;
                    });
            }

            if (this.sensorMute) {
                if (this.enableDebugMode) this.emit('debug', `Prepare mute sensor service`);
                this.sensorMuteService = accessory.addService(Service.ContactSensor, `${accessoryName} Mute Sensor`, `Mute Sensor`);
                this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.mute;
                        return state;
                    });
            }

            if (this.sensorInput) {
                if (this.enableDebugMode) this.emit('debug', `Prepare input sensor service`);
                this.sensorInputService = accessory.addService(Service.ContactSensor, `${accessoryName} Input Sensor`, `Input Sensor`);
                this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorInputState;
                        return state;
                    });
            }

            if (this.sensorChannel) {
                if (this.enableDebugMode) this.emit('debug', `Prepare channel sensor service`);
                this.sensorChannelService = accessory.addService(Service.ContactSensor, `${accessoryName} Channel Sensor`, `Channel Sensor`);
                this.sensorChannelService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorChannelService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Channel Sensor`);
                this.sensorChannelService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorChannelState;
                        return state;
                    });
            }

            if (this.sensorScreenOnOff && this.webOS >= 400) {
                if (this.enableDebugMode) this.emit('debug', `Prepare screen off sensor service`);
                this.sensorScreenOnOffService = accessory.addService(Service.ContactSensor, `${accessoryName} Screen On/Off Sensor`, `Screen On/Off Sensor`);
                this.sensorScreenOnOffService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorScreenOnOffService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen On/Off Sensor`);
                this.sensorScreenOnOffService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.screenStateOff : false;
                        return state;
                    });
            }

            if (this.sensorScreenSaver) {
                if (this.enableDebugMode) this.emit('debug', `Prepare screen saver sensor service`);
                this.sensorScreenSaverService = accessory.addService(Service.ContactSensor, `${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
                this.sensorScreenSaverService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorScreenSaverService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Saver Sensor`);
                this.sensorScreenSaverService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.screenSaverState : false;
                        return state;
                    });
            }

            if (this.sensorSoundMode && this.webOS >= 600) {
                if (this.enableDebugMode) this.emit('debug', `Prepare sound mode sensor service`);
                this.sensorSoundModeService = accessory.addService(Service.ContactSensor, `${accessoryName} Sound Mode Sensor`, `Sound Mode Sensor`);
                this.sensorSoundModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorSoundModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Sound Mode Sensor`);
                this.sensorSoundModeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorSoundModeState : false;
                        return state;
                    });
            }

            if (this.sensorSoundOutput) {
                if (this.enableDebugMode) this.emit('debug', `Prepare sound output sensor service`);
                this.sensorSoundOutputService = accessory.addService(Service.ContactSensor, `${accessoryName} Sound Output Sensor`, `Sound Output Sensor`);
                this.sensorSoundOutputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorSoundOutputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Sound Output Sensor`);
                this.sensorSoundOutputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorSoundOutputState : false;
                        return state;
                    });
            }

            if (this.sensorPictureMode && this.webOS >= 400) {
                if (this.enableDebugMode) this.emit('debug', `Prepare picture mode sensor service`);
                this.sensorPictureModeService = accessory.addService(Service.ContactSensor, `${accessoryName} Picture Mode Sensor`, `Picture Mode Sensor`);
                this.sensorPictureModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPictureModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Picture Mode Sensor`);
                this.sensorPictureModeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.pictureMode : false;
                        return state;
                    });
            }

            if (this.sensorPlayState && this.webOS >= 700) {
                if (this.enableDebugMode) this.emit('debug', `Prepare play state sensor service`);
                this.sensorPlayStateService = accessory.addService(Service.ContactSensor, `${accessoryName} Play State Sensor`, `Play State Sensor`);
                this.sensorPlayStateService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPlayStateService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Pilay State Sensor`);
                this.sensorPlayStateService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.playState;
                        return state;
                    });
            }

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.accessory.services.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                this.sensorsInputsServices = []
                if (this.enableDebugMode) this.emit('debug', `Prepare inputs sensors services`);
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    //get sensor
                    const sensorInput = this.sensorsInputsConfigured[i];

                    //get sensor name		
                    const sensorInputName = sensorInput.name;

                    //get sensor name prefix
                    const namePrefix = sensorInput.namePrefix || false;

                    //get service type
                    const serviceType = sensorInput.serviceType;

                    //get service type
                    const characteristicType = sensorInput.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${sensorInputName}` : sensorInputName;
                    const sensorInputService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorInputService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorInputService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensorInput.state;
                            return state;
                        });
                    this.sensorsInputsServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }

            //Prepare inputs button services
            const possibleButtonsCount = 99 - this.accessory.services.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                this.buttonsServices = [];
                if (this.enableDebugMode) this.emit('debug', `Prepare button service`);
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttonsConfigured[i];

                    //get button name
                    const buttonName = button.name;

                    //get button mode
                    const buttonMode = button.mode;

                    //get button name prefix
                    const namePrefix = button.namePrefix || false;

                    //get service type
                    const serviceType = button.serviceType;

                    const serviceName = namePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                    const buttonService = new serviceType(serviceName, `Button ${i}`);
                    buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    buttonService.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = button.state;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                if (!this.power && buttonMode !== 2) return;

                                let cid;
                                switch (buttonMode) {
                                    case 0: //App Control
                                        cid = state ? await this.lgWebOsSocket.getCid('App') : false;
                                        if (state) await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: button.reference }, cid);
                                        if (state && this.enableDebugMode) this.emit('debug', `Set Input, Name: ${buttonName}, Reference: ${button.reference}`);
                                        break;
                                    case 1: //Channel Control
                                        const liveTv = 'com.webos.app.livetv';
                                        cid = state && this.appId !== liveTv ? await this.lgWebOsSocket.getCid('App') : false;
                                        if (this.appId !== liveTv) await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: liveTv }, cid);
                                        cid = state ? await this.lgWebOsSocket.getCid('Channel') : false;
                                        if (state) await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: button.reference }, cid);
                                        if (state && this.enableDebugMode) this.emit('debug', `Set Channel, Name: ${buttonName}, Reference: ${button.reference}`);
                                        break;
                                    case 2: //RC Control
                                        if (state) await this.lgWebOsSocket.send('button', undefined, { name: button.command });
                                        if (state && this.enableDebugMode) this.emit('debug', `Set Command, Name: ${buttonName}, Reference: ${button.command}`);
                                        button.state = false;
                                        break;
                                    default:
                                        if (this.enableDebugMode) this.emit('debug', `Set Unknown Button Mode: ${buttonMode}`);
                                        button.state = false;
                                        break;
                                }
                            } catch (error) {
                                this.emit('warn', `set ${['Input', 'Channel', 'Command'][buttonMode]} error: ${error}`);
                            }
                        });
                    this.buttonsServices.push(buttonService);
                    accessory.addService(buttonService);
                };
            }

            return accessory;
        } catch (error) {
            throw new Error(error)
        };
    }

    //start
    async start() {
        //Wake On Lan
        try {
            this.wol = new WakeOnLan({
                mac: this.mac,
                broadcastAddress: this.broadcastAddress,
                enableDebugMode: this.enableDebugMode
            })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('warn', (warn) => {
                    this.emit('warn', warn);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        } catch (error) {
            this.emit('warn', `Wake On Lan start error: ${error}`);
        }

        try {
            //lg tv client
            this.lgWebOsSocket = new LgWebOsSocket({
                host: this.host,
                inputs: this.inputs,
                keyFile: this.keyFile,
                devInfoFile: this.devInfoFile,
                inputsFile: this.inputsFile,
                channelsFile: this.channelsFile,
                getInputsFromDevice: this.getInputsFromDevice,
                serviceMenu: this.serviceMenu,
                ezAdjustMenu: this.ezAdjustMenu,
                enableDebugMode: this.enableDebugMode,
                sslWebSocket: this.sslWebSocket
            })
                .on('deviceInfo', (info) => {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer: LG Electronics`);
                    this.emit('devInfo', `Model: ${info.modelName}`);
                    this.emit('devInfo', `System: ${info.productName}`);
                    this.emit('devInfo', `Serialnr: ${info.deviceId}`);
                    this.emit('devInfo', `Firmware: ${info.firmwareRevision}`);
                    this.emit('devInfo', `----------------------------------`);

                    this.informationService?.setCharacteristic(Characteristic.FirmwareRevision, info.firmwareRevision)
                })
                .on('addRemoveOrUpdateInput', async (inputs, remove) => {
                    await this.addRemoveOrUpdateInput(inputs, remove);
                })
                .on('powerState', (power, screenState) => {
                    this.televisionService?.updateCharacteristic(Characteristic.Active, power);
                    this.sensorPowerService?.updateCharacteristic(Characteristic.ContactSensorState, power);

                    const screenOff = power ? screenState === 'Screen Off' : false;
                    this.turnScreenOnOffService?.updateCharacteristic(Characteristic.On, screenOff);
                    this.sensorScreenOnOffService?.updateCharacteristic(Characteristic.ContactSensorState, screenOff);

                    const screenSaver = power ? screenState === 'Screen Saver' : false;
                    this.turnScreenSaverOnOffService?.updateCharacteristic(Characteristic.On, screenSaver);
                    this.sensorScreenSaverService?.updateCharacteristic(Characteristic.ContactSensorState, screenSaver);

                    const activeStandby = power ? screenState === 'Active Standby' : false;
                    this.sensorPixelRefreshService?.updateCharacteristic(Characteristic.ContactSensorState, activeStandby);

                    if (this.buttonsConfiguredCount > 0 && !power) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = false;
                            button.state = state;
                            this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    this.power = power;
                    this.pixelRefreshState = power ? screenState === 'Active Standby' : false;
                    this.screenStateOff = power ? screenState === 'Screen Off' : false;
                    this.screenSaverState = power ? screenState === 'Screen Saver' : false;
                    if (!this.disableLogInfo) {
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                    }
                })
                .on('currentApp', (appId) => {
                    if (!this.inputsServices) return;

                    const input = this.inputsServices.find(input => input.reference === appId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    const inputName = input ? input.name : appId;
                    this.inputIdentifier = inputIdentifier;

                    this.televisionService?.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

                    if (appId !== this.appId) {
                        for (let i = 0; i < 2; i++) {
                            const state = this.power ? [true, false][i] : false;
                            this.sensorInputService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorInputState = state;
                        }
                    }

                    if (this.sensorsInputsConfiguredCount > 0) {
                        for (let i = 0; i < this.sensorsInputsConfiguredCount; i++) {
                            const sensorInput = this.sensorsInputsConfigured[i];
                            const state = this.power ? sensorInput.reference === appId : false;
                            sensorInput.state = state;
                            const characteristicType = sensorInput.characteristicType;
                            this.sensorsInputsServices?.[i]?.updateCharacteristic(characteristicType, state);
                        }
                    }

                    if (this.buttonsConfiguredCount > 0) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = this.power ? button.reference === appId : false;
                            button.state = state;
                            this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    this.appId = appId;
                    if (!this.disableLogInfo) {
                        this.emit('info', `Input Name: ${inputName}`);
                    }
                })
                .on('audioState', (volume, mute, power) => {
                    this.volumeServiceTvSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    const muteV = this.power ? !mute : false;
                    this.volumeServiceLightbulb
                        ?.updateCharacteristic(Characteristic.Brightness, volume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceFan
                        ?.updateCharacteristic(Characteristic.RotationSpeed, volume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    if (volume !== this.volume) {
                        for (let i = 0; i < 2; i++) {
                            const state = this.power ? [true, false][i] : false;
                            this.sensorVolumeService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorVolumeState = state;
                        }
                    }

                    const state = this.power ? mute : false;
                    this.sensorMuteService?.updateCharacteristic(Characteristic.ContactSensorState, state);

                    this.volume = volume;
                    this.mute = mute;
                    if (!this.disableLogInfo) {
                        this.emit('info', `Volume: ${volume}%`);
                        this.emit('info', `Mute: ${mute ? 'ON' : 'OFF'}`);
                    }
                })
                .on('currentChannel', (channelId, channelName, channelNumber) => {
                    if (!this.inputsServices) return;

                    const input = this.inputsServices.find(input => input.reference === channelId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    this.televisionService?.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

                    if (channelId !== this.channelId) {
                        for (let i = 0; i < 2; i++) {
                            const state = this.power ? [true, false][i] : false;
                            this.sensorChannelService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorChannelState = state;
                        }
                    }

                    if (this.buttonsConfiguredCount > 0) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = this.power ? this.appId === 'com.webos.app.livetv' && button.reference === channelId : false;
                            button.state = state;
                            this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    this.inputIdentifier = inputIdentifier;
                    this.channelId = channelId;
                    this.channelName = channelName !== undefined ? channelName : this.channelName;
                    this.channelNumber = channelNumber !== undefined ? channelNumber : this.channelNumber;
                    if (!this.disableLogInfo) {
                        this.emit('info', `Channel Number: ${channelNumber}`);
                        this.emit('info', `Channel Name: ${channelName}`);
                    }
                })
                .on('pictureSettings', (brightness, backlight, contrast, color, power) => {
                    this.televisionService?.updateCharacteristic(Characteristic.Brightness, brightness);

                    this.brightnessService
                        ?.updateCharacteristic(Characteristic.On, power)
                        .updateCharacteristic(Characteristic.Brightness, brightness);

                    this.backlightService
                        ?.updateCharacteristic(Characteristic.On, power)
                        .updateCharacteristic(Characteristic.Brightness, backlight);

                    this.contrastService
                        ?.updateCharacteristic(Characteristic.On, power)
                        .updateCharacteristic(Characteristic.Brightness, contrast);

                    this.colorService
                        ?.updateCharacteristic(Characteristic.On, power)
                        .updateCharacteristic(Characteristic.Brightness, color);

                    this.brightness = brightness;
                    this.backlight = backlight;
                    this.contrast = contrast;
                    this.color = color;
                    if (!this.disableLogInfo) {
                        this.emit('info', `Brightness: ${brightness}%`);
                        this.emit('info', `Backlight: ${backlight}%`);
                        this.emit('info', `Contrast: ${contrast}%`);
                        this.emit('info', `Color: ${color}%`);
                    }
                })
                .on('pictureMode', (pictureMode, power) => {
                    const mode = 1;
                    this.pictureModeHomeKit = mode;
                    this.televisionService?.updateCharacteristic(Characteristic.PictureMode, mode);

                    if (this.picturesModesConfiguredCount > 0) {
                        for (let i = 0; i < this.picturesModesConfiguredCount; i++) {
                            const mode = this.picturesModesConfigured[i];
                            const state = power ? mode.reference === pictureMode : false;
                            mode.state = state;
                            this.picturesModesServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (pictureMode !== this.pictureMode) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorPicturedModeService?.updateCharacteristic(Characteristic.ContactSensorState, state)
                            this.sensorPicturedModeState = state;
                        }
                    }

                    this.pictureMode = pictureMode;
                    if (!this.disableLogInfo) this.emit('info', `Picture Mode: ${PictureModes[pictureMode] ?? 'Unknown'}`);
                })
                .on('soundMode', (soundMode, power) => {
                    if (this.soundsModesConfiguredCount > 0) {
                        for (let i = 0; i < this.soundsModesConfiguredCount; i++) {
                            const mode = this.soundsModesConfigured[i];
                            const state = power ? mode.reference === soundMode : false;
                            mode.state = state;
                            this.soundsModesServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (soundMode !== this.soundMode) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorSoundModeService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorSoundModeState = state;
                        }
                    }

                    this.soundMode = soundMode;
                    if (!this.disableLogInfo) this.emit('info', `Sound Mode: ${SoundModes[soundMode] ?? 'Unknown'}`);
                })
                .on('soundOutput', (soundOutput, power) => {
                    if (this.soundsOutputsConfiguredCount > 0) {
                        for (let i = 0; i < this.soundsOutputsConfiguredCount; i++) {
                            const output = this.soundsOutputsConfigured[i];
                            const state = power ? output.reference === soundOutput : false;
                            output.state = state;
                            this.soundsOutputsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (soundOutput !== this.soundOutput) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorSoundOutputService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorSoundOutputState = state;
                        }
                    }

                    this.soundOutput = soundOutput;
                    if (!this.disableLogInfo) this.emit('info', `Sound Output: ${SoundOutputs[soundOutput] ?? 'Unknown'}`);
                })
                .on('mediaInfo', (playState, appType) => {
                    this.sensorPlayStateService?.updateCharacteristic(Characteristic.ContactSensorState, playState);

                    this.playState = playState;
                    this.appType = appType;
                    if (!this.disableLogInfo) this.emit('info', `Play state: ${playState ? 'Playing' : 'Paused'}`);
                })
                .on('success', (success) => this.emit('success', success))
                .on('info', (info) => this.emit('info', info))
                .on('debug', (debug) => this.emit('debug', debug))
                .on('warn', (warn) => this.emit('warn', warn))
                .on('error', (error) => this.emit('error', error))
                .on('restFul', (path, data) => {
                    if (this.restFulConnected) this.restFul1.update(path, data);
                })
                .on('mqtt', (topic, message) => {
                    if (this.mqttConnected) this.mqtt1.emit('publish', topic, message);
                });

            //connect
            const connect = await this.lgWebOsSocket.connect();
            if (!connect) {
                return false;
            }

            //start external integrations
            if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

            //prepare accessory
            const pairingKey = await this.readData(this.keyFile);
            const key = pairingKey.length > 10 ? pairingKey.toString() : '0';

            if (key !== '0') {
                await this.prepareDataForAccessory();
                const accessory = await this.prepareAccessory();
                return accessory;
            } else {
                return new Promise((resolve) => {
                    const intervalId = setInterval(async () => {
                        const pairingKey = await this.readData(this.keyFile);
                        const key = pairingKey.length > 10 ? pairingKey.toString() : '0';

                        if (key !== '0') {
                            clearInterval(intervalId);

                            await this.prepareDataForAccessory();
                            const accessory = await this.prepareAccessory();
                            resolve(accessory);
                        }
                    }, 5000);
                });
            }
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
}

export default LgWebOsDevice;