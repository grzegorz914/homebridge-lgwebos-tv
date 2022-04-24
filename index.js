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
					this.log.warn('Device Name, Host or Mac Missing');
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
		this.pictureMode = '';
		this.appId = '';

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
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('error', (error) => {
				this.log('Device: %s %s, %s', this.host, this.name, error);
			})
			.on('debug', (message) => {
				this.log('Device: %s %s, debug: %s', this.host, this.name, message);
			})
			.on('message', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('disconnected', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			});

		//lg tv client
		const url = `ws://${this.host}:${WEBSOCKET_PORT}`;
		this.lgtv = new lgtv({
			url: url,
			keyFile: this.keyFile
		});

		this.lgtv.on('connect', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('socketConnect', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('error', (error) => {
				this.log('Device: %s %s, %s', this.host, this.name, error);
			})
			.on('debug', (message) => {
				const debug = this.enableDebugMode ? this.log('Device: %s %s, debug: %s', this.host, this.name, message) : false;
			})
			.on('message', (message) => {
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('deviceInfo', async (modelName, productName, serialNumber, firmwareRevision, webOS) => {
				if (!this.disableLogDeviceInfo) {
					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', this.manufacturer);
					this.log('Model: %s', modelName);
					this.log('System: %s', productName);
					this.log('Serialnr: %s', serialNumber);
					this.log('Firmware: %s', firmwareRevision);
					this.log('----------------------------------');
				}

				const obj = {
					'manufacturer': this.manufacturer,
					'modelName': modelName,
					'serialNumber': serialNumber,
					'firmwareRevision': firmwareRevision,
					'webOS': webOS
				};
				const devInfo = JSON.stringify(obj, null, 2);
				try {
					const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);
					const debug = this.enableDebugMode ? this.log('Device: %s %s, saved Device Info successful: %s', this.host, this.name, devInfo) : false;
				} catch (error) {
					this.log.error('Device: %s %s, save Device Info error: %s', this.host, accessoryName, error);
				};

				this.modelName = modelName;
				this.productName = productName;
				this.serialNumber = serialNumber;
				this.firmwareRevision = firmwareRevision;
				this.webOS = webOS;
			})
			.on('installedApps', async (installedApps) => {
				if (installedApps.apps != undefined) {
					const inputsArr = new Array();
					const inputsData = installedApps.apps;
					const inputsCount = inputsData.length;
					for (let i = 0; i < inputsCount; i++) {
						const name = inputsData[i].title;
						const reference = inputsData[i].id;
						const type = 'APPLICATION';
						const mode = 0;
						const inputsObj = {
							'name': name,
							'reference': reference,
							'type': type,
							'mode': mode
						}
						inputsArr.push(inputsObj);
					};
					const obj = JSON.stringify(inputsArr, null, 2);
					try {
						const writeInputs = await fsPromises.writeFile(this.inputsFile, obj);
						const debug = this.enableDebugMode ? this.log('Device: %s %s, saved inputs/apps list: %s', this.host, this.name, obj) : false;
					} catch (error) {
						this.log.error('Device: %s %s, save inputs/apps error: %s', this.host, accessoryName, error);
					};
				};
			})
			.on('channelList', async (channelList) => {
				if (channelList.channelList != undefined) {
					const channelsArr = new Array();
					const channelsData = channelList.channelList;
					const channelsCount = channelsData.length;
					for (let i = 0; i < channelsCount; i++) {
						const name = channelsData[i].channelName;
						const reference = channelsData[i].channelId;
						const number = channelsData[i].channelNumber;
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
					}
					const obj = JSON.stringify(channelsArr, null, 2);
					try {
						const writeChannels = await fsPromises.writeFile(this.channelsFile, obj);
						const debug = this.enableDebugMode ? this.log('Device: %s %s, write channels list: %s', this.host, this.name, obj) : false;
					} catch (error) {
						this.log.error('Device: %s %s, save inputs/apps error: %s', this.host, accessoryName, error);
					};
				}
			})
			.on('powerState', (isConnected, power, pixelRefresh, screenState) => {
				const powerState = (isConnected && power);

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, powerState);
					if (this.brightnessService) {
						this.brightnessService
							.updateCharacteristic(Characteristic.On, powerState);
					}
					if (this.backlightService) {
						this.backlightService
							.updateCharacteristic(Characteristic.On, powerState);
					}
					if (this.contrastService) {
						this.contrastService
							.updateCharacteristic(Characteristic.On, powerState);
					}
					if (this.colorService) {
						this.colorService
							.updateCharacteristic(Characteristic.On, powerState);
					}
					if (this.turnScreenOnOffService) {
						this.turnScreenOnOffService
							.updateCharacteristic(Characteristic.On, screenState);
					}
				};

				this.powerState = power;
				this.pixelRefresh = pixelRefresh;
				this.screenState = screenState;
			})
			.on('currentApp', (reference) => {
				const inputIdentifier = (this.inputsReference.indexOf(reference) >= 0) ? this.inputsReference.indexOf(reference) : this.inputIdentifier;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}

				this.inputIdentifier = inputIdentifier;
			})
			.on('currentChannel', (channelName, channelNumber, channelReference) => {
				const inputIdentifier = (this.inputsReference.indexOf(channelReference) >= 0) ? this.inputsReference.indexOf(channelReference) : this.inputIdentifier;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

					if (this.setStartInput) {
						setTimeout(() => {
							this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, this.startInputIdentifier);
							this.setStartInput = false;
						}, 1200);
					}
				}

				this.channelName = channelName;
				this.channelNumber = channelNumber;
				this.inputIdentifier = inputIdentifier;
			})
			.on('audioState', (volume, mute, audioOutput) => {

				volume = (volume != -1) ? volume : this.volume;
				if (this.speakerService) {
					this.speakerService
						.updateCharacteristic(Characteristic.Volume, volume)
						.updateCharacteristic(Characteristic.Mute, mute);
					if (this.volumeService && this.volumeControl == 1) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					}
					if (this.volumeServiceFan && this.volumeControl == 2) {
						this.volumeServiceFan
							.updateCharacteristic(Characteristic.RotationSpeed, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					}
				};

				this.volume = volume;
				this.muteState = mute;
				this.audioOutput = audioOutput;
			})
			.on('pictureSettings', (brightness, backlight, contrast, color, pictureMode) => {

				if (this.brightnessService) {
					this.brightnessService
						.updateCharacteristic(Characteristic.Brightness, brightness);
				}
				if (this.backlightService) {
					this.backlightService
						.updateCharacteristic(Characteristic.Brightness, backlight);
				}
				if (this.contrastService) {
					this.contrastService
						.updateCharacteristic(Characteristic.Brightness, contrast);
				}
				if (this.colorService) {
					this.colorService
						.updateCharacteristic(Characteristic.Brightness, color);
				}
				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.PictureMode, pictureMode);
				}

				this.brightness = brightness;
				this.backlight = backlight;
				this.contrast = contrast;
				this.color = color;
				this.pictureMode = pictureMode;
			})
			.on('disconnect', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('mqtt', (topic, message) => {
				this.mqttClient.send(topic, message);
			})
			.on('socketDisconnect', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			});

		//start prepare accessory
		this.prepareAccessory();
	};

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(this.mac);
		const accessoryCategory = Categories.TELEVISION;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
		accessory.context.device = this.config.device;

		//Prepare information service
		this.log.debug('prepareInformationService');
		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = JSON.parse(readDevInfo);
			const debug = this.enableDebugMode ? this.log('Device: %s %s, read devInfo: %s', this.host, accessoryName, devInfo) : false;

			const manufacturer = devInfo.manufacturer;
			const modelName = devInfo.modelName;
			const serialNumber = devInfo.serialNumber;
			const firmwareRevision = devInfo.firmwareRevision;
			const webOS = devInfo.webOS;

			accessory.removeService(accessory.getService(Service.AccessoryInformation));
			const informationService = new Service.AccessoryInformation(accessoryName)
				.setCharacteristic(Characteristic.Name, accessoryName)
				.setCharacteristic(Characteristic.Manufacturer, manufacturer)
				.setCharacteristic(Characteristic.Model, modelName)
				.setCharacteristic(Characteristic.SerialNumber, serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
			accessory.addService(informationService);

			this.webOS = webOS;
		} catch (error) {
			this.log.error('Device: %s %s, prepareInformationService error: %s', this.host, accessoryName, error);
		};

		//Prepare television service 
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.powerState;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Power state successfull, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				const setPowerOn = (state && !this.powerState) ? wol(this.mac, {
					address: '255.255.255.255',
					packets: 3,
					interval: 100,
					port: 9
				}) : false;
				try {
					const setPowerOff = (!state && this.powerState) ? this.lgtv.send('request', API_URL.TurnOff) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				} catch (error) {
					this.log.error('Device: %s %s, set Power state error: %s', this.host, accessoryName, error);
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const inputMode = this.inputsMode[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get %s successful, name: %s, reference %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', inputName, inputReference);
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
					const setInput = (this.powerState && inputReference != undefined) ? this.lgtv.send('request', API_URL.LaunchApp, payload) : false
					const setChannel = (this.powerState && inputReference != undefined && inputMode == 1) ? this.lgtv.send('request', API_URL.OpenChannel, payload1) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', inputName, inputReference);
					this.inputIdentifier = inputIdentifier;
				} catch (error) {
					this.log.error('Device: %s %s, set %s error: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', error);
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
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Remote Key successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s %s, set Remote Key error: %s', this.host, accessoryName, error);
				};
			});

		//optional television characteristics
		this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
			.onGet(async () => {
				const state = 0;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Closed captions successful: %s', this.host, accessoryName, state);
				return state;
			})
			.onSet(async (state) => {
				try {
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Closed captions successful: %s', this.host, accessoryName, state);
				} catch (error) {
					this.log.error('Device: %s %s %s, set Closed captions error: %s', this.host, accessoryName, error);
				};
			});

		//this.televisionService.getCharacteristic(Characteristic.DisplayOrder)
		//	.onGet(async () => {
		//		const tag = 0x02;
		//		const length = 0x01;
		//		const value = 0x01;
		//		const data = [tag, length, value];
		//		const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get display order successful: %s %', this.host, accessoryName, data);
		//		return data;
		//	})
		//	.onSet(async (data) => {
		//		const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set display order successful: %s.', this.host, accessoryName, data);
		//	});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				const value = 2;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP
				const value = 2;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Target Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				return value;
			})
			.onSet(async (value) => {
				const newMediaState = [API_URL.SetMediaPlay, API_URL.SetMediaPause, API_URL.SetMediaStop][value]
				try {
					this.lgtv.send('request', newMediaState);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Media state successful, state: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				} catch (error) {
					this.log.error('Device: %s %s %s, set Media state error: %s', this.host, accessoryName, error);
				};
			});

		if (this.webOS >= 4 && this.pictureModeControl) {
			this.televisionService.getCharacteristic(Characteristic.PictureMode)
				.onGet(async () => {
					const value = 3;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Picture mode: %s', this.host, accessoryName, value);
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
					}
					const payload = {
						category: 'picture',
						settings: {
							'pictureMode': command
						}
					}
					try {
						const setPistureMode = this.powerState ? this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Picture mode successful, command: %s', this.host, accessoryName, command);
					} catch (error) {
						this.log.error('Device: %s %s %s, set Picture Mode error: %s', this.host, accessoryName, error);
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
				}
				const payload = {
					name: command
				}
				try {
					const setCommand = (this.powerState && this.lgtv.inputSocket) ? this.lgtv.inputSocket.send('button', payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s %s, set Power Mode Selection error: %s', this.host, accessoryName, error);
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
				}
				const payload = {
					name: command
				}
				try {
					const setCommand = (this.powerState && this.lgtv.inputSocket) ? this.lgtv.inputSocket.send('button', payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Volume Selector successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s %s, set Volume Selector error: %s', this.host, accessoryName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Volume level successful: %s', this.host, accessoryName, volume);
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.volume;
				}
				const payload = {
					soundOutput: this.soundOutput,
					volume: volume
				}
				try {
					const setVolume = this.powerState ? this.lgtv.send('request', API_URL.SetVolume, payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Volume successful: %s', this.host, accessoryName, volume);
				} catch (error) {
					this.log.error('Device: %s %s %s, set Volume error: %s', this.host, accessoryName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.muteState;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				const payload = {
					mute: state
				}
				try {
					const toggleMute = (this.powerState && state != this.muteState) ? this.lgtv.send('request', API_URL.SetMute, payload) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				} catch (error) {
					this.log.error('Device: %s %s %s, set Mute error: %s', this.host, accessoryName, error);
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
				this.backlightService.getCharacteristic(Characteristic.Brightness)
					.onGet(async () => {
						const value = this.backlight;
						return value;
					})
					.onSet(async (value) => {
						const payload = {
							'settings': {
								'backlight': value
							}
						}
						try {
							const setBackglight = this.powerState ? this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Backlight successful, value: %s', this.host, accessoryName, value, response);
						} catch (error) {
							this.log.error('Device: %s %s %s, set Backlight error: %s', this.host, accessoryName, error);
						};
					});
				this.backlightService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState;
						return state;
					})
					.onSet(async (state) => {});

				accessory.addService(this.backlightService);
			}

			//Brightness
			if (this.brightnessControl) {
				this.log.debug('prepareBrightnessService');
				this.brightnessService = new Service.Lightbulb(`${accessoryName} Brightness`, 'Brightness');
				this.brightnessService.getCharacteristic(Characteristic.Brightness)
					.onGet(async () => {
						const value = this.brightness;
						return value;
					})
					.onSet(async (value) => {
						const payload = {
							'settings': {
								'brightness': value
							}
						}
						try {
							const setBrightness = this.powerState ? this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Brightness successful, value: %s', this.host, accessoryName, value, response);
						} catch (error) {
							this.log.error('Device: %s %s %s, set Brightness error: %s', this.host, accessoryName, error);
						};
					});
				this.brightnessService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState;
						return state;
					})
					.onSet(async (state) => {});

				accessory.addService(this.brightnessService);
			}

			//Contrast
			if (this.contrastControl) {
				this.log.debug('prepareContrastService');
				this.contrastService = new Service.Lightbulb(`${accessoryName} Contrast`, 'Contrast');
				this.contrastService.getCharacteristic(Characteristic.Brightness)
					.onGet(async () => {
						const value = this.contrast;
						return value;
					})
					.onSet(async (value) => {
						const payload = {
							'settings': {
								'contrast': value
							}
						}
						try {
							const setContrast = this.powerState ? this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Contrast successful, value: %s', this.host, accessoryName, value);
						} catch (error) {
							this.log.error('Device: %s %s %s, set Contrast error: %s', this.host, accessoryName, error);
						};
					});
				this.contrastService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState;
						return state;
					})
					.onSet(async (state) => {});

				accessory.addService(this.contrastService);
			}

			//Color
			if (this.colorControl) {
				this.log.debug('prepareColorService');
				this.colorService = new Service.Lightbulb(`${accessoryName} Color`, 'Color');
				this.colorService.getCharacteristic(Characteristic.Brightness)
					.onGet(async () => {
						const value = this.color;
						return value;
					})
					.onSet(async (value) => {
						const payload = {
							'settings': {
								'color': value
							}
						}
						try {
							const setColor = this.powerState ? this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Color successful, value: %s', this.host, accessoryName, value);
						} catch (error) {
							this.log.error('Device: %s %s %s, set Color error: %s', this.host, accessoryName, error);
						};
					});
				this.colorService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState;
						return state;
					})
					.onSet(async (state) => {});

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
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Picture Mode successful: %s', this.host, accessoryName, state);
							return state;
						})
						.onSet(async (state) => {
							const payload = {
								'dimension': {
									'pictureMode': pictureModeReference
								},
								'settings': {
									'brightness': this.brightness,
									'contrast': this.contrast,
								}
							}
							try {
								const setPictureMode = (state && this.powerState) ? this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
								const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Picture Mode successful, Mode: %s', this.host, accessoryName, pictureModeName, response);
							} catch (error) {
								this.log.error('Device: %s %s %s, set Picture Mode error: %s', this.host, accessoryName, error);
							};
							setTimeout(() => {
								this.pictureModeService.updateCharacteristic(Characteristic.On, false);
							}, 250);
						});

					accessory.addService(this.pictureModeService);
				}
			}

			//turn screen ON/OFF
			if (this.turnScreenOnOff) {
				this.turnScreenOnOffService = new Service.Switch(`${accessoryName} Screen On/Off`, 'Screen On/Off');
				this.turnScreenOnOffService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.screenState;
						return state;
					})
					.onSet(async (state) => {
						try {
							const turnScreenOnOff = this.powerState ? state ? this.lgtv.send('request', API_URL.TurnOnScreen) : this.lgtv.send('request', API_URL.TurnOffScreen) : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, turn screen %s successful.', this.host, accessoryName, state ? 'ON' : 'OFF');
						} catch (error) {
							this.log.error('Device: %s %s, turn screen %s, error: %s', this.host, accessoryName, state ? 'ON' : 'OFF', error);
						};
					});

				accessory.addService(this.turnScreenOnOffService);
			};
		}

		//Prepare inputs service
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		const debug = this.enableDebugMode ? this.log('Device: %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, savedInputs) : false;

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log('Device: %s %s, read saved custom Inputs Names successful, names: %s', this.host, accessoryName, savedInputsNames) : false;

		const savedTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log('Device: %s %s, read saved Target Visibility successful, states %s', this.host, accessoryName, savedTargetVisibility) : false;

		const savedChannels = ((fs.readFileSync(this.channelsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.channelsFile)) : [];
		const debug3 = this.enableDebugMode ? this.log('Device: %s %s, read saved Channels successful, channels: %s', this.host, accessoryName, savedChannels) : false;

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
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, new %s name saved successful, name: %s reference: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', newCustomName, inputReference);
					} catch (error) {
						this.log.error('Device: %s %s, save new %s name error: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', error);
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
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, %s: %s, saved Target Visibility state: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', inputName, state ? 'HIDEN' : 'SHOWN');
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s, save new %s Target Visibility error: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', error);
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
							const setInput = (state && this.powerState && buttonMode <= 1 && appId != this.appId) ? this.lgtv.send('request', API_URL.LaunchApp, payload) : false;
							const setChannel = (state && this.powerState && buttonMode == 1) ? this.lgtv.send('request', API_URL.OpenChannel, payload1) : false;
							const setCommand = (state && this.powerState && buttonMode == 2 && this.lgtv.inputSocket) ? this.lgtv.inputSocket.send('button', payload2) : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, ['Input', 'Channel', 'Command'][buttonMode], buttonName, [buttonReference, buttonReference, buttonCommand][buttonMode]);
							this.appId = appId;
						} catch (error) {
							this.log.error('Device: %s %s, set %s error: %s', this.host, accessoryName, ['Input', 'Channel', 'Command'][buttonMode], error);
						};
						setTimeout(() => {
							buttonService.updateCharacteristic(Characteristic.On, false);
						}, 150);
					});

				accessory.addService(buttonService);
			};
		};

		const debug4 = this.enableDebugMode ? this.log('Device: %s %s, publishExternalAccessories.', this.host, accessoryName) : false;
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};