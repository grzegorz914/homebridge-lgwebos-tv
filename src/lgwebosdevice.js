
import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import WakeOnLan from './wol.js';
import LgWebOsSocket from './lgwebossocket.js';
import { ApiUrls, DefaultInputs, PictureModes, SoundModes, SoundOutputs } from './constants.js';
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
        this.enableDebugMode = device.enableDebugMode || false;
        this.disableLogInfo = device.disableLogInfo || false;
        this.disableLogDeviceInfo = device.disableLogDeviceInfo || false;
        this.disableTvService = device.disableTvService || false;
        this.turnScreenOnOff = device.turnScreenOnOff || false;
        this.turnScreenSaverOnOff = device.turnScreenSaverOnOff || false;
        this.sslWebSocket = device.sslWebSocket || false;
        this.infoButtonCommand = device.infoButtonCommand || 'INFO';
        this.volumeControlNamePrefix = device.volumeControlNamePrefix || false;
        this.volumeControlName = device.volumeControlName || 'Volume';
        this.volumeControl = device.volumeControl || false;
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

        //accessory services
        this.allServices = [];

        //add configured inputs to the default inputs
        this.inputs = this.disableLoadDefaultInputs ? this.inputs : [...DefaultInputs, ...this.inputs];
        this.inputsConfigured = [];
        this.inputIdentifier = 1;

        //state variable
        this.power = false;
        this.pixelRefreshState = false;
        this.screenStateOff = false;
        this.screenSaverState = false;
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
                const log = pictureModeDisplayType === 0 ? false : this.emit('message', `Picture Mode Name: ${pictureModeName ? pictureModeName : 'Missing'}, 'Reference: ${pictureModeReference ? pictureModeReference : 'Missing'}`);
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
                const log = soundModeDisplayType === 0 ? false : this.emit('message', `Sound Mode Name: ${soundModeName ? soundModeName : 'Missing'}, 'Reference: ${soundModeReference ? soundModeReference : 'Missing'}`);
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
                const log = soundOutputDisplayType === 0 ? false : this.emit('message', `Sound Mode Name: ${soundOutputName ? soundOutputName : 'Missing'}, 'Reference: ${soundOutputReference ? soundOutputReference : 'Missing'}`);
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
                const log = sensorInputDisplayType === 0 ? false : this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}`);
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
                const log = buttonDisplayType === 0 ? false : this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand ? buttonReferenceCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}`);
            };
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;
    };

    async start() {
        //Wake On Lan
        try {
            this.wol = new WakeOnLan({
                mac: this.mac,
                broadcastAddress: this.broadcastAddress,
                debugLog: this.enableDebugMode
            })
                .on('error', (error) => {
                    this.emit('warn', error);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                });
        } catch (error) {
            throw new Error(`Wake On Lan error: ${error}`);
        };

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
                filterSystemApps: this.filterSystemApps,
                debugLog: this.enableDebugMode,
                sslWebSocket: this.sslWebSocket
            });

            this.lgWebOsSocket.on('deviceInfo', (modelName, productName, deviceId, firmwareRevision) => {
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
                .on('externalIntegrations', () => {
                    try {
                        //RESTFul server
                        const restFulEnabled = this.restFul.enable || false;
                        if (restFulEnabled) {
                            this.restFul1 = new RestFul({
                                port: this.restFul.port || 3000,
                                debug: this.restFul.debug || false
                            });

                            this.restFul1.on('connected', (message) => {
                                this.emit('success', message);
                                this.restFulConnected = true;
                            })
                                .on('set', async (key, value) => {
                                    try {
                                        await this.setOverExternalIntegration('RESTFul', key, value);
                                    } catch (error) {
                                        this.emit('warn', `RESTFul set error: ${error}`);
                                    };
                                })
                                .on('error', (error) => {
                                    this.emit('warn', error);
                                })
                                .on('debug', (debug) => {
                                    this.emit('debug', debug);
                                });
                        }

                        //mqtt client
                        const mqttEnabled = this.mqtt.enable || false;
                        if (mqttEnabled) {
                            this.mqtt1 = new Mqtt({
                                host: this.mqtt.host,
                                port: this.mqtt.port || 1883,
                                clientId: this.mqtt.clientId || `lgwebos_${Math.random().toString(16).slice(3)}`,
                                prefix: `${this.mqtt.prefix}/${this.name}`,
                                user: this.mqtt.user,
                                passwd: this.mqtt.passwd,
                                debug: this.mqtt.debug || false
                            });

                            this.mqtt1.on('connected', (message) => {
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
                                    };
                                })
                                .on('debug', (debug) => {
                                    this.emit('debug', debug);
                                })
                                .on('error', (error) => {
                                    this.emit('warn', error);
                                });
                        };
                    } catch (error) {
                        this.emit('warn', `External integration start error: ${error}`);
                    };
                })
                .on('prepareAccessory', async () => {
                    if (!this.startPrepareAccessory) {
                        return;
                    }

                    try {
                        //read dev info from file
                        const savedInfo = await this.readData(this.devInfoFile);
                        this.savedInfo = savedInfo.toString().trim() !== '' ? JSON.parse(savedInfo) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`) : false;
                        this.webOS = this.savedInfo.webOS ?? 2.0;

                        //read inputs file
                        const savedInputs = await this.readData(this.inputsFile);
                        this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : this.inputs;
                        const debug1 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`) : false;

                        //read channels from file
                        const savedChannels = await this.readData(this.channelsFile);
                        this.savedChannels = savedChannels.toString().trim() !== '' ? JSON.parse(savedChannels) : [];
                        const debug2 = this.enableDebugMode ? this.emit('debug', `Read saved Channels: ${JSON.stringify(this.savedChannels, null, 2)}`) : false;

                        //read inputs names from file
                        const savedInputsNames = await this.readData(this.inputsNamesFile);
                        this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
                        const debug3 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`) : false;

                        //read inputs visibility from file
                        const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
                        this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
                        const debug4 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs/Channels Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`) : false;

                        //prepare accessory
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        const accessory = await this.prepareAccessory();
                        this.emit('publishAccessory', accessory);

                        //sort inputs list
                        const sortInputsDisplayOrder = this.televisionService ? await this.displayOrder() : false;
                        this.startPrepareAccessory = false;

                        //start impulse generator
                        this.lgWebOsSocket.impulseGenerator.start([{ name: 'heartBeat', sampling: 10000 }]);
                        return true;
                    } catch (error) {
                        this.emit('error', `Prepare accessory error: ${error}`);
                    };
                })
                .on('powerState', (power, screenState) => {
                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Active, power);
                    };

                    if (this.turnScreenOnOffService) {
                        const state = power ? screenState === 'Screen Off' : false;
                        this.turnScreenOnOffService
                            .updateCharacteristic(Characteristic.On, state);
                    };

                    if (this.turnScreenSaverOnOffService) {
                        const state = power ? screenState === 'Screen Saver' : false;
                        this.turnScreenSaverOnOffService
                            .updateCharacteristic(Characteristic.On, state)
                    }

                    if (this.sensorPowerService) {
                        this.sensorPowerService
                            .updateCharacteristic(Characteristic.ContactSensorState, power);
                    }

                    if (this.sensorPixelRefreshService) {
                        const state = power ? screenState === 'Active Standby' : false;
                        this.sensorPixelRefreshService
                            .updateCharacteristic(Characteristic.ContactSensorState, state);
                    }

                    if (this.sensorScreenOnOffService) {
                        const state = power ? screenState === 'Screen Off' : false;
                        this.sensorScreenOnOffService
                            .updateCharacteristic(Characteristic.ContactSensorState, state);
                    }

                    if (this.sensorScreenSaverService) {
                        const state = power ? screenState === 'Screen Saver' : false;
                        this.sensorScreenSaverService
                            .updateCharacteristic(Characteristic.ContactSensorState, state);
                    }

                    if (this.buttonsConfiguredCount > 0 && !power) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = false;
                            button.state = state;
                            if (this.buttonsServices && !power) {
                                this.buttonsServices[i]
                                    .updateCharacteristic(Characteristic.On, state);
                            }
                        }
                    }

                    this.power = power;
                    this.pixelRefreshState = power ? screenState === 'Active Standby' : false;
                    this.screenStateOff = power ? screenState === 'Screen Off' : false;
                    this.screenSaverState = power ? screenState === 'Screen Saver' : false;
                    if (!this.disableLogInfo) {
                        this.emit('message', `Power: ${power ? 'ON' : 'OFF'}`);
                    };
                })
                .on('currentApp', (appId) => {
                    const input = this.inputsConfigured.find(input => input.reference === appId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    const inputName = input ? input.name : appId;

                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                    };

                    if (appId !== appId) {
                        for (let i = 0; i < 2; i++) {
                            const state = this.power ? [true, false][i] : false;
                            if (this.sensorInputService) {
                                this.sensorInputService
                                    .updateCharacteristic(Characteristic.ContactSensorState, state)
                                this.sensorInputState = state;
                            }
                        }
                    }

                    if (this.sensorsInputsConfiguredCount > 0) {
                        for (let i = 0; i < this.sensorsInputsConfiguredCount; i++) {
                            const sensorInput = this.sensorsInputsConfigured[i];
                            const state = this.power ? sensorInput.reference === appId : false;
                            sensorInput.state = state;
                            if (this.sensorsInputsServices) {
                                const characteristicType = sensorInput.characteristicType;
                                this.sensorsInputsServices[i]
                                    .updateCharacteristic(characteristicType, state);
                            }
                        }
                    }

                    if (this.buttonsConfiguredCount > 0) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = this.power ? button.reference === appId : false;
                            button.state = state;
                            if (this.buttonsServices) {
                                this.buttonsServices[i]
                                    .updateCharacteristic(Characteristic.On, state);
                            }
                        }
                    }

                    this.inputIdentifier = inputIdentifier;
                    this.appId = appId;
                    if (!this.disableLogInfo) {
                        this.emit('message', `Input Name: ${inputName}`);
                    };
                })
                .on('audioState', (volume, mute) => {
                    if (this.speakerService) {
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

                    if (volume !== this.volume) {
                        for (let i = 0; i < 2; i++) {
                            const state = this.power ? [true, false][i] : false;
                            if (this.sensorMuteService) {
                                this.sensorVolumeService
                                    .updateCharacteristic(Characteristic.ContactSensorState, state)
                                this.sensorVolumeState = state;
                            }
                        }
                    }

                    if (this.sensorMuteService) {
                        const state = this.power ? mute : false;
                        this.sensorMuteService
                            .updateCharacteristic(Characteristic.ContactSensorState, state);
                    }

                    this.volume = volume;
                    this.mute = mute;
                    if (!this.disableLogInfo) {
                        this.emit('message', `Volume: ${volume}%`);
                        this.emit('message', `Mute: ${mute ? 'ON' : 'OFF'}`);
                    };
                })
                .on('currentChannel', (channelId, channelName, channelNumber) => {
                    const input = this.inputsConfigured.find(input => input.reference === channelId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;

                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                    };

                    if (channelId !== this.channelId) {
                        for (let i = 0; i < 2; i++) {
                            const state = this.power ? [true, false][i] : false;
                            if (this.sensorChannelService) {
                                this.sensorChannelService
                                    .updateCharacteristic(Characteristic.ContactSensorState, state)
                                this.sensorChannelState = state;
                            }
                        }
                    }

                    if (this.buttonsConfiguredCount > 0) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = this.power ? this.appId === 'com.webos.app.livetv' && button.reference === channelId : false;
                            button.state = state;
                            if (this.buttonsServices) {
                                this.buttonsServices[i]
                                    .updateCharacteristic(Characteristic.On, state);
                            }
                        }
                    }

                    this.inputIdentifier = inputIdentifier;
                    this.channelId = channelId;
                    this.channelName = channelName !== undefined ? channelName : this.channelName;
                    this.channelNumber = channelNumber !== undefined ? channelNumber : this.channelNumber;
                    if (!this.disableLogInfo) {
                        this.emit('message', `Channel Number: ${channelNumber}`);
                        this.emit('message', `Channel Name: ${channelName}`);
                    };
                })
                .on('pictureSettings', (brightness, backlight, contrast, color, power) => {
                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Brightness, brightness);
                    };

                    if (this.brightnessService) {
                        this.brightnessService
                            .updateCharacteristic(Characteristic.On, power)
                            .updateCharacteristic(Characteristic.Brightness, brightness);
                    };

                    if (this.backlightService) {
                        this.backlightService
                            .updateCharacteristic(Characteristic.On, power)
                            .updateCharacteristic(Characteristic.Brightness, backlight);
                    };

                    if (this.contrastService) {
                        this.contrastService
                            .updateCharacteristic(Characteristic.On, power)
                            .updateCharacteristic(Characteristic.Brightness, contrast);
                    };

                    if (this.colorService) {
                        this.colorService
                            .updateCharacteristic(Characteristic.On, power)
                            .updateCharacteristic(Characteristic.Brightness, color);
                    };

                    this.brightness = brightness;
                    this.backlight = backlight;
                    this.contrast = contrast;
                    this.color = color;
                    if (!this.disableLogInfo) {
                        this.emit('message', `Brightness: ${brightness}%`);
                        this.emit('message', `Backlight: ${backlight}%`);
                        this.emit('message', `Contrast: ${contrast}%`);
                        this.emit('message', `Color: ${color}%`);
                    };
                })
                .on('pictureMode', (pictureMode, power) => {
                    if (this.televisionService) {
                        const mode = 1;
                        this.pictureModeHomeKit = mode;
                        this.televisionService
                            .updateCharacteristic(Characteristic.PictureMode, mode);
                    };

                    if (this.picturesModesConfiguredCount > 0) {
                        for (let i = 0; i < this.picturesModesConfiguredCount; i++) {
                            const mode = this.picturesModesConfigured[i];
                            const state = power ? mode.reference === pictureMode : false;
                            mode.state = state;
                            if (this.picturesModesServices) {
                                this.picturesModesServices[i]
                                    .updateCharacteristic(Characteristic.On, state);
                            };
                        };
                    };

                    if (pictureMode !== this.pictureMode) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            if (this.sensorPicturedModeService) {
                                this.sensorPicturedModeService
                                    .updateCharacteristic(Characteristic.ContactSensorState, state)
                                this.sensorPicturedModeState = state;
                            }
                        }
                    }

                    this.pictureMode = pictureMode;
                    if (!this.disableLogInfo) {
                        this.emit('message', `Picture Mode: ${PictureModes[pictureMode] ?? 'Unknown'}`);
                    };
                })
                .on('soundMode', (soundMode, power) => {
                    if (this.soundsModesConfiguredCount > 0) {
                        for (let i = 0; i < this.soundsModesConfiguredCount; i++) {
                            const mode = this.soundsModesConfigured[i];
                            const state = power ? mode.reference === soundMode : false;
                            mode.state = state;
                            if (this.soundsModesServices) {
                                this.soundsModesServices[i]
                                    .updateCharacteristic(Characteristic.On, state);
                            };
                        };
                    };

                    if (soundMode !== this.soundMode) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            if (this.sensorSoundModeService) {
                                this.sensorSoundModeService
                                    .updateCharacteristic(Characteristic.ContactSensorState, state)
                                this.sensorSoundModeState = state;
                            }
                        }
                    }

                    this.soundMode = soundMode;
                    if (!this.disableLogInfo) {
                        this.emit('message', `Sound Mode: ${SoundModes[soundMode] ?? 'Unknown'}`);
                    };
                })
                .on('soundOutput', (soundOutput, power) => {
                    if (this.soundsOutputsConfiguredCount > 0) {
                        for (let i = 0; i < this.soundsOutputsConfiguredCount; i++) {
                            const output = this.soundsOutputsConfigured[i];
                            const state = power ? output.reference === soundOutput : false;
                            output.state = state;
                            if (this.soundsOutputsServices) {
                                this.soundsOutputsServices[i]
                                    .updateCharacteristic(Characteristic.On, state);
                            };
                        };
                    };

                    if (this.soundMode !== this.soundOutput) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            if (this.sensorSoundOutputService) {
                                this.sensorSoundOutputService
                                    .updateCharacteristic(Characteristic.ContactSensorState, state)
                                this.sensorSoundOutputState = state;
                            }
                        }
                    }

                    this.soundOutput = soundOutput;
                    if (!this.disableLogInfo) {
                        this.emit('message', `Sound Output: ${SoundOutputs[soundOutput] ?? 'Unknown'}`);
                    };
                })
                .on('success', (message) => {
                    this.emit('success', message);
                })
                .on('message', (message) => {
                    this.emit('message', message);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('warn', (warn) => {
                    this.emit('warn', warn);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                })
                .on('restFul', (path, data) => {
                    const restFul = this.restFulConnected ? this.restFul1.update(path, data) : false;
                })
                .on('mqtt', (topic, message) => {
                    const mqtt = this.mqttConnected ? this.mqtt1.emit('publish', topic, message) : false;
                });

            //connect
            await this.lgWebOsSocket.connect();
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    };

    async displayOrder() {
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
            return true;;
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        };
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved data: ${data}`);
            return true;;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        };
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;
        } catch (error) {
            throw new Error(`Read data error: ${error}`);
        };
    }

    async setOverExternalIntegration(integration, key, value) {
        try {
            let set = false
            switch (key) {
                case 'Power':
                    switch (value) {
                        case true:
                            set = !this.power ? await this.wol.wakeOnLan() : true;
                            break;
                        case false:
                            const cid = await this.lgWebOsSocket.getCid('Power');
                            set = this.power ? await this.lgWebOsSocket.send('request', ApiUrls.TurnOff, undefined, cid) : true;
                            break;
                    }
                    break;
                case 'App':
                    const cid = await this.lgWebOsSocket.getCid('App');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: value }, cid);
                    break;
                case 'Channel':
                    const cid1 = await this.lgWebOsSocket.getCid('Channel');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: value }, cid1)
                    break;
                case 'Volume':
                    const volume = (value < 0 || value > 100) ? this.volume : value;
                    const payload = {
                        volume: volume
                    };
                    const cid2 = await this.lgWebOsSocket.getCid('Audio');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid2);
                    break;
                case 'Mute':
                    const payload3 = {
                        mute: value
                    };
                    const cid3 = await this.lgWebOsSocket.getCid('Audio');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload3, cid3);
                    break;
                case 'Brightness':
                    const payload4 = {
                        category: 'picture',
                        settings: {
                            brightness: value
                        }
                    };
                    const cid4 = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload4, cid4);
                    break;
                case 'Backlight':
                    const payload5 = {
                        category: 'picture',
                        settings: {
                            backlight: value
                        }
                    };
                    const cid5 = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload5, cid5);
                    break;
                case 'Contrast':
                    const payload6 = {
                        category: 'picture',
                        settings: {
                            contrast: value
                        }
                    };
                    const cid6 = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload6, cid6);
                    break;
                case 'Color':
                    const payload7 = {
                        category: 'picture',
                        settings: {
                            color: value
                        }
                    };
                    const cid7 = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload7, cid7);
                    break;
                case 'PictureMode':
                    const payload8 = {
                        category: 'picture',
                        settings: {
                            pictureMode: value
                        }
                    };
                    const cid8 = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload8, cid8);
                    break;
                case 'SoundMode':
                    const payload9 = {
                        category: 'sound',
                        settings: {
                            soundMode: value
                        }
                    };
                    const cid9 = await this.lgWebOsSocket.getCid();
                    set = await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload9, cid9);
                    break;
                case 'SoundOutput':
                    const payload10 = {
                        output: value
                    };
                    const cid10 = await this.lgWebOsSocket.getCid('SoundOutput');
                    set = await this.lgWebOsSocket.send('request', ApiUrls.SetSoundOutput, payload10, cid10);
                    break;
                case 'RcControl':
                    const payload11 = {
                        name: value
                    };
                    set = await this.lgWebOsSocket.send('button', undefined, payload11);
                    break;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error}`);
        };
    }

    //Prepare accessory
    async prepareAccessory() {
        try {
            //accessory
            const debug = this.enableDebugMode ? this.emit('debug', `Prepare accessory`) : false;

            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.mac);
            const accessoryCategory = Categories.TELEVISION;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //information service
            const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare information service`) : false;
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer ?? 'LG Electronics')
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName ?? 'Model Name')
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.deviceId ?? 'Serial Number')
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision ?? 'Firmware Revision')
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);
            this.allServices.push(this.informationService);

            //prepare television service 
            if (!this.disableTvService) {
                const debug2 = this.enableDebugMode ? this.emit('debug', `Prepare television service`) : false;
                this.televisionService = accessory.addService(Service.Television, `${accessoryName} Television`, 'Television');
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
                                    const cid = await this.lgWebOsSocket.getCid('Power');
                                    await this.lgWebOsSocket.send('request', ApiUrls.TurnOff, undefined, cid);
                                    break;
                            }
                            const info = this.disableLogInfo ? false : this.emit('message', `set Power: ${state ? 'ON' : 'OFF'}`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            this.emit('warn', `set Power error: ${error}`);
                        }
                    });

                this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                    .onGet(async () => {
                        const inputIdentifier = this.inputIdentifier;
                        return inputIdentifier;
                    })
                    .onSet(async (activeIdentifier) => {
                        try {
                            const input = this.inputsConfigured.find(input => input.identifier === activeIdentifier);
                            const inputMode = input.mode;
                            const inputName = input.name;
                            const inputReference = input.reference;

                            switch (this.power) {
                                case false:
                                    await new Promise(resolve => setTimeout(resolve, 4000));
                                    const tryAgain = this.power ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier) : false;
                                    break;
                                case true:
                                    switch (inputMode) {
                                        case 0:
                                            switch (inputReference) {
                                                case 'com.webos.app.screensaver': //screen saver
                                                    const cid = await this.lgWebOsSocket.getCid();
                                                    await this.lgWebOsSocket.send('alert', ApiUrls.TurnOnScreenSaver, undefined, cid, 'Screen Saver', `ON`);
                                                    break;
                                                case 'service.menu': //service menu
                                                    const payload1 = {
                                                        id: ApiUrls.ServiceMenu,
                                                        params: {
                                                            id: "executeFactory",
                                                            irKey: "inStart"
                                                        }
                                                    }
                                                    const cid1 = await this.lgWebOsSocket.getCid('App');
                                                    await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload1, cid1);
                                                    break;
                                                case 'ez.adjust': //ez adjust
                                                    const payload2 = {
                                                        id: ApiUrls.ServiceMenu,
                                                        params: {
                                                            id: "executeFactory",
                                                            irKey: "ezAdjust"
                                                        }
                                                    }
                                                    const cid2 = await this.lgWebOsSocket.getCid('App');
                                                    await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload2, cid2);
                                                    break;
                                                default:
                                                    const payload3 = {
                                                        id: inputReference
                                                    }
                                                    const cid3 = await this.lgWebOsSocket.getCid('App');
                                                    await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, payload3, cid3);
                                                    break;
                                            }
                                            break;
                                        case 1:
                                            const liveTv = 'com.webos.app.livetv';
                                            const cid1 = this.appId !== liveTv ? await this.lgWebOsSocket.getCid('App') : false;
                                            const openLiveTv = this.appId !== liveTv ? await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: liveTv }, cid1) : false;
                                            const cid2 = await this.lgWebOsSocket.getCid('Channel');
                                            await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: inputReference }, cid2)
                                            break;
                                    }

                                    const info = this.disableLogInfo ? false : this.emit('message', `set ${inputMode === 0 ? 'Input' : 'Channel'}, Name: ${inputName}, Reference: ${inputReference}`);
                                    break;
                            }
                        } catch (error) {
                            this.emit('warn', `set Input or Channel error: ${error}`);
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
                            this.emit('warn', `set Remote Key error: ${error}`);
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
                            this.emit('warn', `set Closed Captions error: ${error}`);
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
                            const newMediaState = [ApiUrls.SetMediaPlay, ApiUrls.SetMediaPause, ApiUrls.SetMediaStop][value]
                            await this.lgWebOsSocket.send('request', newMediaState);
                            const info = this.disableLogInfo ? false : this.emit('message', `set Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        } catch (error) {
                            this.emit('warn', `set Media error: ${error}`);
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
                            this.emit('warn', `set Power Mode Selection error: ${error}`);
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
                                    category: 'picture',
                                    settings: {
                                        brightness: value
                                    }
                                };

                                const cid = await this.lgWebOsSocket.getCid();
                                await this.lgWebOsSocket.send('alert', ApiUrls.SetSystemSettings, payload, cid, 'Set Brightness', `Value: ${value}`);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Brightness: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Brightness error: ${error}`);
                            };
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
                                const info = this.disableLogInfo ? false : this.emit('message', `set Picture Mode: ${PictureModes[command] ?? 'Unknown'}`);
                            } catch (error) {
                                this.emit('warn', `set Picture Mode error: ${error}`);
                            };
                        });
                };
                this.allServices.push(this.televisionService);

                //Prepare speaker service
                const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare speaker service`) : false;
                this.speakerService = accessory.addService(Service.TelevisionSpeaker, `${accessoryName} Speaker`, 'Speaker');
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
                            this.emit('warn', `set Volume Selector error: ${error}`);
                        };
                    });

                this.speakerService.getCharacteristic(Characteristic.Volume)
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
                            const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
                        } catch (error) {
                            this.emit('warn', `set Volume error: ${error}`);
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

                            const cid = await this.lgWebOsSocket.getCid('Audio');
                            await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                            const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('warn', `set Mute error: ${error}`);
                        };
                    });
                this.allServices.push(this.speakerService);

                //prepare inputs service
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare inputs service`) : false;

                //check possible inputs count (max 85)
                const inputs = this.savedInputs;
                const inputsCount = inputs.length;
                const possibleInputsCount = 85 - this.allServices.length;
                const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
                for (let i = 0; i < maxInputsCount; i++) {
                    //input
                    const input = inputs[i];
                    const inputIdentifier = i + 1;

                    //get input reference
                    const inputReference = input.reference;

                    //get input name
                    const savedInputsNames = this.savedInputsNames[inputReference] ?? false;
                    input.name = savedInputsNames ? savedInputsNames : input.name;

                    //input mode
                    const inputMode = input.mode;

                    //get input type
                    const inputSourceType = 0;

                    //get input configured
                    const isConfigured = 1;

                    //get visibility
                    input.visibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                    //add identifier to the input
                    input.identifier = inputIdentifier;

                    //input service
                    const inputService = accessory.addService(Service.InputSource, input.name, `Input ${inputIdentifier}`);
                    inputService
                        .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                        .setCharacteristic(Characteristic.Name, input.name)
                        .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                        .setCharacteristic(Characteristic.InputSourceType, inputSourceType)
                        .setCharacteristic(Characteristic.CurrentVisibilityState, input.visibility)

                    inputService.getCharacteristic(Characteristic.ConfiguredName)
                        .onGet(async () => {
                            return input.name;
                        })
                        .onSet(async (value) => {
                            if (value === this.savedInputsNames[inputReference]) {
                                return;
                            }

                            try {
                                input.name = value;
                                this.savedInputsNames[inputReference] = value;
                                await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                                const debug = this.enableDebugMode ? this.emit('debug', `Saved ${inputMode === 0 ? 'Input' : 'Channel'} Name: ${value}, Reference: ${inputReference}`) : false;

                                //sort inputs
                                const index = this.inputsConfigured.findIndex(input => input.reference === inputReference);
                                this.inputsConfigured[index].name = value;
                                await this.displayOrder();
                            } catch (error) {
                                this.emit('warn', `save Input error: ${error}`);
                            }
                        });

                    inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                        .onGet(async () => {
                            return input.visibility;
                        })
                        .onSet(async (state) => {
                            if (state === this.savedInputsTargetVisibility[inputReference]) {
                                return;
                            }

                            try {
                                input.visibility = state;
                                this.savedInputsTargetVisibility[inputReference] = state;
                                await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                                const debug = this.enableDebugMode ? this.emit('debug', `Saved ${inputMode === 0 ? 'Input' : 'Channel'}: ${input.name}, Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
                            } catch (error) {
                                this.emit('warn', `save Target Visibility error: ${error}`);
                            }
                        });
                    this.inputsConfigured.push(input);
                    this.televisionService.addLinkedService(inputService);
                    this.allServices.push(inputService);
                }
            }


            //Prepare volume service
            if (this.volumeControl) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare volume service`) : false;
                const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                if (this.volumeControl === 1) {
                    this.volumeService = accessory.addService(Service.Lightbulb, `${volumeServiceName}`, volumeServiceName);
                    this.volumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.volumeService.setCharacteristic(Characteristic.ConfiguredName, `${volumeServiceName}`);
                    this.volumeService.getCharacteristic(Characteristic.Brightness)
                        .onGet(async () => {
                            const volume = this.volume;
                            return volume;
                        })
                        .onSet(async (volume) => {
                            try {
                                volume = (volume <= 0 || volume >= 100) ? this.volume : volume;
                                const payload = {
                                    volume: volume
                                };

                                const cid = await this.lgWebOsSocket.getCid('Audio');
                                await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
                            } catch (error) {
                                this.emit('warn', `set Volume error: ${error}`);
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

                                const cid = await this.lgWebOsSocket.getCid('Audio');
                                await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                this.emit('warn', `set Mute error: ${error}`);
                            };
                        });
                    this.allServices.push(this.volumeService);
                }

                if (this.volumeControl === 2) {
                    this.volumeServiceFan = accessory.addService(Service.Fan, `${volumeServiceName}`, volumeServiceName);
                    this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, `${volumeServiceName}`);
                    this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                        .onGet(async () => {
                            const volume = this.volume;
                            return volume;
                        })
                        .onSet(async (volume) => {
                            try {
                                volume = (volume <= 0 || volume >= 100) ? this.volume : volume;
                                const payload = {
                                    volume: volume
                                };

                                const cid = await this.lgWebOsSocket.getCid('Audio');
                                await this.lgWebOsSocket.send('request', ApiUrls.SetVolume, payload, cid);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
                            } catch (error) {
                                this.emit('warn', `set Volume error: ${error}`);
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

                                const cid = await this.lgWebOsSocket.getCid('Audio')
                                await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                this.emit('warn', `set Mute error: ${error}`);
                            };
                        });
                    this.allServices.push(this.volumeServiceFan);
                }
            }

            //Picture Control
            if (this.webOS >= 4.0) {
                //Backlight
                if (this.backlightControl) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare backlight service`) : false;
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
                                const info = this.disableLogInfo ? false : this.emit('message', `set Backlight: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Backlight error: ${error}`);
                            };
                        });
                    this.allServices.push(this.backlightService);
                }

                //Brightness
                if (this.brightnessControl) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare brightness service`) : false;
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
                                const info = this.disableLogInfo ? false : this.emit('message', `set Brightness: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Brightness error: ${error}`);
                            };
                        });
                    this.allServices.push(this.brightnessService);
                }

                //Contrast
                if (this.contrastControl) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare contrast service`) : false;
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
                                const info = this.disableLogInfo ? false : this.emit('message', `set Contrast: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Contrast error: ${error}`);
                            };
                        });
                    this.allServices.push(this.contrastService);
                }

                //Color
                if (this.colorControl) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare color service`) : false;
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
                                const info = this.disableLogInfo ? false : this.emit('message', `set Color: ${value}`);
                            } catch (error) {
                                this.emit('warn', `set Color error: ${error}`);
                            };
                        });
                    this.allServices.push(this.colorService);
                }

                //Picture mode
                if (this.picturesModesConfiguredCount > 0) {
                    this.picturesModesServices = [];
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare picture mode service`) : false;
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
                                    const info = this.disableLogInfo ? false : this.emit('message', `set Picture Mode: ${modeName}`);
                                } catch (error) {
                                    this.emit('warn', `set Picture Mode error: ${error}`);
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
                                const info = this.disableLogInfo ? false : this.emit('message', `Turn Screen ${state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                this.emit('warn', `Turn Screen ${state ? 'ON' : 'OFF'}, error: ${error}`);
                            };
                        });
                    this.allServices.push(this.turnScreenOnOffService);
                };
            };

            //turn screen saver ON/OFF
            if (this.turnScreenSaverOnOff) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare screen saver service`) : false;
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
                            const info = this.disableLogInfo ? false : this.emit('message', `set Screen Saver: ${state}`);
                        } catch (error) {
                            this.emit('warn', `set Color error: ${error}`);
                        };
                    });
                this.allServices.push(this.turnScreenSaverOnOffService);
            }

            //Sound mode
            if (this.soundsModesConfiguredCount > 0 && this.webOS >= 6.0) {
                this.soundsModesServices = [];
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare sound mode service`) : false;
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
                                const info = this.disableLogInfo ? false : this.emit('message', `set Sound Mode: ${modeName}`);
                            } catch (error) {
                                this.emit('warn', `set Sound Mode error: ${error}`);
                            };
                        });
                    this.soundsModesServices.push(soundModeService);
                    this.allServices.push(soundModeService);
                    accessory.addService(soundModeService);
                }
            }

            //Sound output
            if (this.soundsOutputsConfiguredCount > 0) {
                this.soundsOutputsServices = [];
                const debug = this.enableDebugOutput ? this.emit('debug', `Prepare sound output service`) : false;
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
                                const info = this.disableLogInfo ? false : this.emit('message', `set Sound Output: ${outputName}`);
                            } catch (error) {
                                this.emit('warn', `set Sound Output error: ${error}`);
                            };
                        });
                    this.soundsOutputsServices.push(soundOutputService);
                    this.allServices.push(soundOutputService);
                    accessory.addService(soundOutputService);
                }
            }

            //prepare sensor service
            if (this.sensorPower) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare power sensor service`) : false;
                this.sensorPowerService = accessory.addService(Service.ContactSensor, `${accessoryName} Power Sensor`, `Power Sensor`);
                this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    });
                this.allServices.push(this.sensorPowerService);
            };

            if (this.sensorPixelRefresh) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare pixel refresh sensor service`) : false;
                this.sensorPixelRefreshService = accessory.addService(Service.ContactSensor, `${accessoryName} Pixel Refresh Sensor`, `Pixel Refresh Sensor`);
                this.sensorPixelRefreshService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPixelRefreshService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Pixel Refresh Sensor`);
                this.sensorPixelRefreshService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.pixelRefreshState;
                        return state;
                    });
                this.allServices.push(this.sensorPixelRefreshService);
            };

            if (this.sensorVolume) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare volume sensor service`) : false;
                this.sensorVolumeService = accessory.addService(Service.ContactSensor, `${accessoryName} Volume Sensor`, `Volume Sensor`);
                this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorVolumeState;
                        return state;
                    });
                this.allServices.push(this.sensorVolumeService);
            };

            if (this.sensorMute) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare mute sensor service`) : false;
                this.sensorMuteService = accessory.addService(Service.ContactSensor, `${accessoryName} Mute Sensor`, `Mute Sensor`);
                this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.mute : false;
                        return state;
                    });
                this.allServices.push(this.sensorMuteService);
            };

            if (this.sensorInput) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare input sensor service`) : false;
                this.sensorInputService = accessory.addService(Service.ContactSensor, `${accessoryName} Input Sensor`, `Input Sensor`);
                this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorInputState;
                        return state;
                    });
                this.allServices.push(this.sensorInputService);
            };

            if (this.sensorChannel) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare channel sensor service`) : false;
                this.sensorChannelService = accessory.addService(Service.ContactSensor, `${accessoryName} Channel Sensor`, `Channel Sensor`);
                this.sensorChannelService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorChannelService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Channel Sensor`);
                this.sensorChannelService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorChannelState;
                        return state;
                    });
                this.allServices.push(this.sensorChannelService);
            };

            if (this.sensorScreenOnOff && this.webOS >= 4.0) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare screen off sensor service`) : false;
                this.sensorScreenOnOffService = accessory.addService(Service.ContactSensor, `${accessoryName} Screen On/Off Sensor`, `Screen On/Off Sensor`);
                this.sensorScreenOnOffService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorScreenOnOffService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen On/Off Sensor`);
                this.sensorScreenOnOffService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.screenStateOff : false;
                        return state;
                    });
                this.allServices.push(this.sensorScreenOnOffService);
            };

            if (this.sensorScreenSaver) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare screen saver sensor service`) : false;
                this.sensorScreenSaverService = accessory.addService(Service.ContactSensor, `${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
                this.sensorScreenSaverService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorScreenSaverService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Saver Sensor`);
                this.sensorScreenSaverService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.screenSaverState : false;
                        return state;
                    });
                this.allServices.push(this.sensorScreenSaverService);
            };

            if (this.sensorSoundMode && this.webOS >= 6.0) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare sound mode sensor service`) : false;
                this.sensorSoundModeService = accessory.addService(Service.ContactSensor, `${accessoryName} Sound Mode Sensor`, `Sound Mode Sensor`);
                this.sensorSoundModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorSoundModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Sound Mode Sensor`);
                this.sensorSoundModeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorSoundModeState : false;
                        return state;
                    });
                this.allServices.push(this.sensorSoundModeService);
            };

            if (this.sensorSoundOutput) {
                const debug = this.enableDebugOutput ? this.emit('debug', `Prepare sound output sensor service`) : false;
                this.sensorSoundOutputService = accessory.addService(Service.ContactSensor, `${accessoryName} Sound Output Sensor`, `Sound Output Sensor`);
                this.sensorSoundOutputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorSoundOutputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Sound Output Sensor`);
                this.sensorSoundOutputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorSoundOutputState : false;
                        return state;
                    });
                this.allServices.push(this.sensorSoundOutputService);
            };

            if (this.sensorPictureMode && this.webOS >= 4.0) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare picture mode sensor service`) : false;
                this.sensorPictureModeService = accessory.addService(Service.ContactSensor, `${accessoryName} Picture Mode Sensor`, `Picture Mode Sensor`);
                this.sensorPictureModeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPictureModeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Picture Mode Sensor`);
                this.sensorPictureModeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.pictureMode : false;
                        return state;
                    });
                this.allServices.push(this.sensorPictureModeService);
            };

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.allServices.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                this.sensorsInputsServices = []
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensors services`);
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
                    this.allServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }

            //Prepare inputs button services
            const possibleButtonsCount = 99 - this.allServices.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                this.buttonsServices = [];
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare button service`) : false;
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttonsConfigured[i];

                    //get button name
                    const buttonName = button.name;

                    //get button mode
                    const buttonMode = button.mode;

                    //get button reference
                    const buttonReference = button.reference;

                    //get button command
                    const buttonCommand = button.command;

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
                                switch (buttonMode) {
                                    case 0: //App Control
                                        const cid = this.power && state ? await this.lgWebOsSocket.getCid('App') : false;
                                        const send = this.power && state ? await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: buttonReference }, cid) : false;
                                        const debug = this.power && state && this.enableDebugMode ? this.emit('debug', `Set Input, Name: ${buttonName}, Reference: ${buttonReference}`) : false;
                                        break;
                                    case 1: //Channel Control
                                        const liveTv = 'com.webos.app.livetv';
                                        const cid1 = this.power && state && this.appId !== liveTv ? await this.lgWebOsSocket.getCid('App') : false;
                                        const openLiveTv = this.appId !== liveTv ? await this.lgWebOsSocket.send('request', ApiUrls.LaunchApp, { id: liveTv }, cid1) : false;
                                        const cid2 = this.power && state ? await this.lgWebOsSocket.getCid('Channel') : false;
                                        const send1 = this.power && state ? await this.lgWebOsSocket.send('request', ApiUrls.OpenChannel, { channelId: buttonReference }, cid2) : false;
                                        const debug1 = this.power && state && this.enableDebugMode ? this.emit('debug', `Set Channel, Name: ${buttonName}, Reference: ${buttonReference}`) : false;
                                        break;
                                    case 2: //RC Control
                                        const send2 = state ? await this.lgWebOsSocket.send('button', undefined, { name: buttonCommand }) : false;
                                        const debug2 = state && this.enableDebugMode ? this.emit('debug', `Set Command, Name: ${buttonName}, Reference: ${buttonCommand}`) : false;
                                        button.state = false;
                                        break;
                                    default:
                                        const debug3 = this.enableDebugMode ? this.emit('debug', `Set Unknown Button Mode: ${buttonMode}`) : false;
                                        button.state = false;
                                        break;
                                }
                            } catch (error) {
                                this.emit('warn', `set ${['Input', 'Channel', 'Command'][buttonMode]} error: ${error}`);
                            };
                        });
                    this.buttonsServices.push(buttonService);
                    this.allServices.push(buttonService);
                    accessory.addService(buttonService);
                };
            };

            return accessory;
        } catch (error) {
            throw new Error(error)
        };
    };
};

export default LgWebOsDevice;
