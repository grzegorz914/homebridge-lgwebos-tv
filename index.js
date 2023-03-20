'use strict';
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const wol = require('@mi-sec/wol');
const LgTv = require('./src/lgwebsocket');
const Mqtt = require('./src/mqtt.js');

const PLUGIN_NAME = 'homebridge-lgwebos-tv';
const PLATFORM_NAME = 'LgWebOsTv';
const CONSTANS = require('./src/constans.json');

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, lgwebosTvPlatform, true);
};

class lgwebosTvPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log(`No configuration found for ${PLUGIN_NAME}`);
			return;
		};

		this.log = log;
		this.api = api;
		this.accessories = [];
		const devices = config.devices;

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (const device of devices) {
				if (!device.name || !device.host || !device.mac) {
					this.log.warn('Device name, host or mac address missing!');
					return;
				}
				new lgwebosTvDevice(this.log, device, this.api);
			}
		});
	}

	configureAccessory(accessory) {
		this.log.debug('configureAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
	}
}

class lgwebosTvDevice {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.mac = config.mac;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
		this.filterSystemApps = config.filterSystemApps || false;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];
		this.sensorPower = config.sensorPower || false;
		this.sensorVolume = config.sensorVolume || false;
		this.sensorMute = config.sensorMute || false;
		this.sensorInput = config.sensorInput || false;
		this.sensorChannel = config.sensorChannel || false;
		this.sensorScreenOnOff = config.sensorScreenOnOff || false;
		this.sensorScreenSaver = config.sensorScreenSaver || false;
		this.sensorInputs = config.sensorInputs || [];
		this.brightnessControl = config.brightnessControl || false;
		this.backlightControl = config.backlightControl || false;
		this.contrastControl = config.contrastControl || false;
		this.colorControl = config.colorControl || false;
		this.pictureModeControl = config.pictureModeControl || false;
		this.pictureModes = config.pictureModes || [];
		this.enableDebugMode = config.enableDebugMode || false;
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.turnScreenOnOff = config.turnScreenOnOff || false;
		this.sslWebSocket = config.sslWebSocket || false;
		this.infoButtonCommand = config.infoButtonCommand || 'INFO';
		this.volumeControl = config.volumeControl >= 0 ? config.volumeControl : -1;
		this.mqttEnabled = config.enableMqtt || false;
		this.mqttDebug = config.mqttDebug || false;
		this.mqttHost = config.mqttHost;
		this.mqttPort = config.mqttPort || 1883;
		this.mqttPrefix = config.mqttPrefix;
		this.mqttAuth = config.mqttAuth || false;
		this.mqttUser = config.mqttUser;
		this.mqttPasswd = config.mqttPasswd;

		//add configured inputs to the default inputs
		this.inputs = [...CONSTANS.DefaultInputs, ...this.inputs];

		//device info
		this.manufacturer = 'LG Electronics';
		this.modelName = 'Model Name';
		this.serialNumber = 'Serial Number';
		this.firmwareRevision = 'Firmware Revision';
		this.productName = 'webOS';
		this.webOS = 2;

		//setup variables
		this.services = [];
		this.inputsReference = [];
		this.inputsName = [];
		this.inputsMode = [];

		this.pictureModesServices = [];
		this.sensorInputsServices = [];
		this.sensorInputsReference = [];
		this.sensorInputsDisplayType = [];
		this.buttonsServices = [];

		this.firstRun = true;
		this.power = false;
		this.pixelRefresh = false;
		this.screenState = false;
		this.appId = '';
		this.volume = 0;
		this.mute = true;
		this.audioOutput = '';
		this.invertMediaState = false;
		this.screenOnOff = false;
		this.screenSaver = false;

		this.reference = '';
		this.inputIdentifier = 0;
		this.channelName = '';
		this.channelNumber = 0;
		this.brightness = 0;
		this.backlight = 0;
		this.contrast = 0;
		this.color = 0;
		this.pictureMode = 3;
		this.sensorVolumeState = false;
		this.sensorInputState = false;
		this.sensorChannelState = false;

		this.prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		this.keyFile = `${this.prefDir}/key_${this.host.split('.').join('')}`;
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;
		this.channelsFile = `${this.prefDir}/channels_${this.host.split('.').join('')}`;

		const object = JSON.stringify({});
		const array = JSON.stringify([]);
		//check if the directory exists, if not then create it
		if (!fs.existsSync(this.prefDir)) {
			fs.mkdirSync(this.prefDir);
		}
		if (!fs.existsSync(this.keyFile)) {
			fs.writeFileSync(this.keyFile, '');
		}
		if (!fs.existsSync(this.devInfoFile)) {
			fs.writeFileSync(this.devInfoFile, object);
		}
		if (!fs.existsSync(this.inputsFile)) {
			fs.writeFileSync(this.inputsFile, array);
		}
		if (!fs.existsSync(this.channelsFile)) {
			fs.writeFileSync(this.channelsFile, array);
		}
		if (!fs.existsSync(this.inputsNamesFile)) {
			fs.writeFileSync(this.inputsNamesFile, object);
		}
		if (!fs.existsSync(this.inputsTargetVisibilityFile)) {
			fs.writeFileSync(this.inputsTargetVisibilityFile, object);
		}

		//mqtt client
		if (this.mqttEnabled) {
			this.mqtt = new Mqtt({
				host: this.mqttHost,
				port: this.mqttPort,
				prefix: `${this.mqttPrefi}/${this.name}`,
				auth: this.mqttAuth,
				user: this.mqttUser,
				passwd: this.mqttPasswd,
				debug: this.mqttDebug
			});

			this.mqtt.on('connected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
				.on('error', (error) => {
					this.log.error(`Device: ${this.host} ${this.name}, ${error}`);
				})
				.on('debug', (message) => {
					this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
				})
				.on('message', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				})
				.on('disconnected', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				});
		}

		//lg tv client
		const url = this.sslWebSocket ? CONSTANS.ApiUrls.WssUrl.replace('lgwebostv', this.host) : CONSTANS.ApiUrls.WsUrl.replace('lgwebostv', this.host);
		this.lgtv = new LgTv({
			url: url,
			keyFile: this.keyFile,
			debugLog: this.enableDebugMode,
			mqttEnabled: this.mqttEnabled,
			sslWebSocket: this.sslWebSocket
		});

		this.lgtv.on('deviceInfo', async (modelName, productName, serialNumber, firmwareRevision, webOS) => {
			try {
				if (!this.disableLogDeviceInfo) {
					this.log(`-------- ${this.name} --------`);
					this.log(`Manufacturer: ${this.manufacturer}`);
					this.log(`Model: ${modelName}`);
					this.log(`System: ${productName}`);
					this.log(`Serialnr: ${serialNumber}`);
					this.log(`Firmware: ${firmwareRevision}`);
					this.log(`----------------------------------`);
				};

				if (this.informationService) {
					this.informationService
						.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
						.setCharacteristic(Characteristic.Model, modelName)
						.setCharacteristic(Characteristic.SerialNumber, serialNumber)
						.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
				};

				this.modelName = modelName;
				this.productName = productName;
				this.serialNumber = serialNumber;
				this.firmwareRevision = firmwareRevision;
				this.webOS = webOS;

				const obj = {
					modelName: modelName,
					productName: productName,
					serialNumber: serialNumber,
					firmwareRevision: firmwareRevision,
					webOS: webOS
				};
				const devInfo = JSON.stringify(obj, null, 2);
				await fsPromises.writeFile(this.devInfoFile, devInfo);
				const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, saved webOS Info: ${devInfo}`) : false;
			} catch (error) {
				this.log.error(`Device: ${this.host} ${this.name}, save webOS Info error: ${error}`);
			}
		})
			.on('channelList', async (channelList) => {
				try {
					const channelsArr = [];
					for (const channell of channelList) {
						const name = channell.channelName;
						const reference = channell.channelId;
						const number = channell.channelNumber;
						const channelsObj = {
							'name': name,
							'reference': reference,
							'number': number,
							'mode': 1
						}
						channelsArr.push(channelsObj);
					};
					const obj = JSON.stringify(channelsArr, null, 2);
					await fsPromises.writeFile(this.channelsFile, obj);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, channels list saved: ${obj}`) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save channels list error: ${error}`);
				}
			})
			.on('appsList', async (appsList) => {
				try {
					const appsArr = [];
					for (const app of appsList) {
						const name = app.title;
						const reference = app.id;
						const inputsObj = {
							'name': name,
							'reference': reference,
							'mode': 0
						}
						appsArr.push(inputsObj);
					};
					const allInputsArr = this.getInputsFromDevice ? appsArr : this.inputs;
					const inputs = JSON.stringify(allInputsArr, null, 2)
					await fsPromises.writeFile(this.inputsFile, inputs);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, apps list saved: ${obj}`) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save apps list error: ${error}`);
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
				this.firstRun = false;
			})
			.on('currentApp', (reference) => {
				const inputIdentifier = this.inputsReference.includes(reference) ? this.inputsReference.findIndex(index => index === reference) : this.inputIdentifier;

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

				if (this.sensorInputsServices) {
					const servicesCount = this.sensorInputsServices.length;
					for (let i = 0; i < servicesCount; i++) {
						const state = this.power ? (this.sensorInputsReference[i] === reference) : false;
						const displayType = this.sensorInputsDisplayType[i];
						const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
						this.sensorInputsServices[i]
							.updateCharacteristic(characteristicType, state);
					}
				}

				this.reference = reference;
				this.inputIdentifier = inputIdentifier;
			})
			.on('audioState', (volume, mute, audioOutput) => {
				volume = volume ? volume : this.volume;
				audioOutput = audioOutput ? audioOutput : this.audioOutput;

				if (this.speakerService) {
					this.speakerService
						.updateCharacteristic(Characteristic.Volume, volume)
						.updateCharacteristic(Characteristic.Mute, mute);

					if (this.volumeService) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					};

					if (this.volumeServiceFan) {
						this.volumeServiceFan
							.updateCharacteristic(Characteristic.RotationSpeed, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					};
				};

				if (this.sensorVolumeService) {
					const state = this.power ? (this.volume !== volume) : false;
					this.sensorVolumeService
						.updateCharacteristic(Characteristic.ContactSensorState, state)
					this.sensorVolumeState = state;
				}

				if (this.sensorMuteService) {
					const state = this.power ? mute : false;
					this.sensorMuteService
						.updateCharacteristic(Characteristic.ContactSensorState, state)
				}

				this.volume = volume;
				this.mute = mute;
				this.audioOutput = audioOutput;
			})
			.on('currentChannel', (channelName, channelNumber, channelId) => {
				const inputIdentifier = this.inputsReference.includes(channelId) ? this.inputsReference.findIndex(index => index === channelId) : this.inputIdentifier;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				};

				if (this.sensorChannelService) {
					const state = this.power ? (this.inputIdentifier !== inputIdentifier) : false;
					this.sensorChannelService
						.updateCharacteristic(Characteristic.ContactSensorState, state)
					this.sensorChannelState = state;
				}

				this.channelName = channelName;
				this.channelNumber = channelNumber;
				this.inputIdentifier = inputIdentifier;
			})
			.on('pictureSettings', (brightness, backlight, contrast, color, pictureMode, power) => {

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Brightness, brightness)
						.updateCharacteristic(Characteristic.PictureMode, pictureMode);
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
				if (this.pictureModesServices) {
					const servicesCount = this.pictureModesServices.length;
					for (let i = 0; i < servicesCount; i++) {
						const state = this.power ? (this.pictureModes[i].reference === pictureMode) : false;
						this.pictureModesServices[i]
							.updateCharacteristic(Characteristic.On, state);
					};
				};

				this.brightness = brightness;
				this.backlight = backlight;
				this.contrast = contrast;
				this.color = color;
				this.pictureMode = pictureMode;
			})
			.on('error', (error) => {
				this.log.error(`Device: ${this.host} ${this.name}, ${JSON.stringify(error, null, 2)}`);
			})
			.on('debug', (debug) => {
				this.log(`Device: ${this.host} ${this.name}, debug: ${debug}`);
			})
			.on('message', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
			.on('mqtt', (topic, message) => {
				this.mqtt.send(topic, message);
			})
			.on('prepareAccessory', async () => {
				try {
					await this.prepareAccessory();
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, prepare accessory error: ${error}`);
				};
			});
	};

	//Prepare accessory
	prepareAccessory() {
		return new Promise((resolve, reject) => {
			this.log.debug('prepareAccessory');
			try {
				const devInfo = fs.readFileSync(this.devInfoFile).length > 2 ? JSON.parse(fs.readFileSync(this.devInfoFile)) : false;
				const webOS = devInfo.webOS ? devInfo.webOS : this.webOS;

				//accessory
				const accessoryName = this.name;
				const accessoryUUID = UUID.generate(this.mac);
				const accessoryCategory = Categories.TELEVISION;
				const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

				//information service
				this.log.debug('prepareInformationService');
				this.informationService = accessory.getService(Service.AccessoryInformation)
					.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
					.setCharacteristic(Characteristic.Model, this.modelName)
					.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
					.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);
				this.services.push(this.informationService);

				//prepare television service 
				this.log.debug('prepareTelevisionService');
				this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
				this.televisionService.getCharacteristic(Characteristic.ConfiguredName)
					.onGet(async () => {
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} Accessory Name: ${accessoryName}.`);
						return accessoryName;
					})
					.onSet(async (value) => {
						try {
							this.name = value;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Accessory Name: ${value}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Brightness error: ${error}`);
						};
					});
				this.televisionService.getCharacteristic(Characteristic.SleepDiscoveryMode)
					.onGet(async () => {
						const state = 1;
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Discovery Mode: ${state ? 'Always discoverable' : 'Not discoverable'}`);
						return state;
					})
					.onSet(async (state) => {
						try {
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Discovery Mode: ${state ? 'Always discoverable' : 'Not discoverable'}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Discovery Mode error: ${error}`);
						};
					});

				this.televisionService.getCharacteristic(Characteristic.Active)
					.onGet(async () => {
						const state = this.power;
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Power: ${state ? 'ON' : 'OFF'}`);
						return state;
					})
					.onSet(async (state) => {
						try {
							const options = {
								address: '255.255.255.255',
								packets: 3,
								interval: 100,
								port: 9
							}
							const setPower = state ? await wol(this.mac, options) : await this.lgtv.send('request', CONSTANS.ApiUrls.TurnOff);
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power: ${state ? 'ON' : 'OFF'}`);
							await new Promise(resolve => setTimeout(resolve, 2000));
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Power error:  ${error}`);
						}
					});

				this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
					.onGet(async () => {
						const inputIdentifier = this.inputIdentifier;
						const inputName = this.inputsName[inputIdentifier];
						const inputReference = this.inputsReference[inputIdentifier];
						const inputMode = this.inputsMode[inputIdentifier];
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, ${inputMode === 0 ? 'Input' : 'Channel'}, Name: ${inputName}, Reference: ${inputReference}`);
						return inputIdentifier;
					})
					.onSet(async (inputIdentifier) => {
						try {
							const inputName = this.inputsName[inputIdentifier];
							const inputMode = this.inputsMode[inputIdentifier];
							const inputReference = this.inputsReference[inputIdentifier];

							if (this.power && inputReference) {
								switch (inputMode) {
									case 0: case 1:
										const inputId = [inputReference, 'com.webos.app.livetv'][inputMode];
										await this.lgtv.send('request', CONSTANS.ApiUrls.LaunchApp, { id: inputId });
										break;
									case 1:
										await this.lgtv.send('request', CONSTANS.ApiUrls.OpenChannel, { channelId: inputReference })
										break;
								}
							}

							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set ${inputMode === 0 ? 'Input' : 'Channel'}, Name: ${inputName}, Reference: ${inputReference}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Input or Channel error: ${error}`);
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
							await this.lgtv.send('button', payload);
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Remote Key: ${command}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Remote Key error: ${error}`);
						};
					});

				//optional television characteristics
				this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
					.onGet(async () => {
						const state = 0;
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Closed Captions: ${state}`);
						return state;
					})
					.onSet(async (state) => {
						try {
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Closed Captions: ${state}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName} set Closed Captions error: ${error}`);
						};
					});

				this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
					.onGet(async () => {
						//0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
						const value = 2;
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
						return value;
					});

				this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
					.onGet(async () => {
						//0 - PLAY, 1 - PAUSE, 2 - STOP
						const value = 2;
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
						return value;
					})
					.onSet(async (value) => {
						try {
							const newMediaState = [CONSTANS.ApiUrls.SetMediaPlay, CONSTANS.ApiUrls.SetMediaPause, CONSTANS.ApiUrls.SetMediaStop][value]
							await this.lgtv.send('request', newMediaState);
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
						} catch (error) {
							this.log.error(`Device: $ {this.host} ${accessoryName} % s, set Media error: ${error}`);
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
							await this.lgtv.send('button', payload);
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power Mode Selection: ${command === 'MENU' ? 'SHOW' : 'HIDE'}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Power Mode Selection error: ${error}`);
						};
					});

				if (webOS >= 4) {
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
								await this.lgtv.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
								const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Brightness: ${value}`);
							} catch (error) {
								this.log.error(`Device: ${this.host} ${accessoryName}, set Brightness error: ${error}`);
							};
						});

					this.televisionService.getCharacteristic(Characteristic.PictureMode)
						.onGet(async () => {
							const value = this.pictureMode;
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Picture Mode: ${value}`);
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
								await this.lgtv.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
								const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Picture Mode: ${command}`);
							} catch (error) {
								this.log.errorthis.log(`Device: ${this.host} ${accessoryName}, set Picture Mode error: ${error}`);
							};
						});
				};

				this.services.push(this.televisionService);
				accessory.addService(this.televisionService);

				//Prepare speaker service
				this.log.debug('prepareSpeakerService');
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
							await this.lgtv.send('button', payload);
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume Selector: ${command}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName} , set Volume Selector error: ${error}`);
						};
					});

				this.speakerService.getCharacteristic(Characteristic.Volume)
					.onGet(async () => {
						const volume = this.volume;
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Volume: ${volume}`);
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
							await this.lgtv.send('request', CONSTANS.ApiUrls.SetVolume, payload);
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume: ${volume}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName} , set Volume error: ${error}`);
						};
					});

				this.speakerService.getCharacteristic(Characteristic.Mute)
					.onGet(async () => {
						const state = this.power ? this.mute : true;
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Mute: ${state ? 'ON' : 'OFF'}`);
						return state;
					})
					.onSet(async (state) => {
						try {
							const payload = {
								mute: state
							};
							await this.lgtv.send('request', CONSTANS.ApiUrls.SetMute, payload);
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Mute: ${state ? 'ON' : 'OFF'}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName} , set Mute error: ${error}`);
						};
					});
				this.services.push(this.tvSpeakerService);
				accessory.addService(this.speakerService);

				//Prepare volume service
				if (this.volumeControl >= 0) {
					this.log.debug('prepareVolumeService');
					if (this.volumeControl === 0) {
						this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
						this.volumeService.getCharacteristic(Characteristic.Brightness)
							.onGet(async () => {
								const volume = this.volume;
								return volume;
							})
							.onSet(async (volume) => {
								this.speakerService.setCharacteristic(Characteristic.Volume, volume);
							});
						this.volumeService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.power ? !this.mute : false;
								return state;
							})
							.onSet(async (state) => {
								this.speakerService.setCharacteristic(Characteristic.Mute, !state);
							});

						this.services.push(this.volumeService);
						accessory.addService(this.volumeService);
					}

					if (this.volumeControl === 1) {
						this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
						this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
							.onGet(async () => {
								const volume = this.volume;
								return volume;
							})
							.onSet(async (volume) => {
								this.speakerService.setCharacteristic(Characteristic.Volume, volume);
							});
						this.volumeServiceFan.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.power ? !this.mute : false;
								return state;
							})
							.onSet(async (state) => {
								this.speakerService.setCharacteristic(Characteristic.Mute, !state);
							});

						this.services.push(this.volumeServiceFan);
						accessory.addService(this.volumeServiceFan);
					}
				}

				//Picture Control
				if (webOS >= 4) {
					//Backlight
					if (this.backlightControl) {
						this.log.debug('prepareBacklightService');
						this.backlightService = new Service.Lightbulb(`${accessoryName} Backlight`, 'Backlight');
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
									await this.lgtv.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
									const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Backlight: ${value}`);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, set Backlight error: ${error}`);
								};
							});

						this.services.push(this.backlightService);
						accessory.addService(this.backlightService);
					}

					//Brightness
					if (this.brightnessControl) {
						this.log.debug('prepareBrightnessService');
						this.brightnessService = new Service.Lightbulb(`${accessoryName} Brightness`, 'Brightness');
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
									await this.lgtv.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
									const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Brightness: ${value}`);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, set Brightness error: ${error}`);
								};
							});

						this.services.push(this.brightnessService);
						accessory.addService(this.brightnessService);
					}

					//Contrast
					if (this.contrastControl) {
						this.log.debug('prepareContrastService');
						this.contrastService = new Service.Lightbulb(`${accessoryName} Contrast`, 'Contrast');
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
									await this.lgtv.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
									const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Contrast: ${value}`);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, set Contrast error: ${error}`);
								};
							});

						this.services.push(this.contrastService);
						accessory.addService(this.contrastService);
					}

					//Color
					if (this.colorControl) {
						this.log.debug('prepareColorService');
						this.colorService = new Service.Lightbulb(`${accessoryName} Color`, 'Color');
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
									await this.lgtv.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
									const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Color: ${value}`);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, set Color error: ${error}`);
								};
							});

						this.services.push(this.colorService);
						accessory.addService(this.colorService);
					}

					//Picture mode
					if (this.pictureModeControl) {
						this.log.debug('preparePictureModeService');
						const pictureModes = this.pictureModes;
						const pictureModesCount = pictureModes.length;
						for (let i = 0; i < pictureModesCount; i++) {
							const pictureModeName = pictureModes[i].name;
							const pictureModeReference = pictureModes[i].reference;
							const pictureModeService = new Service.Switch(`${accessoryName} ${pictureModeName}`, `Picture Mode ${i}`);
							pictureModeService.getCharacteristic(Characteristic.On)
								.onGet(async () => {
									const state = this.power ? (this.pictureMode === pictureModeReference) : false;
									const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Picture Mode: ${pictureModeName}`);
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

										await this.lgtv.send('request', CONSTANS.ApiUrls.SetSystemSettings, payload);
										const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Picture Mode: ${pictureModeName}`);
									} catch (error) {
										this.log.error(`Device: ${this.host} ${accessoryName}, set Picture Mode error: ${error}`);
									};
								});

							this.pictureModesServices.push(pictureModeService);
							this.services.push(pictureModeService);
							accessory.addService(this.pictureModesServices[i]);
						}
					}

					//turn screen ON/OFF
					if (this.turnScreenOnOff) {
						this.turnScreenOnOffService = new Service.Switch(`${accessoryName} Screen Off`, 'Screen Off');
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
									const url = webOS <= 5 ? (state ? CONSTANS.ApiUrls.TurnOnScreen : CONSTANS.ApiUrls.TurnOffScreen) : (state ? CONSTANS.ApiUrls.TurnOnScreen5 : CONSTANS.ApiUrls.TurnOffScreen5);
									await this.lgtv.send('request', url);
									const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Turn Screen ${state ? 'ON' : 'OFF'}.`);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, Turn Screen ${state ? 'ON' : 'OFF'}, error: ${error}`);
								};
							});

						this.services.push(this.turnScreenOnOffService);
						accessory.addService(this.turnScreenOnOffService);
					};
				}

				//prepare sensor service
				if (this.sensorPower) {
					this.log.debug('prepareSensorPowerService')
					this.sensorPowerService = new Service.ContactSensor(`${accessoryName} Power Sensor`, `Power Sensor`);
					this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
						.onGet(async () => {
							const state = this.power;
							return state;
						});

					this.services.push(this.sensorPowerService);
					accessory.addService(this.sensorPowerService);
				};

				if (this.sensorVolume) {
					this.log.debug('prepareSensorVolumeService')
					this.sensorVolumeService = new Service.ContactSensor(`${accessoryName} Volume Sensor`, `Volume Sensor`);
					this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
						.onGet(async () => {
							const state = this.sensorVolumeState;
							return state;
						});

					this.services.push(this.sensorVolumeService);
					accessory.addService(this.sensorVolumeService);
				};

				if (this.sensorMute) {
					this.log.debug('prepareSensorMuteService')
					this.sensorMuteService = new Service.ContactSensor(`${accessoryName} Mute Sensor`, `Mute Sensor`);
					this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
						.onGet(async () => {
							const state = this.power ? this.mute : false;
							return state;
						});

					this.services.push(this.sensorMuteService);
					accessory.addService(this.sensorMuteService);
				};

				if (this.sensorInput) {
					this.log.debug('prepareSensorInputService')
					this.sensorInputService = new Service.ContactSensor(`${accessoryName} Input Sensor`, `Input Sensor`);
					this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
						.onGet(async () => {
							const state = this.sensorInputState;
							return state;
						});

					this.services.push(this.sensorInputService);
					accessory.addService(this.sensorInputService);
				};

				if (this.sensorChannel) {
					this.log.debug('prepareSensorChannelService')
					this.sensorChannelService = new Service.ContactSensor(`${accessoryName} Channel Sensor`, `Channel Sensor`);
					this.sensorChannelService.getCharacteristic(Characteristic.ContactSensorState)
						.onGet(async () => {
							const state = this.sensorChannelState;
							return state;
						});

					this.services.push(this.sensorChannelService);
					accessory.addService(this.sensorChannelService);
				};

				if (this.sensorScreenOnOff && webOS >= 4) {
					this.log.debug('prepareSensorScreenOnOffService')
					this.sensorScreenOnOffService = new Service.ContactSensor(`${accessoryName} Screen On/Off Sensor`, `Screen On/Off Sensor`);
					this.sensorScreenOnOffService.getCharacteristic(Characteristic.ContactSensorState)
						.onGet(async () => {
							const state = this.power ? this.screenOnOff : false;
							return state;
						});

					this.services.push(this.sensorScreenOnOffService);
					accessory.addService(this.sensorScreenOnOffService);
				};

				if (this.sensorScreenSaver) {
					this.log.debug('prepareSensorScreenSaverService')
					this.sensorScreenSaverService = new Service.ContactSensor(`${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
					this.sensorScreenSaverService.getCharacteristic(Characteristic.ContactSensorState)
						.onGet(async () => {
							const state = this.power ? this.screenSaver : false;
							return state;
						});

					this.services.push(this.sensorScreenSaverService);
					accessory.addService(this.sensorScreenSaverService);
				};

				//Prepare inputs service
				this.log.debug('prepareInputsService');
				const savedInputs = fs.readFileSync(this.inputsFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsFile)) : this.inputs;
				const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs: ${JSON.stringify(savedInputs, null, 2)}`) : false;

				const savedChannels = fs.readFileSync(this.channelsFile).length > 2 ? JSON.parse(fs.readFileSync(this.channelsFile)) : [];
				const debug1 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Channels: ${JSON.stringify(savedChannels, null, 2)}`) : false;

				const savedInputsNames = fs.readFileSync(this.inputsNamesFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
				const debug2 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs/Channels Names: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

				const savedInputsTargetVisibility = fs.readFileSync(this.inputsTargetVisibilityFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
				const debug3 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs/Channels Target Visibility: ${JSON.stringify(savedInputsTargetVisibility, null, 2)}`) : false;


				//check possible inputs and filter custom unnecessary inputs
				const filteredInputsArr = [];
				for (const input of savedInputs) {
					const reference = input.reference;
					const filterSystemApps = this.filterSystemApps ? CONSTANS.SystemApps.includes(reference) : false;
					const push = this.getInputsFromDevice ? (!filterSystemApps) ? filteredInputsArr.push(input) : false : filteredInputsArr.push(input);
				}

				//check possible inputs and possible inputs count (max 90)
				const inputs = filteredInputsArr;
				const inputsCount = inputs.length;
				const possibleInputsCount = 90 - this.services.length;
				const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
				for (let i = 0; i < maxInputsCount; i++) {
					//input
					const input = inputs[i];

					//get input reference
					const inputReference = input.reference;

					//get input name		
					const inputName = savedInputsNames[inputReference] || input.name;

					//get input mode
					const inputMode = input.mode;

					//get input type
					const inputType = 0;

					//get input configured
					const isConfigured = 1;

					//get input visibility state
					const currentVisibility = savedInputsTargetVisibility[inputReference] || 0;
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
							.onGet(async () => {
								return inputName;
							})
							.onSet(async (value) => {
								try {
									savedInputsNames[inputReference] = value;
									const newCustomName = JSON.stringify(savedInputsNames, null, 2);

									await fsPromises.writeFile(this.inputsNamesFile, newCustomName);
									const logDebug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved ${inputMode === 0 ? 'Input' : 'Channel'} Name: ${value}, Reference: ${inputReference}`) : false;
									inputService.setCharacteristic(Characteristic.Name, value);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, save Input error: ${error}`);
								}
							});

						inputService.getCharacteristic(Characteristic.TargetVisibilityState)
							.onGet(async () => {
								return targetVisibility;
							})
							.onSet(async (state) => {
								try {
									savedInputsTargetVisibility[inputReference] = state;
									const newTargetVisibility = JSON.stringify(savedInputsTargetVisibility, null, 2);

									await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility);
									const logDebug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved ${inputMode === 0 ? 'Input' : 'Channel'}: ${inputName}, Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
									inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, save Target Visibility error: ${error}`);
								}
							});

						this.inputsReference.push(inputReference);
						this.inputsName.push(inputName);
						this.inputsMode.push(inputMode);

						this.televisionService.addLinkedService(inputService);
						this.services.push(inputService);
						accessory.addService(inputService);
					} else {
						this.log(`Device: ${this.host} ${accessoryName}, Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}, Mode: ${inputMode ? inputMode : 'Missing'}.`);

					};
				}

				//prepare sonsor service
				const sensorInputs = this.sensorInputs;
				const sensorInputsCount = sensorInputs.length;
				const possibleSensorInputsCount = 99 - this.services.length;
				const maxSensorInputsCount = sensorInputsCount >= possibleSensorInputsCount ? possibleSensorInputsCount : sensorInputsCount;
				if (maxSensorInputsCount > 0) {
					this.log.debug('prepareSensorInputsServices');
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
								sensorInputService.getCharacteristic(characteristicType)
									.onGet(async () => {
										const state = this.power ? (sensorInputReference === this.reference) : false;
										return state;
									});

								this.sensorInputsReference.push(sensorInputReference);
								this.sensorInputsDisplayType.push(sensorInputDisplayType);
								this.sensorInputsServices.push(sensorInputService);
								this.services.push(sensorInputService);
								accessory.addService(this.sensorInputsServices[i]);
							} else {
								this.log(`Device: ${this.host} ${accessoryName}, Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
							};
						}
					}
				}

				//Prepare inputs button services
				const buttons = this.buttons;
				const buttonsCount = buttons.length;
				const possibleButtonsCount = 99 - this.services.length;
				const maxButtonsCount = buttonsCount >= possibleButtonsCount ? possibleButtonsCount : buttonsCount;
				if (maxButtonsCount > 0) {
					this.log.debug('prepareInputsButtonService');
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
								buttonService.getCharacteristic(Characteristic.On)
									.onGet(async () => {
										const state = false;
										return state;
									})
									.onSet(async (state) => {
										try {
											if (this.power && state) {
												switch (buttonMode) {
													case 0: case 1:
														const appId = [buttonReference, 'com.webos.app.livetv'][buttonMode]
														await this.lgtv.send('request', CONSTANS.ApiUrls.LaunchApp, { id: appId });
														break;
													case 1:
														await this.lgtv.send('request', CONSTANS.ApiUrls.OpenChannel, { channelId: buttonReference })
														break;
													case 2:
														await this.lgtv.send('button', { name: buttonCommand });
														break;
												}
												const logDebug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, set ${['Input', 'Channel', 'Command'][buttonMode]} Name: ${buttonName}, Reference: ${[buttonReference, buttonReference, buttonCommand][buttonMode]}`) : false;
											}
											await new Promise(resolve => setTimeout(resolve, 300));
											const setChar = state ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
										} catch (error) {
											this.log.error(`Device: ${this.host} ${accessoryName}, set ${['Input', 'Channel', 'Command'][buttonMode]} error: ${error}`);
										};
									});
								this.buttonsServices.push(buttonService);
								this.services.push(buttonService);
								accessory.addService(this.buttonsServices[i]);
							} else {
								this.log(`Device: ${this.host} ${accessoryName}, Button Name: ${buttonName ? buttonName : 'Missing'}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand ? buttonReferenceCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}..`);
							};
						};
					};
				};

				this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
				const debug4 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, published as external accessory.`) : false;
				resolve();
			} catch (error) {
				reject(error)
			};
		});
	};
};
