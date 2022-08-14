'use strict';

const wol = require('@mi-sec/wol');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const lgtv = require('./src/lgwebos');
const mqttClient = require('./src/mqtt.js');
const API_URL = require('./src/apiurl.json');

const PLUGIN_NAME = 'homebridge-lgwebos-tv';
const PLATFORM_NAME = 'LgWebOsTv';

const WEBSOCKET_PORT = 3000;
const DEFAULT_INPUTS = [{
		'name': 'Live TV',
		'reference': 'com.webos.app.livetv',
		'type': 'TUNER',
		'mode': 0
	}, {
		'name': 'HDMI 1',
		'reference': 'com.webos.app.hdmi1',
		'type': 'HDMI',
		'mode': 0
	},
	{
		'name': 'HDMI 2',
		'reference': 'com.webos.app.hdmi2',
		'type': 'HDMI',
		'mode': 0
	}
];

const INPUT_SOURCE_TYPES = ['OTHER', 'HOME_SCREEN', 'TUNER', 'HDMI', 'COMPOSITE_VIDEO', 'S_VIDEO', 'COMPONENT_VIDEO', 'DVI', 'AIRPLAY', 'USB', 'APPLICATION'];

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
			log('No configuration found for %s', PLUGIN_NAME);
			return;
		}
		this.log = log;
		this.api = api;
		this.devices = config.devices || [];
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				if (!device.name || !device.host || !device.mac) {
					this.log.warn('Device Name, host or mac address missing!');
				} else {
					new lgwebosTvDevice(this.log, device, this.api);
				}
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
		this.name = config.name || 'LG TV';
		this.host = config.host;
		this.mac = config.mac;
		this.volumeControl = config.volumeControl || 0;
		this.infoButtonCommand = config.infoButtonCommand || 'INFO';
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
		this.filterSystemApps = config.filterSystemApps || false;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];
		this.brightnessControl = config.brightnessControl || false;
		this.backlightControl = config.backlightControl || false;
		this.contrastControl = config.contrastControl || false;
		this.colorControl = config.colorControl || false;
		this.pictureModeControl = config.pictureModeControl || false;
		this.pictureModes = config.pictureModes || [];
		this.turnScreenOnOff = config.turnScreenOnOff || false;
		this.enableMqtt = config.enableMqtt || false;
		this.mqttHost = config.mqttHost;
		this.mqttPort = config.mqttPort || 1883;
		this.mqttPrefix = config.mqttPrefix;
		this.mqttAuth = config.mqttAuth || false;
		this.mqttUser = config.mqttUser;
		this.mqttPasswd = config.mqttPasswd;
		this.mqttDebug = config.mqttDebug || false;

		//add configured inputs to the default inputs
		const inputsArr = new Array();
		const defaultInputsCount = DEFAULT_INPUTS.length;
		for (let i = 0; i < defaultInputsCount; i++) {
			inputsArr.push(DEFAULT_INPUTS[i]);
		}
		const inputsCount = this.inputs.length;
		for (let j = 0; j < inputsCount; j++) {
			inputsArr.push(this.inputs[j]);
		}
		this.inputs = inputsArr;

		//device info
		this.manufacturer = 'LG Electronics';
		this.modelName = 'Model Name';
		this.serialNumber = 'Serial Number';
		this.firmwareRevision = 'Firmware Revision';
		this.productName = 'webOS';
		this.webOS = 2;

		//setup variables
		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();

		this.powerState = false;
		this.pixelRefresh = false;
		this.screenState = false;
		this.appId = '';
		this.volume = 0;
		this.muteState = true;
		this.audioOutput = '';
		this.invertMediaState = false;

		this.inputIdentifier = 0;
		this.channelName = '';
		this.channelNumber = 0;

		this.brightness = 0;
		this.backlight = 0;
		this.contrast = 0;
		this.color = 0;
		this.pictureMode = 3;

		this.prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		this.keyFile = `${this.prefDir}/key_${this.host.split('.').join('')}`;
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;
		this.channelsFile = `${this.prefDir}/channels_${this.host.split('.').join('')}`;

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) == false) {
			fs.mkdirSync(this.prefDir);
		}
		if (fs.existsSync(this.keyFile) == false) {
			fs.writeFileSync(this.keyFile, '');
		}
		if (fs.existsSync(this.devInfoFile) == false) {
			const obj = {
				'manufacturer': this.manufacturer,
				'modelName': this.modelName,
				'serialNumber': this.serialNumber,
				'firmwareRevision': this.firmwareRevision,
				'webOS': this.webOS
			};
			const devInfo = JSON.stringify(obj, null, 2);
			fs.writeFileSync(this.devInfoFile, devInfo);
		}
		if (fs.existsSync(this.inputsFile) == false) {
			fs.writeFileSync(this.inputsFile, '');
		}
		if (fs.existsSync(this.inputsNamesFile) == false) {
			fs.writeFileSync(this.inputsNamesFile, '');
		}
		if (fs.existsSync(this.inputsTargetVisibilityFile) == false) {
			fs.writeFileSync(this.inputsTargetVisibilityFile, '');
		}
		if (fs.existsSync(this.channelsFile) == false) {
			fs.writeFileSync(this.channelsFile, '');
		}

		//mqtt client
		this.mqttClient = new mqttClient({
			enabled: this.enableMqtt,
			host: this.mqttHost,
			port: this.mqttPort,
			prefix: this.mqttPrefix,
			topic: this.name,
			auth: this.mqttAuth,
			user: this.mqttUser,
			passwd: this.mqttPasswd,
			debug: this.mqttDebug
		});

		this.mqttClient.on('connected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
			.on('error', (error) => {
				this.log(`Device: ${this.host} ${this.name}, ${error}`);
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

		//lg tv client
		const url = `ws://${this.host}:${WEBSOCKET_PORT}`;
		this.lgtv = new lgtv({
			url: url,
			keyFile: this.keyFile,
			debugLog: this.enableDebugMode,
			mqttEnabled: this.enableMqtt
		});

		this.lgtv.on('deviceInfo', async (modelName, productName, serialNumber, firmwareRevision, webOS) => {
				if (!this.disableLogDeviceInfo) {
					this.log(`-------- ${this.name} --------`);
					this.log(`Manufacturer: ${this.manufacturer}`);
					this.log(`Model: ${modelName}`);
					this.log(`System: ${productName}`);
					this.log(`Serialnr: ${serialNumber}`);
					this.log(`Firmware: ${firmwareRevision}`);
					this.log(`----------------------------------`);
				};

				try {
					const obj = {
						'manufacturer': this.manufacturer,
						'modelName': modelName,
						'serialNumber': serialNumber,
						'firmwareRevision': firmwareRevision,
						'webOS': webOS
					};
					const devInfo = JSON.stringify(obj, null, 2);
					const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, saved info: ${devInfo}`) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save info error: ${error}`);
				};

				this.modelName = modelName;
				this.productName = productName;
				this.serialNumber = serialNumber;
				this.firmwareRevision = firmwareRevision;
				this.webOS = webOS;
			})
			.on('channelList', async (channelList) => {
				const channelsArr = new Array();
				const channelsCount = channelList.length;
				for (let i = 0; i < channelsCount; i++) {
					const name = channelList[i].channelName;
					const reference = channelList[i].channelId;
					const number = channelList[i].channelNumber;
					const type = 'TUNER';
					const mode = 1;
					const channelsObj = {
						'name': name,
						'reference': reference,
						'number': number,
						'type': type,
						'mode': mode
					}
					channelsArr.push(channelsObj);
				};

				try {
					const obj = JSON.stringify(channelsArr, null, 2);
					const writeChannels = await fsPromises.writeFile(this.channelsFile, obj);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, saved channels list: ${obj}`) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save channels list error: ${error}`);
				};
			})
			.on('installedApps', async (installedApps) => {
				const inputsArr = new Array();
				const inputsCount = installedApps.length;
				for (let i = 0; i < inputsCount; i++) {
					const name = installedApps[i].title;
					const reference = installedApps[i].id;
					const type = 'APPLICATION';
					const mode = 0;
					const inputsObj = {
						'name': name,
						'reference': reference,
						'type': type,
						'mode': mode
					}
					inputsArr.push(inputsObj);
				};;
				try {
					const obj = JSON.stringify(inputsArr, null, 2)
					const writeInputs = await fsPromises.writeFile(this.inputsFile, obj);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, saved inputs/apps list: ${obj}`) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save inputs/apps error: ${error}`);
				};
			})
			.on('powerState', (power, pixelRefresh, screenState) => {

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, power);
					if (this.turnScreenOnOffService) {
						this.turnScreenOnOffService
							.updateCharacteristic(Characteristic.On, screenState);
						this.screenState = screenState;
					};

					this.powerState = power;
					this.pixelRefresh = pixelRefresh;
				};
			})
			.on('currentApp', (reference) => {
				const inputIdentifier = (this.inputsReference.indexOf(reference) >= 0) ? this.inputsReference.indexOf(reference) : this.inputIdentifier;

				if (this.televisionService && (inputIdentifier != this.inputIdentifier)) {
					this.televisionService
						.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
					this.inputIdentifier = inputIdentifier;
				};

			})
			.on('audioState', (volume, mute, audioOutput) => {
				volume = this.powerState ? volume : 0;
				mute = this.powerState ? mute : true;

				if (this.speakerService) {
					this.speakerService
						.updateCharacteristic(Characteristic.Volume, volume)
						.updateCharacteristic(Characteristic.Mute, mute);
					if (this.volumeService && this.volumeControl == 1) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					};
					if (this.volumeServiceFan && this.volumeControl == 2) {
						this.volumeServiceFan
							.updateCharacteristic(Characteristic.RotationSpeed, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					};
					this.volume = volume;
					this.muteState = mute;
					this.audioOutput = audioOutput;
				};
			})
			.on('currentChannel', (channelName, channelNumber, channelId) => {
				const inputIdentifier = (this.inputsReference.indexOf(channelId) >= 0) ? this.inputsReference.indexOf(channelId) : this.inputIdentifier;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

					if (this.setStartInput) {
						setTimeout(() => {
							this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, this.startInputIdentifier);
							this.setStartInput = false;
						}, 1200);
					}

					this.channelName = channelName;
					this.channelNumber = channelNumber;
					this.inputIdentifier = inputIdentifier;
				}
			})
			.on('pictureSettings', (brightness, backlight, contrast, color, pictureMode, power) => {

				if (this.brightnessService) {
					this.brightnessService
						.updateCharacteristic(Characteristic.On, power)
						.updateCharacteristic(Characteristic.Brightness, brightness);
					this.brightness = brightness;
				};
				if (this.backlightService) {
					this.backlightService
						.updateCharacteristic(Characteristic.On, power)
						.updateCharacteristic(Characteristic.Brightness, backlight);
					this.backlight = backlight;
				};
				if (this.contrastService) {
					this.contrastService
						.updateCharacteristic(Characteristic.On, power)
						.updateCharacteristic(Characteristic.Brightness, contrast);
					this.contrast = contrast;
				};
				if (this.colorService) {
					this.colorService
						.updateCharacteristic(Characteristic.On, power)
						.updateCharacteristic(Characteristic.Brightness, color);
					this.color = color;
				};
				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.PictureMode, pictureMode);
					this.pictureMode = pictureMode;
				};
			})
			.on('error', (error) => {
				this.log(`Device: ${this.host} ${this.name}, ${error}`);
			})
			.on('debug', (message) => {
				this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
			})
			.on('message', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
			.on('mqtt', (topic, message) => {
				this.mqttClient.send(topic, message);
			});

		this.checkPairingKey();
	};

	async checkPairingKey() {
		try {
			const savedPairingKey = await fsPromises.readFile(this.keyFile);
			const pairingKey = savedPairingKey.toString();
			const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, debug: Pairing Key: ${pairingKey}`) : false;

			const startPrepareAccessory = (pairingKey.length > 0) ? this.prepareAccessory() : this.reCheckPairingKey();
		} catch (error) {
			this.emit('error', `Read pairing key error: ${error}`);
			this.reCheckPairingKey()
		};
	};

	reCheckPairingKey() {
		const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, debug: Pairing Key not found, check again in 10s.`) : false;
		setTimeout(() => {
			this.checkPairingKey();
		}, 10000);
	};

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(this.mac);
		const accessoryCategory = Categories.TELEVISION;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');
		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = JSON.parse(readDevInfo);
			const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved Info: ${JSON.stringify(devInfo, null, 2)}`) : false;

			const manufacturer = devInfo.manufacturer;
			const modelName = devInfo.modelName || this.modelName;
			const serialNumber = devInfo.serialNumber || this.serialNumber;
			const firmwareRevision = devInfo.firmwareRevision || this.firmwareRevision;
			const webOS = devInfo.webOS;

			accessory.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.Manufacturer, manufacturer)
				.setCharacteristic(Characteristic.Model, modelName)
				.setCharacteristic(Characteristic.SerialNumber, serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

			this.webOS = webOS;
		} catch (error) {
			this.log.error(`Device: ${this.host} ${accessoryName}, prepare informationn service error: ${error}`);
		};

		//Prepare television service 
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.powerState;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Power state: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				const setPowerOn = (!this.powerState && state) ? wol(this.mac, {
					address: '255.255.255.255',
					packets: 3,
					interval: 100,
					port: 9
				}) : false;
				try {
					const setPowerOff = (this.powerState && !state) ? await this.lgtv.send('request', API_URL.TurnOff) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power state: ${state ? 'ON' : 'OFF'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Power state error:  ${error}`);
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const inputMode = this.inputsMode[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, ${inputMode == 0 ? 'Input' : 'Channel'}, name: ${inputName}, reference: ${inputReference}`);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputName = this.inputsName[inputIdentifier];
				const inputMode = this.inputsMode[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const inputId = (inputMode == 0) ? inputReference : 'com.webos.app.livetv';
				const payload = {
					id: inputId
				}
				const payload1 = {
					channelId: inputReference
				}
				try {
					const setInput = (this.powerState && inputReference != undefined) ? await this.lgtv.send('request', API_URL.LaunchApp, payload) : false
					const setChannel = (this.powerState && inputReference != undefined && inputMode == 1) ? await this.lgtv.send('request', API_URL.OpenChannel, payload1) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set ${inputMode == 0 ? 'Input' : 'Channel'}, name: ${inputName}, reference: ${inputReference}`);
					this.inputIdentifier = inputIdentifier;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set ${inputMode == 0 ? 'Input' : 'Channel'} error: ${error}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
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
				}
				try {
					const setCommand = (this.powerState && this.lgtv.inputSocket) ? this.lgtv.inputSocket.send('button', payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Remote Key, command: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Remote Key error: ${error}`);
				};
			});

		//optional television characteristics
		this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
			.onGet(async () => {
				const state = 0;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Closed captions: ${state}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Closed captions: ${state}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName} set Closed captions error: ${error}`);
				};
			});

		//this.televisionService.getCharacteristic(Characteristic.DisplayOrder)
		//	.onGet(async () => {
		//		const tag = 0x02;
		//		const length = 0x01;
		//		const value = 0x01;
		//		const data = [tag, length, value];
		//		const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get display order successful: ${data}`);
		//		return data;
		//	})
		//	.onSet(async (data) => {
		//		const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set display order successful: %s.', this.host, accessoryName, data);
		//	});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				const value = 2;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Media state: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP
				const value = 2;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Target Media state: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				return value;
			})
			.onSet(async (value) => {
				const newMediaState = [API_URL.SetMediaPlay, API_URL.SetMediaPause, API_URL.SetMediaStop][value]
				try {
					await this.lgtv.send('request', newMediaState);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Media state: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				} catch (error) {
					this.log.error(`Device: $ {this.host} ${accessoryName} % s, set Media state error: ${error}`);
				};
			});

		if (this.webOS >= 4 && this.pictureModeControl) {
			this.televisionService.getCharacteristic(Characteristic.PictureMode)
				.onGet(async () => {
					const value = 3;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Picture mode: ${value}`);
					return value;
				})
				.onSet(async (command) => {
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

					try {
						const payload = {
							category: 'picture',
							settings: {
								'pictureMode': command
							}
						};
						const setPistureMode = this.powerState ? await this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Picture mode: ${command}`);
					} catch (error) {
						this.log.errorthis.log(`Device: ${this.host} ${accessoryName}, set Picture mode error: ${error}`);
					};
				});
		}

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				switch (command) {
					case Characteristic.PowerModeSelection.SHOW:
						command = 'MENU';
						break;
					case Characteristic.PowerModeSelection.HIDE:
						command = 'BACK';
						break;
				};

				try {
					const payload = {
						name: command
					};
					const setCommand = (this.powerState && this.lgtv.inputSocket) ? this.lgtv.inputSocket.send('button', payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power Mode Selection: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Power Mode Selection error: ${error}`);
				};
			});
		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				switch (command) {
					case Characteristic.VolumeSelector.INCREMENT:
						command = 'VOLUMEUP';
						break;
					case Characteristic.VolumeSelector.DECREMENT:
						command = 'VOLUMEDOWN';
						break;
				};

				try {
					const payload = {
						name: command
					};
					const setCommand = (this.powerState && this.lgtv.inputSocket) ? this.lgtv.inputSocket.send('button', payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume Selector: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName} , set Volume Selector error: ${error}`);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Volume: ${volume}`);
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.volume;
				};

				try {
					const payload = {
						volume: volume,
						soundOutput: this.soundOutput
					};
					const setVolume = this.powerState ? await this.lgtv.send('request', API_URL.SetVolume, payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume: ${volume}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName} , set Volume error: ${error}`);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.muteState;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Mute: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const payload = {
						mute: state
					};
					const toggleMute = (this.powerState && state != this.muteState) ? await this.lgtv.send('request', API_URL.SetMute, payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Mute: ${state ? 'ON' : 'OFF'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName} , set Mute error: ${error}`);
				};
			});
		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
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
						const state = !this.muteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeService);
			}

			if (this.volumeControl == 2) {
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
						const state = !this.muteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeServiceFan);
			}
		}

		if (this.webOS >= 4) {
			//Backlight
			if (this.backlightControl) {
				this.log.debug('prepareBacklightService');
				this.backlightService = new Service.Lightbulb(`${accessoryName} Backlight`, 'Backlight');
				this.backlightService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState;
						return state;
					})
					.onSet(async (state) => {});
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
							const setBackglight = this.powerState ? await this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Backlight: ${value}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Backlight error: ${error}`);
						};
					});
				accessory.addService(this.backlightService);
			}

			//Brightness
			if (this.brightnessControl) {
				this.log.debug('prepareBrightnessService');
				this.brightnessService = new Service.Lightbulb(`${accessoryName} Brightness`, 'Brightness');
				this.brightnessService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState;
						return state;
					})
					.onSet(async (state) => {})
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
							const setBrightness = this.powerState ? await this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Brightness: ${value}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Brightness error: ${error}`);
						};
					});
				accessory.addService(this.brightnessService);
			}

			//Contrast
			if (this.contrastControl) {
				this.log.debug('prepareContrastService');
				this.contrastService = new Service.Lightbulb(`${accessoryName} Contrast`, 'Contrast');
				this.contrastService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState;
						return state;
					})
					.onSet(async (state) => {});
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
							const setContrast = this.powerState ? await this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Contrast: ${value}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Contrast error: ${error}`);
						};
					});
				accessory.addService(this.contrastService);
			}

			//Color
			if (this.colorControl) {
				this.log.debug('prepareColorService');
				this.colorService = new Service.Lightbulb(`${accessoryName} Color`, 'Color');
				this.colorService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState;
						return state;
					})
					.onSet(async (state) => {});
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
							const setColor = this.powerState ? await this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Color: ${value}`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set Color error: ${error}`);
						};
					});
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

					this.pictureModeService = new Service.Switch(`${accessoryName} ${pictureModeName}`, `Picture Mode ${i}`);
					this.pictureModeService.getCharacteristic(Characteristic.On)
						.onGet(async () => {
							const state = false;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Picture mode: ${state}`);
							return state;
						})
						.onSet(async (state) => {
							try {
								const payload = {
									'dimension': {
										'pictureMode': pictureModeReference
									},
									'settings': {
										'brightness': this.brightness,
										'contrast': this.contrast,
									}
								};
								const setPictureMode = (state && this.powerState) ? await this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
								const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Picture mode: ${pictureModeName}`);
								this.pictureModeService.updateCharacteristic(Characteristic.On, false);
							} catch (error) {
								this.log.error(`Device: ${this.host} ${accessoryName}, set Picture Mode error: ${error}`);
								this.pictureModeService.updateCharacteristic(Characteristic.On, false);
							};
						});

					accessory.addService(this.pictureModeService);
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
							const turnScreenOnOff = this.powerState ? state ? await this.lgtv.send('request', API_URL.TurnOnScreen) : await this.lgtv.send('request', API_URL.TurnOffScreen) : false;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, turn screen ${state ? 'ON' : 'OFF'}.`);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, turn screen ${state ? 'ON' : 'OFF'}, error: ${error}`);
						};
					});
				accessory.addService(this.turnScreenOnOffService);
			};
		}

		//Prepare inputs service
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved Inpits: ${JSON.stringify(savedInputs, null, 2)}`) : false;

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved Inputs Names: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

		const savedTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved Target Visibility States: ${JSON.stringify(savedTargetVisibility, null, 2)}`) : false;

		const savedChannels = ((fs.readFileSync(this.channelsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.channelsFile)) : [];
		const debug3 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved Channels: ${JSON.stringify(savedChannels, null, 2)}`) : false;

		//check available inputs and filter custom unnecessary inputs
		const allInputs = (this.getInputsFromDevice && savedInputs.length > 0) ? savedInputs : this.inputs;
		const inputsArr = new Array();
		const allInputsCount = allInputs.length;
		for (let i = 0; i < allInputsCount; i++) {
			const reference = allInputs[i].reference;
			const filterApp = reference.substr(0, 20) != 'com.webos.exampleapp';
			const filterApp1 = reference.substr(0, 17) != 'com.webos.app.acr';
			const filterApp2 = reference.substr(0, 22) != 'com.webos.app.livezoom';
			const filterApp3 = reference.substr(0, 28) != 'com.webos.app.livemenuplayer';
			const filterApp4 = reference.substr(0, 22) != 'com.webos.app.twinzoom';
			const filterApp5 = reference.substr(0, 26) != 'com.webos.app.twinlivezoom';
			const filterApp6 = reference != 'com.webos.app.softwareupdate';
			const filterApp7 = reference != 'google.assistant';
			const push = (this.getInputsFromDevice && this.filterSystemApps) ? (filterApp && filterApp1 && filterApp2 && filterApp3 && filterApp4 && filterApp5 && filterApp6 && filterApp7) ? inputsArr.push(allInputs[i]) : false : inputsArr.push(allInputs[i]);
		}

		//check available inputs and possible inputs count (max 94)
		const inputs = inputsArr;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount < 94) ? inputsCount : 94;
		for (let j = 0; j < maxInputsCount; j++) {

			//get input reference
			const inputReference = (inputs[j].reference != undefined) ? inputs[j].reference : undefined;

			//get input name		
			const inputName = (savedInputsNames[inputReference] != undefined) ? savedInputsNames[inputReference] : inputs[j].name;

			//get input type
			const inputType = (inputs[j].type != undefined) ? INPUT_SOURCE_TYPES.indexOf(inputs[j].type) : 10;

			//get input mode
			const inputMode = (inputs[j].mode != undefined) ? inputs[j].mode : 0;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = (savedTargetVisibility[inputReference] != undefined) ? savedTargetVisibility[inputReference] : 0;
			const targetVisibility = currentVisibility;

			const inputService = new Service.InputSource(inputName, `Input ${j}`);
			inputService
				.setCharacteristic(Characteristic.Identifier, j)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, isConfigured)
				.setCharacteristic(Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)
				.setCharacteristic(Characteristic.TargetVisibilityState, targetVisibility);

			inputService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onSet(async (name) => {
					const nameIdentifier = (inputReference != undefined) ? inputReference : false;
					let newName = savedInputsNames;
					newName[nameIdentifier] = name;
					const newCustomName = JSON.stringify(newName);
					try {
						const writeNewCustomName = (nameIdentifier != false) ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, sawed new ${inputMode == 0 ? 'Input' : 'Channel'}, Name: ${newCustomName}, Reference: ${inputReference}`);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, save new ${inputMode == 0 ? 'Input' : 'Channel'} name error: ${error}`);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					const targetVisibilityIdentifier = (inputReference != undefined) ? inputReference : false;
					let newState = savedTargetVisibility;
					newState[targetVisibilityIdentifier] = state;
					const newTargetVisibility = JSON.stringify(newState);
					try {
						const writeNewTargetVisibility = (targetVisibilityIdentifier != false) ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, saved new ${inputMode == 0 ? 'Input' : 'Channel'}: ${inputName}, Visibility: ${state ? 'HIDEN' : 'SHOWN'}`);
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, save new ${inputMode == 0 ? 'Input' : 'Channel'} Visibility error: ${error}`);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		}

		//Prepare inputs button services
		//check available buttons and possible buttons count (max 94)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const availableButtonshCount = 94 - maxInputsCount;
		const maxButtonsCount = (availableButtonshCount > 0) ? (availableButtonshCount > buttonsCount) ? buttonsCount : availableButtonshCount : 0;
		if (maxButtonsCount > 0) {
			this.log.debug('prepareInputsButtonService');
			for (let i = 0; i < maxButtonsCount; i++) {
				//get button mode
				const buttonMode = buttons[i].mode;

				//get button reference
				const buttonReference = buttons[i].reference;

				//get button command
				const buttonCommand = buttons[i].command;

				//get button name
				const buttonName = (buttons[i].name != undefined) ? buttons[i].name : [buttonReference, buttonReference, buttonCommand][buttonMode];

				//get button display type
				const buttonDisplayType = (buttons[i].displayType != undefined) ? buttons[i].displayType : 0;

				const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
				const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
				buttonService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = false;
						return state;
					})
					.onSet(async (state) => {
						const appId = [buttonReference, 'com.webos.app.livetv', buttonCommand][buttonMode];
						const payload = {
							id: appId
						}
						const payload1 = {
							channelId: buttonReference
						}
						const payload2 = {
							name: buttonCommand
						}
						try {
							const setInput = (state && this.powerState && buttonMode <= 1 && appId != this.appId) ? await this.lgtv.send('request', API_URL.LaunchApp, payload) : false;
							const setChannel = (state && this.powerState && buttonMode == 1) ? await this.lgtv.send('request', API_URL.OpenChannel, payload1) : false;
							const setCommand = (state && this.powerState && buttonMode == 2 && this.lgtv.inputSocket) ? this.lgtv.inputSocket.send('button', payload2) : false;
							const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set ${['Input', 'Channel', 'Command'][buttonMode]} name: ${buttonName}, reference: ${[buttonReference, buttonReference, buttonCommand][buttonMode]}`);
							buttonService.updateCharacteristic(Characteristic.On, false);

							this.appId = appId;
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, set ${['Input', 'Channel', 'Command'][buttonMode]} error: ${error}`);
							buttonService.updateCharacteristic(Characteristic.On, false);
						};
					});
				accessory.addService(buttonService);
			};
		};

		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug4 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, published as external accessory.`) : false;
	};
};