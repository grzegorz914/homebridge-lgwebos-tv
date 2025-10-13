
import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import WakeOnLan from './wol.js';
import LgWebOsSocket from './lgwebossocket.js';
import Functions from './functions.js';
import { ApiUrls, DefaultInputs, SystemApps, PictureModes, SoundModes, SoundOutputs } from './constants.js';
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
        this.displayType = device.displayType;
        this.getInputsFromDevice = device.inputs?.getFromDevice || false;
        this.filterSystemApps = device.inputs?.filterSystemApps || false;
        this.inputsDisplayOrder = device.inputs?.displayOrder || 0;
        this.inputs = device.inputs?.data || [];
        this.buttons = (device.buttons || []).filter(button => (button.displayType ?? 0) > 0);
        this.sensorPower = device.sensors?.power || false;
        this.sensorPixelRefresh = device.sensors?.pixelRefresh || false;
        this.sensorVolume = device.sensors?.volume || false;
        this.sensorMute = device.sensors?.mute || false;
        this.sensorSoundMode = device.sensors?.soundMode || false;
        this.sensorSoundOutput = device.sensors?.soundOutput || false;
        this.sensorPictureMode = device.sensors?.pictureMode || false;
        this.sensorScreenOnOff = device.sensors?.screenOnOff || false;
        this.sensorScreenSaver = device.sensors?.screenSaver || false;
        this.sensorPlayState = device.sensors?.playState || false;
        this.sensorChannel = device.sensors?.channel || false;
        this.sensorInput = device.sensors?.input || false;
        this.sensorInputs = (device.sensors?.inputs || []).filter(sensor => (sensor.displayType ?? 0) > 0);
        this.broadcastAddress = device.power?.broadcastAddress;
        this.startInput = device.power?.startInput || false;
        this.startInputReference = device.power?.startInputReference || 'com.webos.app.home';
        this.volumeControl = device.volume?.displayType || 0;
        this.volumeControlName = device.volume?.name || 'Volume';
        this.volumeControlNamePrefix = device.volume?.namePrefix || false;
        this.soundModes = (device.sound?.modes || []).filter(mode => (mode.displayType ?? 0) > 0);
        this.soundOutputs = (device.sound?.outputs || []).filter(output => (output.displayType ?? 0) > 0);
        this.brightnessControl = device.picture?.brightnessControl || false;
        this.backlightControl = device.picture?.backlightControl || false;
        this.contrastControl = device.picture?.contrastControl || false;
        this.colorControl = device.picture?.colorControl || false;
        this.pictureModes = (device.picture?.modes || []).filter(mode => (mode.displayType ?? 0) > 0);
        this.turnScreenOnOff = device.screen?.turnOnOff || false;
        this.turnScreenSaverOnOff = device.screen?.saverOnOff || false;
        this.disableTvService = device.disableTvService || false;
        this.sslWebSocket = device.sslWebSocket || false;
        this.infoButtonCommand = device.infoButtonCommand || 'INFO';
        this.logInfo = device.log?.info || false;
        this.logWarn = device.log?.warn || true;
        this.logError = device.log?.debug || true;
        this.logDebug = device.log?.debug || false;
        this.keyFile = keyFile;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.channelsFile = channelsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;

        //external integrations
        this.restFul = device.restFul ?? {};
        this.restFulConnected = false;
        this.mqtt = device.mqtt ?? {};
        this.mqttConnected = false;

        //add configured inputs to the default inputs
        this.inputs = [...DefaultInputs, ...this.inputs];
        this.inputIdentifier = 1;

        //state variable
        this.functions = new Functions();
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
        for (const mode of this.pictureModes) {
            mode.name = mode.name || 'Picture Mode';
            mode.serviceType = ['', Service.Outlet, Service.Switch][mode.displayType];
            mode.state = false;
        }

        //sound mode variable
        for (const mode of this.soundModes) {
            mode.name = mode.name || 'Sound Mode';
            mode.serviceType = ['', Service.Outlet, Service.Switch][mode.displayType];
            mode.state = false;
        }

        //sound output variable
        for (const output of this.soundOutputs) {
            output.name = output.name || 'Sound Output'
            output.serviceType = ['', Service.Outlet, Service.Switch][output.isplayType];
            output.state = false;
        }

        //sensors variable
        for (const sensor of this.sensorInputs) {
            sensor.name = sensor.name || 'Sensor Input';
            sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensor.displayType];
            sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensor.displayType];
            sensor.state = false;
        }
        this.sensorVolumeState = false;
        this.sensorInputState = false;
        this.sensorChannelState = false;
        this.sensorSoundModeState = false;
        this.sensorSoundOutputState = false;
        this.sensorPicturedModeState = false;

        //buttons variable
        for (const button of this.buttons) {
            button.name = button.name || 'Button';
            button.serviceType = ['', Service.Outlet, Service.Switch][button.displayType];
            button.state = false;
        }
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
                    logWarn: this.logWarn,
                    logDebug: this.logDebug
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
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            }

            //mqtt client
            const mqttEnabled = this.mqtt.enable || false;
            if (mqttEnabled) {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `lg_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `lg_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `lg/${this.mqtt.prefix}/${this.name}` : `lg/${this.name}`,
                    user: this.mqtt.auth?.user,
                    passwd: this.mqtt.auth?.passwd,
                    logWarn: this.logWarn,
                    logDebug: this.logDebug
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
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            }

            return true;
        } catch (error) {
            if (this.logWarn) this.emit('warn', `External integration start error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            const savedInfo = await this.functions.readData(this.devInfoFile);
            this.savedInfo = savedInfo.toString().trim() !== '' ? JSON.parse(savedInfo) : {};
            if (this.logDebug) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);
            this.webOS = this.savedInfo.webOS ?? 2.0;

            //read inputs file
            const savedInputs = await this.functions.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : [];
            if (this.logDebug) this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read channels from file
            const savedChannels = await this.functions.readData(this.channelsFile);
            this.savedChannels = savedChannels.toString().trim() !== '' ? JSON.parse(savedChannels) : [];
            if (this.logDebug) this.emit('debug', `Read saved Channels: ${JSON.stringify(this.savedChannels, null, 2)}`);

            //read inputs names from file
            const savedInputsNames = await this.functions.readData(this.inputsNamesFile);
            this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs/Channels Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.functions.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs/Channels Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

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
            if (this.logDebug) {
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

                // Filter
                const systemApp = this.filterSystemApps && SystemApps.includes(input.reference);
                if (systemApp) continue;

                const inputReference = input.reference;
                const savedName = this.savedInputsNames[inputReference] ?? input.name;
                const sanitizedName = await this.functions.sanitizeString(savedName);
                const inputMode = input.mode ?? 0;
                const inputVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                if (remove) {
                    const svc = this.inputsServices.find(s => s.reference === inputReference);
                    if (svc) {
                        if (this.logDebug) this.emit('debug', `Removing input: ${input.name}, reference: ${inputReference}`);
                        this.accessory.removeService(svc);
                        this.inputsServices = this.inputsServices.filter(s => s.reference !== inputReference);
                        await this.displayOrder();
                    }
                    continue;
                }

                let inputService = this.inputsServices.find(s => s.reference === inputReference);
                if (inputService) {
                    const nameChanged = inputService.name !== sanitizedName;
                    if (nameChanged) {
                        inputService.name = sanitizedName;
                        inputService
                            .updateCharacteristic(Characteristic.Name, sanitizedName)
                            .updateCharacteristic(Characteristic.ConfiguredName, sanitizedName);
                        if (this.logDebug) this.emit('debug', `Updated Input: ${input.name}, reference: ${inputReference}`);
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
                                value = await this.functions.sanitizeString(value);
                                inputService.name = value;
                                this.savedInputsNames[inputReference] = value;
                                await this.functions.saveData(this.inputsNamesFile, this.savedInputsNames);
                                if (this.logDebug) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}`);
                                await this.displayOrder();
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Save Input Name error: ${error}`);
                            }
                        });

                    // TargetVisibility persistence
                    inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                        .onSet(async (state) => {
                            try {
                                inputService.visibility = state;
                                this.savedInputsTargetVisibility[inputReference] = state;
                                await this.functions.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                                if (this.logDebug) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}, target visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Save Target Visibility error: ${error}`);
                            }
                        });

                    this.inputsServices.push(inputService);
                    this.televisionService.addLinkedService(inputService);

                    if (this.logDebug) this.emit('debug', `Added Input: ${input.name}, reference: ${inputReference}`);
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
            if (this.logDebug) this.emit('debug', `Prepare accessory`);

            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.mac);
            const accessoryCategory = [Categories.OTHER, Categories.TELEVISION, Categories.TV_SET_TOP_BOX, Categories.TV_STREAMING_STICK, Categories.AUDIO_RECEIVER][this.displayType];
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
            this.accessory = accessory;

            //information service
            if (this.logDebug) this.emit('debug', `Prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer ?? 'LG Electronics')
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName ?? 'Model Name')
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.deviceId ?? 'Serial Number')
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision ?? 'Firmware Revision')
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //prepare television service 
            if (!this.disableTvService) {
                if (this.logDebug) this.emit('debug', `Prepare television service`);
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

                                    if (this.startInput) {
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                        if (this.power) {
                                            const cid = await this.lgWebOsSocket.getCid('App');
                                            const payload = { id: this.startInputReference };
                                            await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload, cid);
                                        }
                                    }
                                    break;
                                case 0:
                                    const cid1 = await this.lgWebOsSocket.getCid('Power');
                                    await this.lgWebOsSocket.send('request', ApiUrls.TurnOff, undefined, cid1);
                                    break;
                            }
                            if (this.logInfo) this.emit('info', `set Power: ${state ? 'ON' : 'OFF'}`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Power error: ${error}`);
                        }
                    });

                this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                    .onGet(async () => {
                        const inputIdentifier = this.inputIdentifier;;
                        return inputIdentifier;
                    })
                    .onSet(async (activeIdentifier) => {
                        try {
                            const input = this.inputsServices.find(input => input.identifier === activeIdentifier);
                            if (!input) {
                                if (this.logWarn) this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
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
                            let payload = {};
                            switch (inputMode) {
                                case 0: // App/Input Source
                                    switch (inputReference) {
                                        case 'com.webos.app.screensaver':
                                            cid = await this.lgWebOsSocket.getCid();
                                            await this.lgWebOsSocket.send('alert', ApiUrls.TurnOnScreenSaver, undefined, cid, 'Screen Saver', 'ON');
                                            break;
                                        case 'com.webos.app.screenoff':
                                            let url;
                                            url = this.webOS >= 4.0 ? this.webOS >= 4.5 ? ApiUrls.TurnOffScreen45 : ApiUrls.TurnOffScreen : false;
                                            cid = await this.lgWebOsSocket.getCid('Power');
                                            await this.lgWebOsSocket.send('request', url, undefined, cid);
                                            break;
                                        case 'com.webos.app.factorywin':
                                            payload = {
                                                id: ApiUrls.ServiceMenu,
                                                params: { id: 'executeFactory', irKey: 'inStart' }
                                            };
                                            await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload, cid);
                                            break;
                                        default: {
                                            payload = { id: inputReference };
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

                            if (this.logInfo) {
                                this.emit('info', `set ${inputMode === 0 ? 'Input' : 'Channel'}, Name: ${inputName}, Reference: ${inputReference}`);
                            }
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Input or Channel error: ${error}`);
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
                            if (this.logInfo) this.emit('info', `set Remote Key: ${command}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Remote Key error: ${error}`);
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
                            if (this.logInfo) this.emit('info', `set Closed Captions: ${state}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Closed Captions error: ${error}`);
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
                            if (this.logInfo) this.emit('info', `set Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Media error: ${error}`);
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
                            if (this.logInfo) this.emit('info', `set Power Mode Selection: ${command === 'MENU' ? 'SHOW' : 'HIDE'}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Power Mode Selection error: ${error}`);
                        }
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
                                    category: 'picture',
                                    settings: {
                                        brightness: value
                                    }
                                };

                                const cid = await this.lgWebOsSocket.getCid();
                                await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Set Brightness', `Value: ${value}`);
                                if (this.logInfo) this.emit('info', `set Brightness: ${value}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Brightness error: ${error}`);
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
                                if (this.logInfo) this.emit('info', `set Picture Mode: ${PictureModes[command] ?? 'Unknown'}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Picture Mode error: ${error}`);
                            }
                        });
                }

                //Prepare volume service
                if (this.volumeControl > 0) {
                    const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                    const volumeServiceNameTv = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;

                    switch (this.volumeControl) {
                        case 1: //lightbulb
                            if (this.logDebug) this.emit('debug', `Prepare volume service lightbulb`);
                            this.volumeServiceLightbulb = accessory.addService(Service.Lightbulb, volumeServiceName, 'Lightbulb Speaker');
                            this.volumeServiceLightbulb.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.volumeServiceLightbulb.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                            this.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness)
                                .onGet(async () => {
                                    const volume = this.volume;
                                    return volume;
                                })
                                .onSet(async (value) => {
                                    try {
                                        const payload = { volume: value };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Volume: ${volume}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                    }
                                });
                            this.volumeServiceLightbulb.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = this.power ? !this.mute : false;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        const payload = { mute: !state };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                    }
                                });
                            break;
                        case 2: //fan
                            if (this.logDebug) this.emit('debug', `Prepare volume service fan`);
                            this.volumeServiceFan = accessory.addService(Service.Fan, volumeServiceName, 'Fan Speaker');
                            this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                            this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                                .onGet(async () => {
                                    const volume = this.volume;
                                    return volume;
                                })
                                .onSet(async (value) => {
                                    try {
                                        const payload = { volume: value };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Volume: ${volume}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                    }
                                });
                            this.volumeServiceFan.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = this.power ? !this.mute : false;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        const payload = { mute: !state };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                    }
                                });
                            break;
                        case 3: // tv speaker
                            if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                            const volumeServiceName3 = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                            this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceName3, 'TV Speaker');
                            this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName3);
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                                .onGet(async () => {
                                    const state = this.power;
                                    return state;
                                })
                                .onSet(async (state) => { });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                                .onGet(async () => {
                                    const state = 3;
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
                                        }
                                        const payload = { name: command };
                                        await this.lgWebOsSocket.send('button', undefined, payload);
                                        if (this.logInfo) this.emit('info', `set Volume Selector: ${command}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                    }
                                });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                                .onGet(async () => {
                                    const volume = this.volume;
                                    return volume;
                                })
                                .onSet(async (value) => {
                                    try {
                                        const payload = { volume: value };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                    }
                                });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                                .onGet(async () => {
                                    const state = this.mute;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        const payload = { mute: state };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                    }
                                });
                            break;
                        case 4: // tv speaker + lightbulb
                            if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                            this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceNameTv, 'TV Speaker');
                            this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceNameTv);
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                                .onGet(async () => {
                                    const state = this.power;
                                    return state;
                                })
                                .onSet(async (state) => { });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                                .onGet(async () => {
                                    const state = 3;
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
                                        }
                                        const payload = { name: command };
                                        await this.lgWebOsSocket.send('button', undefined, payload);
                                        if (this.logInfo) this.emit('info', `set Volume Selector: ${command}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                    }
                                });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                                .onGet(async () => {
                                    const volume = this.volume;
                                    return volume;
                                })
                                .onSet(async (value) => {
                                    try {
                                        const payload = { volume: value };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                    }
                                });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                                .onGet(async () => {
                                    const state = this.mute;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        const payload = { mute: state };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                    }
                                });

                            // lightbulb
                            if (this.logDebug) this.emit('debug', `Prepare volume service lightbulb`);
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
                        case 5: // tv speaker + fan
                            if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                            this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceNameTv, 'TV Speaker');
                            this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceNameTv);
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                                .onGet(async () => {
                                    const state = this.power;
                                    return state;
                                })
                                .onSet(async (state) => { });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                                .onGet(async () => {
                                    const state = 3;
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
                                        }
                                        const payload = { name: command };
                                        await this.lgWebOsSocket.send('button', undefined, payload);
                                        if (this.logInfo) this.emit('info', `set Volume Selector: ${command}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                    }
                                });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                                .onGet(async () => {
                                    const volume = this.volume;
                                    return volume;
                                })
                                .onSet(async (value) => {
                                    try {
                                        const payload = { volume: value };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                    }
                                });
                            this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                                .onGet(async () => {
                                    const state = this.mute;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        const payload = { mute: state };
                                        const cid = await this.lgWebOsSocket.getCid('Audio');
                                        await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                        if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                    }
                                });

                            // fan
                            if (this.logDebug) this.emit('debug', `Prepare volume service fan`);
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
                    }
                }

                //prepare inputs service
                if (this.logDebug) this.emit('debug', `Prepare inputs service`);

                // Check possible inputs count (max 85)
                this.inputsServices = [];
                await this.addRemoveOrUpdateInput(this.savedInputs, false);
            }

            //Picture Control
            if (this.webOS >= 4.0) {
                //Backlight
                if (this.backlightControl) {
                    if (this.logDebug) this.emit('debug', `Prepare backlight service`);
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
                                if (this.logInfo) this.emit('info', `set Backlight: ${value}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Backlight error: ${error}`);
                            }
                        });
                }

                //Brightness
                if (this.brightnessControl) {
                    if (this.logDebug) this.emit('debug', `Prepare brightness service`);
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
                                if (this.logInfo) this.emit('info', `set Brightness: ${value}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Brightness error: ${error}`);
                            }
                        });
                }

                //Contrast
                if (this.contrastControl) {
                    if (this.logDebug) this.emit('debug', `Prepare contrast service`);
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
                                if (this.logInfo) this.emit('info', `set Contrast: ${value}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Contrast error: ${error}`);
                            }
                        });
                }

                //Color
                if (this.colorControl) {
                    if (this.logDebug) this.emit('debug', `Prepare color service`);
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
                                if (this.logInfo) this.emit('info', `set Color: ${value}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Color error: ${error}`);
                            }
                        });
                }

                //Picture mode
                if (this.pictureModes.length > 0) {
                    this.pictureModesServices = [];
                    if (this.logDebug) this.emit('debug', `Prepare picture mode service`);
                    for (let i = 0; i < this.pictureModes.length; i++) {
                        const mode = this.pictureModes[i];
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
                                    if (this.logInfo) this.emit('info', `set Picture Mode: ${modeName}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Picture Mode error: ${error}`);
                                }
                            });
                        this.pictureModesServices.push(pictureModeService);
                        accessory.addService(pictureModeService);
                    }
                }

                //turn screen ON/OFF
                if (this.turnScreenOnOff) {
                    if (this.logDebug) this.emit('debug', `Prepare screen off service`);
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
                                        url = this.webOS >= 4.5 ? ApiUrls.TurnOffScreen45 : ApiUrls.TurnOffScreen;
                                        break;
                                    case false:
                                        url = this.webOS >= 4.5 ? ApiUrls.TurnOnScreen45 : ApiUrls.TurnOnScreen;
                                        break;
                                }

                                const cid = await this.lgWebOsSocket.getCid('Power');
                                await this.lgWebOsSocket.send('request', url, undefined, cid);
                                if (this.logInfo) this.emit('info', `Turn Screen ${state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Turn Screen ${state ? 'ON' : 'OFF'}, error: ${error}`);
                            }
                        });
                };
            }

            //turn screen saver ON/OFF
            if (this.turnScreenSaverOnOff) {
                if (this.logDebug) this.emit('debug', `Prepare screen saver service`);
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
                            if (this.logInfo) this.emit('info', `set Screen Saver: ${state}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `set Color error: ${error}`);
                        }
                    });
            }

            //Sound mode
            if (this.soundModes.length > 0 && this.webOS >= 6.0) {
                this.soundModesServices = [];
                if (this.logDebug) this.emit('debug', `Prepare sound mode service`);
                for (let i = 0; i < this.soundModes.length; i++) {
                    const mode = this.soundModes[i];
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
                                if (this.logInfo) this.emit('info', `set Sound Mode: ${modeName}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Sound Mode error: ${error}`);
                            }
                        });
                    this.soundModesServices.push(soundModeService);
                    accessory.addService(soundModeService);
                }
            }

            //Sound output
            if (this.soundOutputs.length > 0) {
                this.soundOutputsServices = [];
                if (this.logDebug) this.emit('debug', `Prepare sound output service`);
                for (let i = 0; i < this.soundOutputs.length; i++) {
                    const output = this.soundOutputs[i];
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
                                if (this.logInfo) this.emit('info', `set Sound Output: ${outputName}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Sound Output error: ${error}`);
                            }
                        });
                    this.soundOutputsServices.push(soundOutputService);
                    accessory.addService(soundOutputService);
                }
            }

            //prepare sensor service
            if (this.sensorPower) {
                if (this.logDebug) this.emit('debug', `Prepare power sensor service`);
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
                if (this.logDebug) this.emit('debug', `Prepare pixel refresh sensor service`);
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
                if (this.logDebug) this.emit('debug', `Prepare volume sensor service`);
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
                if (this.logDebug) this.emit('debug', `Prepare mute sensor service`);
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
                if (this.logDebug) this.emit('debug', `Prepare input sensor service`);
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
                if (this.logDebug) this.emit('debug', `Prepare channel sensor service`);
                this.sensorChannelService = accessory.addService(Service.ContactSensor, `${accessoryName} Channel Sensor`, `Channel Sensor`);
                this.sensorChannelService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorChannelService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Channel Sensor`);
                this.sensorChannelService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorChannelState;
                        return state;
                    });
            }

            if (this.sensorScreenOnOff && this.webOS >= 4.0) {
                if (this.logDebug) this.emit('debug', `Prepare screen off sensor service`);
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
                if (this.logDebug) this.emit('debug', `Prepare screen saver sensor service`);
                this.sensorScreenSaverService = accessory.addService(Service.ContactSensor, `${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
                this.sensorScreenSaverService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorScreenSaverService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Saver Sensor`);
                this.sensorScreenSaverService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.screenSaverState : false;
                        return state;
                    });
            }

            if (this.sensorSoundMode && this.webOS >= 6.0) {
                if (this.logDebug) this.emit('debug', `Prepare sound mode sensor service`);
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
                if (this.logDebug) this.emit('debug', `Prepare sound output sensor service`);
                this.sensorSoundOutputService = accessory.addService(Service.ContactSensor, `${accessoryName} Sound Output Sensor`, `Sound Output Sensor`);
                this.sensorSoundOutputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorSoundOutputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Sound Output Sensor`);
                this.sensorSoundOutputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorSoundOutputState : false;
                        return state;
                    });
            }

            if (this.sensorPictureMode && this.webOS >= 4.0) {
                if (this.logDebug) this.emit('debug', `Prepare picture mode sensor service`);
                this.sensorPictureModeService = accessory.addService(Service.ContactSensor, `${accessoryName} Picture Mode Sensor`, `Picture Mode Sensor`);
                this.sensorPictureModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPictureModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Picture Mode Sensor`);
                this.sensorPictureModeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.pictureMode : false;
                        return state;
                    });
            }

            if (this.sensorPlayState && this.webOS >= 7.0) {
                if (this.logDebug) this.emit('debug', `Prepare play state sensor service`);
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
            const maxSensorInputsCount = this.sensorInputs.length >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorInputs.length;
            if (maxSensorInputsCount > 0) {
                if (this.logDebug) this.emit('debug', `Prepare inputs sensors services`);

                this.sensorInputsServices = []
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    //get sensor
                    const sensor = this.sensorInputs[i];

                    //get sensor name		
                    const sensorName = sensor.name;

                    //get sensor name prefix
                    const namePrefix = sensor.namePrefix || false;

                    //get service type
                    const serviceType = sensor.serviceType;

                    //get service type
                    const characteristicType = sensor.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${sensorName}` : sensorName;
                    const sensorService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensor.state;
                            return state;
                        });
                    this.sensorInputsServices.push(sensorService);
                    accessory.addService(sensorService);
                }
            }

            //Prepare inputs button services
            const possibleButtonsCount = 99 - this.accessory.services.length;
            const maxButtonsCount = this.buttons.length >= possibleButtonsCount ? possibleButtonsCount : this.buttons.length;
            if (maxButtonsCount > 0) {
                if (this.logDebug) this.emit('debug', `Prepare button service`);

                this.buttonsServices = [];
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttons[i];

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
                            if (!this.power && button.command !== 'POWER') return;

                            try {
                                let cid;
                                switch (buttonMode) {
                                    case 0: //App Control
                                        cid = state ? await this.lgWebOsSocket.getCid('App') : false;
                                        if (state) await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: button.reference }, cid);
                                        if (state && this.logDebug) this.emit('debug', `Set Input, Name: ${buttonName}, Reference: ${button.reference}`);
                                        break;
                                    case 1: //Channel Control
                                        const liveTv = 'com.webos.app.livetv';
                                        cid = state && this.appId !== liveTv ? await this.lgWebOsSocket.getCid('App') : false;
                                        if (this.appId !== liveTv) await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: liveTv }, cid);
                                        cid = state ? await this.lgWebOsSocket.getCid('Channel') : false;
                                        if (state) await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: button.reference }, cid);
                                        if (state && this.logDebug) this.emit('debug', `Set Channel, Name: ${buttonName}, Reference: ${button.reference}`);
                                        break;
                                    case 2: //RC Control
                                        await this.lgWebOsSocket.send('button', undefined, { name: button.command });
                                        if (state && this.logDebug) this.emit('debug', `Set Command, Name: ${buttonName}, Reference: ${button.command}`);
                                        break;
                                    default:
                                        if (this.logDebug) this.emit('debug', `Set Unknown Button Mode: ${buttonMode}`);
                                        button.state = false;
                                        break;
                                }
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set ${['Input', 'Channel', 'Command'][buttonMode]} error: ${error}`);
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
                host: this.host,
                broadcastAddress: this.broadcastAddress,
                logError: this.logError,
                logDebug: this.logDebug
            })
                .on('debug', (debug) => this.emit('debug', debug))
                .on('error', (error) => this.emit('error', error));
        } catch (error) {
            if (this.logWarn) this.emit('warn', `Wake On Lan start error: ${error}`);
        }

        try {
            //lg tv client
            this.lgWebOsSocket = new LgWebOsSocket({
                host: this.host,
                inputs: this.inputs,
                getInputsFromDevice: this.getInputsFromDevice,
                keyFile: this.keyFile,
                devInfoFile: this.devInfoFile,
                inputsFile: this.inputsFile,
                channelsFile: this.channelsFile,
                logWarn: this.logWarn,
                logError: this.logError,
                logDebug: this.logDebug,
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
                .on('installedApps', async (inputs, remove) => {
                    await this.addRemoveOrUpdateInput(inputs, remove);
                })
                .on('powerState', (power, screenState) => {
                    this.power = power;
                    this.pixelRefreshState = power ? screenState === 'Active Standby' : false;
                    this.screenStateOff = power ? screenState === 'Screen Off' : false;
                    this.screenSaverState = power ? screenState === 'Screen Saver' : false;

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

                    if (this.buttons.length > 0) {
                        for (let i = 0; i < this.buttons.length; i++) {
                            const button = this.buttons[i];
                            const state = power ? (button.mode === 2 && button.command === 'POWER' ? power : button.state) : false;
                            button.state = state
                            this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (this.logInfo) this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                })
                .on('currentApp', (appId, power) => {
                    const input = this.inputsServices?.find(input => input.reference === appId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    const inputName = input ? input.name : appId;
                    this.inputIdentifier = inputIdentifier;
                    this.appId = appId;

                    this.televisionService?.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

                    if (appId !== this.appId) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorInputState = state;
                            this.sensorInputService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                        }
                    }

                    if (this.sensorInputs.length > 0) {
                        for (let i = 0; i < this.sensorInputs.length; i++) {
                            const sensorInput = this.sensorInputs[i];
                            sensorInput.state = power ? sensorInput.reference === appId : false;
                            const characteristicType = sensorInput.characteristicType;
                            this.sensorInputsServices?.[i]?.updateCharacteristic(characteristicType, sensorInput.state);
                        }
                    }

                    if (this.buttons.length > 0) {
                        for (let i = 0; i < this.buttons.length; i++) {
                            const button = this.buttons[i];
                            const state = power ? (button.mode === 0 ? button.reference === appId : button.state) : false;
                            button.state = state;
                            this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (this.logInfo) this.emit('info', `Input Name: ${inputName}`);
                })
                .on('audioState', (volume, mute, power) => {
                    this.volume = volume;
                    this.mute = mute;

                    this.volumeServiceTvSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    const muteV = power ? !mute : false;
                    this.volumeServiceLightbulb
                        ?.updateCharacteristic(Characteristic.Brightness, volume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceFan
                        ?.updateCharacteristic(Characteristic.RotationSpeed, volume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    if (volume !== this.volume) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorVolumeState = state;
                            this.sensorVolumeService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                        }
                    }

                    const muteState = power ? mute : false;
                    this.sensorMuteService?.updateCharacteristic(Characteristic.ContactSensorState, muteState);

                    if (this.buttons.length > 0) {
                        for (let i = 0; i < this.buttons.length; i++) {
                            const button = this.buttons[i];
                            const state = power ? (button.mode === 2 && button.command === 'MUTE' ? muteV : button.state) : false;
                            button.state = state
                            this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (this.logInfo) {
                        this.emit('info', `Volume: ${volume}%`);
                        this.emit('info', `Mute: ${mute ? 'ON' : 'OFF'}`);
                    }
                })
                .on('currentChannel', (channelId, channelName, channelNumber, power) => {
                    const input = this.inputsServices?.find(input => input.reference === channelId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    this.inputIdentifier = inputIdentifier;
                    this.channelId = channelId;
                    this.channelName = channelName !== undefined ? channelName : this.channelName;
                    this.channelNumber = channelNumber !== undefined ? channelNumber : this.channelNumber;

                    this.televisionService?.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

                    if (channelId !== this.channelId) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorChannelState = state;
                            this.sensorChannelService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                        }
                    }

                    if (this.buttons.length > 0) {
                        for (let i = 0; i < this.buttons.length; i++) {
                            const button = this.buttons[i];
                            const state = power ? (button.mode === 1 ? button.reference === channelId : button.state) : false;
                            button.state = state;
                            this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (this.logInfo) {
                        this.emit('info', `Channel Number: ${channelNumber}`);
                        this.emit('info', `Channel Name: ${channelName}`);
                    }
                })
                .on('pictureSettings', (brightness, backlight, contrast, color, power) => {
                    this.brightness = brightness;
                    this.backlight = backlight;
                    this.contrast = contrast;
                    this.color = color;

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

                    if (this.logInfo) {
                        this.emit('info', `Brightness: ${brightness}%`);
                        this.emit('info', `Backlight: ${backlight}%`);
                        this.emit('info', `Contrast: ${contrast}%`);
                        this.emit('info', `Color: ${color}%`);
                    }
                })
                .on('pictureMode', (pictureMode, power) => {
                    const mode = 1;
                    this.pictureModeHomeKit = mode;
                    this.pictureMode = pictureMode;

                    this.televisionService?.updateCharacteristic(Characteristic.PictureMode, mode);

                    if (this.pictureModes.length > 0) {
                        for (let i = 0; i < this.pictureModes.length; i++) {
                            const mode = this.pictureModes[i];
                            const state = power ? mode.reference === pictureMode : false;
                            mode.state = state;
                            this.pictureModesServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (pictureMode !== this.pictureMode) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorPicturedModeState = state;
                            this.sensorPicturedModeService?.updateCharacteristic(Characteristic.ContactSensorState, state)
                        }
                    }

                    if (this.logInfo) this.emit('info', `Picture Mode: ${PictureModes[pictureMode] ?? 'Unknown'}`);
                })
                .on('soundMode', (soundMode, power) => {
                    this.soundMode = soundMode;

                    if (this.soundModes.length > 0) {
                        for (let i = 0; i < this.soundModes.length; i++) {
                            const mode = this.soundModes[i];
                            const state = power ? mode.reference === soundMode : false;
                            mode.state = state;
                            this.soundModesServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (soundMode !== this.soundMode) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorSoundModeState = state;
                            this.sensorSoundModeService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                        }
                    }

                    if (this.logInfo) this.emit('info', `Sound Mode: ${SoundModes[soundMode] ?? 'Unknown'}`);
                })
                .on('soundOutput', (soundOutput, power) => {
                    this.soundOutput = soundOutput;

                    if (this.soundOutputs.length > 0) {
                        for (let i = 0; i < this.soundOutputs.length; i++) {
                            const output = this.soundOutputs[i];
                            const state = power ? output.reference === soundOutput : false;
                            output.state = state;
                            this.soundOutputsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (soundOutput !== this.soundOutput) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorSoundOutputState = state;
                            this.sensorSoundOutputService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                        }
                    }

                    if (this.logInfo) this.emit('info', `Sound Output: ${SoundOutputs[soundOutput] ?? 'Unknown'}`);
                })
                .on('mediaInfo', (playState, appType, power) => {
                    this.playState = power ? playState : false;
                    this.appType = appType;

                    this.sensorPlayStateService?.updateCharacteristic(Characteristic.ContactSensorState, playState);

                    if (this.logInfo) this.emit('info', `Play state: ${this.playState ? 'Playing' : 'Paused'}`);
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
            if (!connect) return false;

            //start external integrations
            if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

            //prepare accessory
            const pairingKey = await this.functions.readData(this.keyFile);
            const key = pairingKey.length > 10 ? pairingKey.toString() : '0';

            if (key !== '0') {
                await this.prepareDataForAccessory();
                const accessory = await this.prepareAccessory();
                return accessory;
            } else {
                return new Promise((resolve) => {
                    const intervalId = setInterval(async () => {
                        const pairingKey = await this.functions.readData(this.keyFile);
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