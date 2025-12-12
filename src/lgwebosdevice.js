
import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import WakeOnLan from './wol.js';
import LgWebOsSocket from './lgwebossocket.js';
import Functions from './functions.js';
import { ApiUrls, SystemApps, PictureModes, SoundModes, SoundOutputs } from './constants.js';
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
        this.device = device;
        this.name = device.name;
        this.mac = device.mac;
        this.displayType = device.displayType;
        this.filterSystemApps = device.inputs?.filterSystemApps || false;
        this.inputsDisplayOrder = device.inputs?.displayOrder || 0;
        this.buttons = (device.buttons ?? []).filter(button => (button.displayType ?? 0) > 0);
        this.sensors = Array.isArray(device.sensors) ? (device.sensors ?? []).filter(sensor => (sensor.displayType ?? 0) > 0 && (sensor.mode ?? -1) >= 0) : [];
        this.startInput = device.power?.startInput || false;
        this.startInputReference = device.power?.startInputReference || 'com.webos.app.home';
        this.volumeControl = device.volume?.displayType || 0;
        this.volumeControlName = device.volume?.name || 'Volume';
        this.volumeControlNamePrefix = device.volume?.namePrefix || false;
        this.soundModes = (device.sound?.modes ?? []).filter(mode => (mode.displayType ?? 0) > 0);
        this.soundOutputs = (device.sound?.outputs ?? []).filter(output => (output.displayType ?? 0) > 0);
        this.brightnessControl = device.picture?.brightnessControl || false;
        this.backlightControl = device.picture?.backlightControl || false;
        this.contrastControl = device.picture?.contrastControl || false;
        this.colorControl = device.picture?.colorControl || false;
        this.pictureModes = (device.picture?.modes ?? []).filter(mode => (mode.displayType ?? 0) > 0);
        this.turnScreenOnOff = device.screen?.turnOnOff || false;
        this.turnScreenSaverOnOff = device.screen?.saverOnOff || false;
        this.disableTvService = device.disableTvService || false;
        this.infoButtonCommand = device.infoButtonCommand || 'INFO';
        this.logInfo = device.log?.info || false;
        this.logWarn = device.log?.warn || true;
        this.logError = device.log?.debug || true;
        this.logDebug = device.log?.debug || false;

        //files
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

        //state variable
        this.functions = new Functions();
        this.inputIdentifier = 1;
        this.reference = null;
        this.power = false;
        this.pixelRefreshState = false;
        this.screenStateOff = false;
        this.screenSaverState = false;
        this.volume = 0;
        this.mute = false;
        this.appType = '';
        this.plyState = false;
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

        //picture mode variable
        for (const mode of this.pictureModes) {
            mode.serviceType = [null, Service.Outlet, Service.Switch][mode.displayType];
            mode.state = false;
        }

        //sound mode variable
        for (const mode of this.soundModes) {
            mode.serviceType = [null, Service.Outlet, Service.Switch][mode.displayType];
            mode.state = false;
        }

        //sound output variable
        for (const output of this.soundOutputs) {
            output.serviceType = [null, Service.Outlet, Service.Switch][output.displayType];
            output.state = false;
        }

        //sensors variable
        for (const sensor of this.sensors) {
            sensor.serviceType = [null, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensor.displayType];
            sensor.characteristicType = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensor.displayType];
            sensor.state = false;
        }

        //buttons variable
        for (const button of this.buttons) {
            button.reference = [button.reference, button.reference, button.command][button.mode];
            button.serviceType = [null, Service.Outlet, Service.Switch][button.displayType];
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
        //RESTFul server
        const restFulEnabled = this.restFul.enable || false;
        if (restFulEnabled) {
            try {
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
            } catch (error) {
                this.emit('warn', `RESTFul integration start error: ${error}`);
            };
        }

        //mqtt client
        const mqttEnabled = this.mqtt.enable || false;
        if (mqttEnabled) {
            try {
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

            } catch (error) {
                this.emit('warn', `MQTT integration start error: ${error}`);
            };
        }

        return true;
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            this.savedInfo = await this.functions.readData(this.devInfoFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);
            this.webOS = this.savedInfo.webOS ?? 2.0;

            //read inputs file
            this.savedInputs = await this.functions.readData(this.inputsFile, true) ?? [];
            if (this.logDebug) this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read channels from file
            this.savedChannels = await this.functions.readData(this.channelsFile, true) ?? [];
            if (this.logDebug) this.emit('debug', `Read saved Channels: ${JSON.stringify(this.savedChannels, null, 2)}`);

            //read inputs names from file
            this.savedInputsNames = await this.functions.readData(this.inputsNamesFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs/Channels Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            this.savedInputsTargetVisibility = await this.functions.readData(this.inputsTargetVisibilityFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs/Channels Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return true;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
    }

    async startStopImpulseGenerator(state, timers = []) {
        try {
            //start impulse generator 
            await this.lgWebOsSocket.impulseGenerator.state(state, timers)
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async displayOrder() {
        try {
            const sortStrategies = {
                1: (a, b) => a.name.localeCompare(b.name),
                2: (a, b) => b.name.localeCompare(a.name),
                3: (a, b) => a.reference.localeCompare(b.reference),
                4: (a, b) => b.reference.localeCompare(a.reference),
            };

            const sortFn = sortStrategies[this.inputsDisplayOrder];

            // Sort only if a valid function exists
            if (sortFn) {
                this.inputsServices.sort(sortFn);
            }

            // Debug
            if (this.logDebug) {
                const orderDump = this.inputsServices.map(svc => ({
                    name: svc.name,
                    reference: svc.reference,
                    identifier: svc.identifier,
                }));
                this.emit('debug', `Inputs display order:\n${JSON.stringify(orderDump, null, 2)}`);
            }

            // Always update DisplayOrder characteristic, even for "none"
            const displayOrder = this.inputsServices.map(svc => svc.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');
            this.televisionService.updateCharacteristic(Characteristic.DisplayOrder, encodedOrder);

            return;
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    async addRemoveOrUpdateInput(inputs, remove = false) {
        try {
            if (!this.inputsServices) return;

            let updated = false;

            for (const input of inputs) {
                if (this.inputsServices.length >= 85 && !remove) continue;

                // Filter
                const visible = input.visible ?? true;
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
                        updated = true;
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
                        updated = true;
                    }
                } else {
                    const identifier = this.inputsServices.length + 1;
                    inputService = this.accessory.addService(Service.InputSource, sanitizedName, `Input ${inputReference}`);
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
                    updated = true;
                }
            }

            // Only one time run
            if (updated) await this.displayOrder();

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
                        if (!!state === this.power) return;

                        try {
                            switch (state) {
                                case 1:
                                    await this.wol.wakeOnLan();

                                    if (this.startInput) {
                                        (async () => {
                                            for (let attempt = 0; attempt < 10; attempt++) {
                                                await new Promise(resolve => setTimeout(resolve, 1000));
                                                if (this.power && this.inputIdentifier !== this.startInputReference) {
                                                    const cid = await this.lgWebOsSocket.getCid('App');
                                                    const payload = { id: this.startInputReference };
                                                    await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload, cid);
                                                    break;
                                                }
                                            }
                                        })();
                                        return;
                                    }
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

                            if (!this.power && !this.startInput) {
                                (async () => {
                                    for (let attempt = 0; attempt < 20; attempt++) {
                                        await new Promise(resolve => setTimeout(resolve, 1500));
                                        if (this.power && this.inputIdentifier !== activeIdentifier) {
                                            if (this.logDebug) this.emit('debug', `TV powered on, retrying input switch`);
                                            this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier);
                                            break;
                                        }
                                    }
                                })();

                                return;
                            }

                            const { mode: inputMode, name: inputName, reference: inputReference } = input;
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
                                    if (this.reference !== liveTv) await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: liveTv }, cid);
                                    cid = await this.lgWebOsSocket.getCid('Channel');
                                    await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: inputReference }, cid);
                                    break;
                            }

                            if (this.logInfo) this.emit('info', `set ${inputMode === 0 ? 'Input' : 'Channel'}, Name: ${inputName}, Reference: ${inputReference}`);
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
                                    command = this.playState ? 'PAUSE' : 'PLAY';
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

                //prepare volume service
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
                                        if (this.logInfo) this.emit('info', `set Volume: ${value}`);
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
                                        if (this.logInfo) this.emit('info', `set Volume: ${value}`);
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
                this.inputsServices = [];
                await this.addRemoveOrUpdateInput(this.savedInputs, false);
            }

            //picture Control
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
                        const modeName = mode.name || `Picture Mode ${i}`;
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

            //sound mode
            if (this.soundModes.length > 0 && this.webOS >= 6.0) {
                this.soundModesServices = [];
                if (this.logDebug) this.emit('debug', `Prepare sound mode service`);
                for (let i = 0; i < this.soundModes.length; i++) {
                    const mode = this.soundModes[i];
                    const modeName = mode.name || `Sound Mode ${i}`;
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

            //sound output
            if (this.soundOutputs.length > 0) {
                this.soundOutputsServices = [];
                if (this.logDebug) this.emit('debug', `Prepare sound output service`);
                for (let i = 0; i < this.soundOutputs.length; i++) {
                    const output = this.soundOutputs[i];
                    const outputName = output.name || `Sound Output ${i}`;
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

            //prepare sonsor services
            const possibleSensorCount = 99 - this.accessory.services.length;
            const maxSensorCount = this.sensors.length >= possibleSensorCount ? possibleSensorCount : this.sensors.length;
            if (maxSensorCount > 0) {
                this.sensorServices = [];
                if (this.logDebug) this.emit('debug', `Prepare sensors services`);
                for (let i = 0; i < maxSensorCount; i++) {
                    const sensor = this.sensors[i];

                    //get sensor name		
                    const name = sensor.name || `Sensor ${i}`;

                    //get sensor name prefix
                    const namePrefix = sensor.namePrefix;

                    //get service type
                    const serviceType = sensor.serviceType;

                    //get characteristic type
                    const characteristicType = sensor.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const sensorService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensor.state;
                            return state;
                        });
                    this.sensorServices.push(sensorService);
                    accessory.addService(sensorService);
                }
            }

            //prepare inputs buttons services
            const possibleButtonsCount = 99 - this.accessory.services.length;
            const maxButtonsCount = this.buttons.length >= possibleButtonsCount ? possibleButtonsCount : this.buttons.length;
            if (maxButtonsCount > 0) {
                if (this.logDebug) this.emit('debug', `Prepare button service`);

                this.buttonsServices = [];
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttons[i];

                    //get button name
                    const buttonName = button.name || `Button ${i}`;

                    //get button mode
                    const buttonMode = button.mode;

                    //get button reference
                    const buttonReference = button.reference;

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
                            if (!this.power && buttonReference !== 'POWER') return;

                            try {
                                let cid;
                                switch (buttonMode) {
                                    case 0: //App Control
                                        cid = state ? await this.lgWebOsSocket.getCid('App') : false;
                                        if (state) await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: buttonReference }, cid);
                                        if (state && this.logDebug) this.emit('debug', `Set Input, Name: ${buttonName}, Reference: ${buttonReference}`);
                                        break;
                                    case 1: //Channel Control
                                        const liveTv = 'com.webos.app.livetv';
                                        cid = state && this.reference !== liveTv ? await this.lgWebOsSocket.getCid('App') : false;
                                        if (this.reference !== liveTv) await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: liveTv }, cid);
                                        cid = state ? await this.lgWebOsSocket.getCid('Channel') : false;
                                        if (state) await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: buttonReference }, cid);
                                        if (state && this.logDebug) this.emit('debug', `Set Channel, Name: ${buttonName}, Reference: ${buttonReference}`);
                                        break;
                                    case 2: //RC Control
                                        await this.lgWebOsSocket.send('button', undefined, { name: buttonReference });
                                        if (state && this.logDebug) this.emit('debug', `Set Command, Name: ${buttonName}, Reference: ${buttonReference}`);
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
            this.wol = new WakeOnLan(this.device)
                .on('debug', (debug) => this.emit('debug', debug))
                .on('error', (error) => this.emit('error', error));
        } catch (error) {
            if (this.logWarn) this.emit('warn', `Wake On Lan start error: ${error}`);
        }

        try {
            //lg tv client
            this.lgWebOsSocket = new LgWebOsSocket(this.device, this.keyFile, this.devInfoFile, this.inputsFile, this.channelsFile, this.restFul.enable, this.mqtt.enable)
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
                    this.televisionService?.updateCharacteristic(Characteristic.Active, power);
                    this.sensorPowerService?.updateCharacteristic(Characteristic.ContactSensorState, power);

                    for (let i = 0; i < this.buttons.length; i++) {
                        const button = this.buttons[i];
                        const state = power ? (button.reference === 'POWER' ? power : button.state) : false;
                        button.state = state
                        this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    this.power = power;
                    if (this.logInfo) this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                })
                .on('currentApp', async (appId, power) => {
                    const input = this.inputsServices?.find(input => input.reference === appId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    const inputName = input ? input.name : appId;

                    this.televisionService?.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

                    for (let i = 0; i < this.buttons.length; i++) {
                        const button = this.buttons[i];
                        const state = power ? (button.reference === appId ? true : button.state) : false;
                        button.state = state;
                        this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    this.inputIdentifier = inputIdentifier;
                    this.reference = appId;
                    if (this.logInfo) this.emit('info', `Input Name: ${inputName}`);
                })
                .on('audioState', async (volume, mute, power) => {
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

                    for (let i = 0; i < this.buttons.length; i++) {
                        const button = this.buttons[i];
                        const state = power ? (button.command === 'MUTE' ? muteV : button.state) : false;
                        button.state = state
                        this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    this.volume = volume;
                    this.mute = mute;
                    if (this.logInfo) {
                        this.emit('info', `Volume: ${volume}%`);
                        this.emit('info', `Mute: ${mute ? 'ON' : 'OFF'}`);
                    }
                })
                .on('currentChannel', async (channelId, channelName, channelNumber, power) => {
                    const input = this.inputsServices?.find(input => input.reference === channelId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;

                    this.televisionService?.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

                    for (let i = 0; i < this.buttons.length; i++) {
                        const button = this.buttons[i];
                        const state = power ? (button.reference === channelId ? true : button.state) : false;
                        button.state = state;
                        this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    this.inputIdentifier = inputIdentifier;
                    this.channelId = channelId;
                    this.channelName = channelName !== undefined ? channelName : this.channelName;
                    this.channelNumber = channelNumber !== undefined ? channelNumber : this.channelNumber;
                    if (this.logInfo) {
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
                    if (this.logInfo) {
                        this.emit('info', `Brightness: ${brightness}%`);
                        this.emit('info', `Backlight: ${backlight}%`);
                        this.emit('info', `Contrast: ${contrast}%`);
                        this.emit('info', `Color: ${color}%`);
                    }
                })
                .on('pictureMode', async (pictureMode, power) => {
                    const mode = 1;

                    this.televisionService?.updateCharacteristic(Characteristic.PictureMode, mode);
                    for (let i = 0; i < this.pictureModes.length; i++) {
                        const mode = this.pictureModes[i];
                        const state = power ? mode.reference === pictureMode : false;
                        mode.state = state;
                        this.pictureModesServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    this.pictureModeHomeKit = mode;
                    this.pictureMode = pictureMode;
                    if (this.logInfo) this.emit('info', `Picture Mode: ${PictureModes[pictureMode] ?? 'Unknown'}`);
                })
                .on('soundMode', async (soundMode, power) => {
                    for (let i = 0; i < this.soundModes.length; i++) {
                        const mode = this.soundModes[i];
                        const state = power ? mode.reference === soundMode : false;
                        mode.state = state;
                        this.soundModesServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    this.soundMode = soundMode;
                    if (this.logInfo) this.emit('info', `Sound Mode: ${SoundModes[soundMode] ?? 'Unknown'}`);
                })
                .on('soundOutput', async (soundOutput, power) => {
                    for (let i = 0; i < this.soundOutputs.length; i++) {
                        const output = this.soundOutputs[i];
                        const state = power ? output.reference === soundOutput : false;
                        output.state = state;
                        this.soundOutputsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    this.soundOutput = soundOutput;
                    if (this.logInfo) this.emit('info', `Sound Output: ${SoundOutputs[soundOutput] ?? 'Unknown'}`);
                })
                .on('mediaInfo', async (appId, playState, appType, power) => {
                    const input = this.inputsServices?.find(input => input.reference === appId) ?? false;
                    const inputName = input ? input.name : appId;

                    this.sensorPlayStateService?.updateCharacteristic(Characteristic.ContactSensorState, playState);

                    this.plyState = playState;
                    if (this.logInfo) this.emit('info', `Input Name: ${inputName}, state: ${this.playState ? 'Playing' : 'Paused'}`);
                })
                .on('updateSensors', async (power, screenState, appId, volume, mute, soundMode, soundOutput, pictureMode, playState, channelId) => {
                    const screenOff = screenState === 'Screen Off';
                    const screenSaver = screenState === 'Screen Saver';
                    const activeStandby = screenState === 'Active Standby';

                    // sensors
                    const currentStateModeMap = {
                        0: appId,
                        1: power,
                        2: volume,
                        3: mute,
                        4: soundMode,
                        5: soundOutput,
                        6: pictureMode,
                        7: screenOff,
                        8: screenSaver,
                        9: activeStandby,
                        10: playState,
                        11: channelId
                    };

                    const previousStateModeMap = {
                        0: this.reference,
                        1: this.power,
                        2: this.volume,
                        3: this.mute,
                        4: this.soundMode,
                        5: this.soundOutput,
                        6: this.pictureMode,
                        7: this.screenOff,
                        8: this.screenSaver,
                        9: this.activeStandby,
                        10: this.playState,
                        11: this.channelId,
                    };

                    for (let i = 0; i < this.sensors.length; i++) {
                        let state = false;

                        const sensor = this.sensors[i];
                        const currentValue = currentStateModeMap[sensor.mode];
                        const previousValue = previousStateModeMap[sensor.mode];
                        const pulse = sensor.pulse;
                        const reference = sensor.reference;
                        const level = sensor.level;
                        const characteristicType = sensor.characteristicType;
                        const isActiveMode = power;

                        if (pulse && currentValue !== previousValue) {
                            for (let step = 0; step < 2; step++) {
                                state = isActiveMode ? (step === 0) : false;
                                sensor.state = state;
                                this.sensorServices?.[i]?.updateCharacteristic(characteristicType, state);
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        } else {
                            if (isActiveMode) {
                                switch (sensor.mode) {
                                    case 0: // input
                                    case 4: // sound mode
                                    case 5: // sound output
                                    case 6: // picture mode
                                    case 11: // channel
                                        state = currentValue === reference;
                                        break;
                                    case 2: // volume mode
                                        state = currentValue === level;
                                        break;
                                    case 1: // power
                                    case 3: // mute
                                    case 7: // screenOff
                                    case 8: // screenSaver
                                    case 9: // activeStandby
                                    case 10: // playState
                                        state = currentValue === true;
                                        break;
                                    default:
                                        state = false;
                                }
                            }

                            sensor.state = state;
                            this.sensorServices?.[i]?.updateCharacteristic(characteristicType, state);
                        }
                    }
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