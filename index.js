'use strict';

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const lgtv = require('./src/lgwebos');
const wol = require('@mi-sec/wol');
const tcpp = require('tcp-ping');

const PLUGIN_NAME = 'homebridge-lgwebos-tv';
const PLATFORM_NAME = 'LgWebOsTv';

const WEBSOCKET_PORT = 3000;
const DEFAULT_INPUTS = [{
		'name': 'Undefined',
		'reference': 'undefined',
		'type': 'undefined',
		'mode': 'undefined'
	}, {
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

let Accessory, Characteristic, Service, Categories, AccessoryUUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	AccessoryUUID = api.hap.uuid;
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
				if (!device.name) {
					this.log.warn('Device Name Missing');
				} else {
					new lgwebosTvDevice(this.log, device, this.api);
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.log.debug('configurePlatformAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removePlatformAccessory');
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
		this.host = config.host || '';
		this.mac = config.mac || '';
		this.refreshInterval = config.refreshInterval || 5;
		this.disableLogInfo = config.disableLogInfo || false;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu || false;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
		this.filterSystemApps = config.filterSystemApps || false;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];

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
		this.manufacturer = config.manufacturer || 'LG Electronics';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.connectedToDevice = false;
		this.checkDeviceInfo = false;
		this.pointerInputSocket = null;

		this.inputsService = new Array();
		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();

		this.buttonsService = new Array();
		this.buttonsReference = new Array();
		this.buttonsName = new Array();

		this.powerState = false;
		this.volume = 0;
		this.muteState = false;
		this.mediaState = false;
		this.screenPixelRefresh = false;

		this.setStartInput = false;
		this.setStartInputIdentifier = 0;

		this.inputIdentifier = 0;
		this.inputReference = '';
		this.inputName = '';

		this.channelIdentifier = 0;
		this.channelReference = '';
		this.channelNumber = 0;
		this.channelName = '';

		this.productName = '';
		this.webOS = 0;

		this.brightness = 0;
		this.backlight = 0;
		this.contrast = 0;
		this.color = 0;
		this.pictureMode = 0;

		const prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		this.keyFile = prefDir + '/' + 'key_' + this.host.split('.').join('');
		this.devInfoFile = prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.inputsFile = prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.inputsNamesFile = prefDir + '/' + 'inputsNames_' + this.host.split('.').join('');
		this.targetVisibilityInputsFile = prefDir + '/' + 'targetVisibilityInputs_' + this.host.split('.').join('');
		this.channelsFile = prefDir + '/' + 'channels_' + this.host.split('.').join('');

		//check if the directory exists, if not then create it
		if (fs.existsSync(prefDir) == false) {
			fsPromises.mkdir(prefDir);
		}
		if (fs.existsSync(this.keyFile) == false) {
			fsPromises.writeFile(this.keyFile, '');
		}
		if (fs.existsSync(this.devInfoFile) == false) {
			fsPromises.writeFile(this.devInfoFile, '');
		}
		if (fs.existsSync(this.inputsFile) == false) {
			fsPromises.writeFile(this.inputsFile, '');
		}
		if (fs.existsSync(this.inputsNamesFile) == false) {
			fsPromises.writeFile(this.inputsNamesFile, '');
		}
		if (fs.existsSync(this.targetVisibilityInputsFile) == false) {
			fsPromises.writeFile(this.targetVisibilityInputsFile, '');
		}
		if (fs.existsSync(this.channelsFile) == false) {
			fsPromises.writeFile(this.channelsFile, '');
		}

		//Check device state
		setInterval(function () {
			if (!this.connectedToDevice) {
				tcpp.probe(this.host, WEBSOCKET_PORT, (err, online) => {
					if (online) {
						this.connectToTv();
					}
				});
			} else {
				if (this.pointerInputSocket == null) {
					this.connectToTvRcSocket();
				} else {
					if (this.checkDeviceInfo) {
						this.getDeviceInfo();
						this.getAndSaveInputs();
					}
				}
			}
		}.bind(this), this.refreshInterval * 1000);
		//start prepare accessory
		this.prepareAccessory();
	}

	connectToTv() {
		this.log.debug('Device: %s %s, connecting to TV', this.host, this.name);

		const url = 'ws://' + this.host + ':' + WEBSOCKET_PORT || 'ws://lgwebostv:3000';
		this.lgtv = new lgtv({
			url: url,
			timeout: 5000,
			reconnect: 5000,
			keyFile: this.keyFile
		});

		this.lgtv.connect(url);

		this.lgtv.on('connect', () => {
			this.log('Device: %s %s, connected.', this.host, this.name);
			this.connectedToDevice = true;
		});

		this.lgtv.on('error', (error) => {
			this.log.debug('Device: %s %s, connect error: %s', this.host, this.name, error);
		});

		this.lgtv.on('prompt', () => {
			this.log('Device: %s %s, waiting on confirmation...', this.host, this.name);
			this.powerState = false;
		});

		this.lgtv.on('connecting', () => {
			this.log.debug('Device: %s %s, connecting...', this.host, this.name);
			this.powerState = false;
		});

		this.lgtv.on('close', () => {
			this.log('Device: %s %s, disconnected.', this.host, this.name);
			this.connectedToDevice = false;
			this.pointerInputSocket = null;
			this.powerState = false;
			this.checkDeviceInfo = false;
			this.lgtv.disconnect();
		});
	}

	connectToTvRcSocket() {
		this.log.debug('Device: %s %s, connecting to TV RC Socket', this.host, this.name);
		this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
			if (error) {
				this.log.error('Device: %s %s, RC Socket connect error: %s', this.host, this.name, error);
				this.pointerInputSocket = null;
			} else {
				this.log.debug('Device: %s %s, RC Socket: %s.', this.host, this.name, sock);
				this.log('Device: %s %s, RC Socket connected.', this.host, this.name);
				this.pointerInputSocket = sock;
				this.checkDeviceInfo = true;
			}
		});
	}

	getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting Device Info.', this.host, this.name);
		this.lgtv.request('ssap://system/getSystemInfo', (error, response) => {
			if (error || response.errorCode) {
				this.log.debug('Device: %s %s, get System info error: %s', this.host, this.name, error);
				this.checkDeviceInfo = true;
			} else {
				this.log.debug('Device: %s %s, get System info response: %s', this.host, this.name, response);
				const modelName = response.modelName;

				this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, response1) => {
					if (error || response1.errorCode) {
						this.log.debug('Device: %s %s, get Software info error: %s', this.host, this.name, error);
						this.checkDeviceInfo = true;
					} else {
						this.log.debug('Device: %s %s, get System info response1: %s', this.host, this.name, response1);
						const productName = response1.product_name;
						const serialNumber = response1.device_id;
						const firmwareRevision = response1.major_ver + '.' + response1.minor_ver;

						const obj = Object.assign(response, response1);
						const devInfo = JSON.stringify(obj, null, 2);
						const writeDevInfo = fsPromises.writeFile(this.devInfoFile, devInfo);
						this.log.debug('Device: %s %s, saved Device Info successful: %s', this.host, this.name, devInfo);

						const manufacturer = this.manufacturer

						if (!this.disableLogInfo) {
							this.log('Device: %s %s, state: Online.', this.host, this.name);
						}
						this.log('-------- %s --------', this.name);
						this.log('Manufacturer: %s', manufacturer);
						this.log('Model: %s', modelName);
						this.log('System: %s', productName);
						this.log('Serialnr: %s', serialNumber);
						this.log('Firmware: %s', firmwareRevision);
						this.log('----------------------------------');

						this.manufacturer = manufacturer;
						this.modelName = modelName;
						this.productName = productName;
						this.serialNumber = serialNumber;
						this.firmwareRevision = firmwareRevision;
						this.webOS = productName.slice(8, -2);;

						const updateDeviceState = this.checkDeviceInfo ? this.updateDeviceState() : false;
						this.checkDeviceInfo = false;
					}
				});
			}
		});
	}

	getAndSaveInputs() {
		this.lgtv.request('ssap://com.webos.applicationManager/listApps', (error, response2) => {
			if (error || response2.errorCode) {
				this.log.debug('Device: %s %s, get apps list error: %s', this.host, this.name, error);
				this.checkDeviceInfo = true;
			} else {
				this.log.debug('Device: %s %s, get apps list response2: %s', this.host, this.name, response2);
				//save inputs to the file
				const getInputsFromDevice = this.getInputsFromDevice;
				const inputsArr = getInputsFromDevice ? new Array(DEFAULT_INPUTS[0]) : new Array();
				const inputsData = getInputsFromDevice ? response2.apps : this.inputs;
				const inputsCount = inputsData.length;
				for (let i = 0; i < inputsCount; i++) {
					const name = getInputsFromDevice ? inputsData[i].title : inputsData[i].name;
					const reference = getInputsFromDevice ? inputsData[i].id : inputsData[i].reference;
					const type = getInputsFromDevice ? 'APPLICATION' : inputsData[i].type;
					const mode = getInputsFromDevice ? 0 : inputsData[i].mode;
					const inputsObj = {
						'name': name,
						'reference': reference,
						'type': type,
						'mode': mode
					}
					inputsArr.push(inputsObj);
				}
				const obj = JSON.stringify(inputsArr, null, 2);
				const writeInputs = fsPromises.writeFile(this.inputsFile, obj);
				this.log.debug('Device: %s %s, write inputs list: %s', this.host, this.name, obj);
			}
		});
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, requesting device state.', this.host, this.name);
		try {
			const webOS = this.webOS;

			this.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Power state error: %s %s.', this.host, this.name, error, response);
				} else {
					this.log.debug('Device: %s %s, get current Power state data: %s', this.host, this.name, response);
					//screen On
					const prepareScreenOn = ((response.state == 'Suspend' && response.processing == 'Screen On') || (response.state == 'Screen Saver' && response.processing == 'Screen On') || (response.state == 'Active Standby' && response.processing == 'Screen On'));
					const stillScreenOn = (response.state == 'Active' && response.processing == 'Screen On');
					const screenOn = (response.state == 'Active');

					//screen Saver
					const prepareScreenSaver = (response.state == 'Active' && response.processing == 'Request Screen Saver');
					const screenSaver = (response.state == 'Screen Saver');

					//screen Off
					const prepareScreenOff = ((response.state == 'Active' && response.processing == 'Request Power Off') || (response.state == 'Active' && response.processing == 'Request Suspend') || (response.state == 'Active' && response.processing == 'Prepare Suspend') ||
							(response.state == 'Screen Saver' && response.processing == 'Request Power Off') || (response.state == 'Screen Saver' && response.processing == 'Request Suspend') || (response.state == 'Screen Saver' && response.processing == 'Prepare Suspend')) ||
						(response.state == 'Active Standby' && response.processing == 'Request Power Off') || (response.state == 'Active Standby' && response.processing == 'Request Suspend') || (response.state == 'Active Standby' && response.processing == 'Prepare Suspend');
					const screenOff = (response.state == 'Suspend');

					//pixelRefresh
					const prepareScreenPixelRefresh = ((response.state == 'Active' && response.processing == 'Request Active Standby') || (response.state == 'Screen Saver' && response.processing == 'Request Active Standby'));
					const screenPixelRefresh = (response.state == 'Active Standby');

					//powerState
					const pixelRefresh = (prepareScreenPixelRefresh || screenPixelRefresh);
					const powerOn = ((prepareScreenOn || stillScreenOn || screenOn || prepareScreenSaver || screenSaver) && !prepareScreenOff);
					const powerOff = ((prepareScreenOff || screenOff || pixelRefresh) && !prepareScreenOn);

					const powerState = (webOS >= 3) ? (powerOn && !powerOff) : this.connectedToDevice;

					if (this.televisionService) {
						if (powerState) {
							this.televisionService
								.updateCharacteristic(Characteristic.Active, true);
							if (this.speakerService) {
								this.speakerService
									.updateCharacteristic(Characteristic.Mute, false);
								if (this.volumeService && this.volumeControl == 1) {
									this.volumeService
										.updateCharacteristic(Characteristic.On, true);
								}
								if (this.volumeServiceFan && this.volumeControl == 2) {
									this.volumeServiceFan
										.updateCharacteristic(Characteristic.On, true);
								}
								this.muteState = false;
							}
						} else {
							this.televisionService
								.updateCharacteristic(Characteristic.Active, false);
							if (this.speakerService) {
								this.speakerService
									.updateCharacteristic(Characteristic.Mute, true);
								if (this.volumeService && this.volumeControl == 1) {
									this.volumeService
										.updateCharacteristic(Characteristic.On, false);
								}
								if (this.volumeServiceFan && this.volumeControl == 2) {
									this.volumeServiceFan
										.updateCharacteristic(Characteristic.On, false);
								}
								this.muteState = true;
							}
						}
					}
					this.powerState = powerState;
					this.screenPixelRefresh = pixelRefresh;
				}
			});

			this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current App error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, get current App state response: %s', this.host, this.name, response);
					const inputReference = response.appId;

					const currentInputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : 0;
					const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
					const inputName = this.inputsName[inputIdentifier];
					const inputMode = this.inputsMode[inputIdentifier];

					if (this.televisionService && inputMode == 0) {
						const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
							this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
						this.setStartInput = (currentInputIdentifier == inputIdentifier) ? false : true;

						this.inputReference = inputReference;
						this.inputIdentifier = inputIdentifier
						this.inputName = inputName;
						this.inputMode = inputMode;
					}
				}
			});

			this.lgtv.subscribe('ssap://tv/getCurrentChannel', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Channel and Name error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, get current Channel response: %s', this.host, this.name, response);

					const channelReference = response.channelId;
					const channelName = response.channelName;

					const currentInputIdentifier = (this.inputsReference.indexOf(channelReference) >= 0) ? this.inputsReference.indexOf(channelReference) : 0;
					const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
					const inputMode = this.inputsMode[inputIdentifier];

					if (this.televisionService && inputMode == 1) {
						const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
							this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
						this.setStartInput = (currentInputIdentifier == inputIdentifier) ? false : true;
						this.channelReference = channelReference;
						this.inputIdentifier = inputIdentifier
						this.channelName = channelName;
					}
				}
			});

			this.lgtv.subscribe('ssap://audio/getStatus', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Audio state error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, get current Audio state response: %s', this.host, this.name, response);

					const volume = response.volume;
					const muteState = this.powerState ? (response.mute == true) : true;

					if (this.speakerService) {
						this.speakerService
							.updateCharacteristic(Characteristic.Volume, volume)
							.updateCharacteristic(Characteristic.Mute, muteState);
						if (this.volumeService && this.volumeControl == 1) {
							this.volumeService
								.updateCharacteristic(Characteristic.Brightness, volume)
								.updateCharacteristic(Characteristic.On, !muteState);
						}
						if (this.volumeServiceFan && this.volumeControl == 2) {
							this.volumeServiceFan
								.updateCharacteristic(Characteristic.RotationSpeed, volume)
								.updateCharacteristic(Characteristic.On, !muteState);
						}
						this.volume = volume;
						this.muteState = muteState;
					}
				}
			});

			//check picture settings supported ab webOS 4.0
			if (webOS >= 4) {
				const params = {
					category: 'picture',
					keys: ['brightness', 'backlight', 'contrast', 'color']
				}
				this.lgtv.subscribe('ssap://settings/getSystemSettings', params, (error, response) => {
					if (error) {
						this.log.error('Device: %s %s, get system settings error: %s.', this.host, this.name, error);
					} else {
						this.log.debug('Device: %s %s, get system settings response: %s, response.settings: %s', this.host, this.name, response, response.settings);

						const brightness = response.settings.brightness;
						const backlight = response.settings.backlight;
						const contrast = response.settings.contrast;
						const color = response.settings.color;
						const pictureMode = 3;

						if (this.televisionService) {
							this.televisionService
								.updateCharacteristic(Characteristic.Brightness, brightness)
								.updateCharacteristic(Characteristic.PictureMode, pictureMode);
						}
						this.brightness = brightness;
						this.backlight = backlight;
						this.contrast = contrast;
						this.color = color;
						this.pictureMode = pictureMode;

					}
				});
			}
			this.checkDeviceInfo = false;
		} catch (error) {
			this.log.debug('Device: %s %s, update device state error: %s', this.host, this.name, error);
			this.checkDeviceInfo = true;
		};
	}

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = AccessoryUUID.generate(this.mac);
		const accessoryCategory = Categories.TELEVISION;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
		accessory.context.device = this.config.device;

		//Prepare information service
		this.log.debug('prepareInformationService');
		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = (readDevInfo != undefined) ? JSON.parse(readDevInfo) : {
				'manufacturer': this.manufacturer,
				'modelName': this.modelName,
				'device_id': this.serialNumber,
				'major_ver': 'Firmware',
				'minor_ver': 'Firmware'
			};
			this.log.debug('Device: %s %s, read devInfo: %s', this.host, accessoryName, devInfo)

			const manufacturer = this.manufacturer;
			const modelName = devInfo.modelName;
			const serialNumber = devInfo.device_id;
			const firmwareRevision = devInfo.major_ver + '.' + devInfo.minor_ver;

			accessory.removeService(accessory.getService(Service.AccessoryInformation));
			const informationService = new Service.AccessoryInformation(accessoryName)
				.setCharacteristic(Characteristic.Name, accessoryName)
				.setCharacteristic(Characteristic.Manufacturer, manufacturer)
				.setCharacteristic(Characteristic.Model, modelName)
				.setCharacteristic(Characteristic.SerialNumber, serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
			accessory.addService(informationService);
		} catch (error) {
			this.log.debug('Device: %s %s, prepareInformationService error: %s', this.host, accessoryName, error);
		};

		//Prepare TV service 
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				try {
					const state = this.webOS >= 3 ? this.powerState : this.connectedToDevice;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Power state successfull, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
					return state;
				} catch (error) {
					this.log.error('Device: %s %s, get Power state error: %s', this.host, accessoryName, error);
				};
			})
			.onSet(async (state) => {
				try {
					if (state && !this.powerState) {
						wol(this.mac, {
							address: '255.255.255.255',
							packets: 3,
							interval: 100,
							port: 9
						});
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Power state successful: %s', this.host, accessoryName, 'ON');
						}
					} else {
						if (!state && this.powerState) {
							this.lgtv.request('ssap://system/turnOff', (error, response) => {
								if (!this.disableLogInfo) {
									this.log('Device: %s %s, set Power state successful: %s', this.host, accessoryName, 'OFF');
								}
							});
						}
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputName = this.inputName;
				const inputReference = this.inputReference;
				const inputIdentifier = this.inputIdentifier;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputMode = this.inputsMode[inputIdentifier];
					const inputReference = (inputMode == 0) ? this.inputsReference[inputIdentifier] : "com.webos.app.livetv";
					const channelReference = this.inputsReference[inputIdentifier];
					const setInput = (inputReference != undefined) ? this.lgtv.request('ssap://system.launcher/launch', {
						id: inputReference
					}) : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
					}
					const setChannel = (channelReference != undefined && inputMode == 1) ? this.lgtv.request('ssap://tv/openChannel', {
						channelId: channelReference
					}) : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Channel successful: %s %s', this.host, accessoryName, inputName, channelReference);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
				this.setStartInputIdentifier = inputIdentifier;
				this.setStartInput = this.powerState ? false : true;
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				if (this.powerState) {
					switch (command) {
						case Characteristic.RemoteKey.REWIND:
							command = 'REWIND';
							break;
						case Characteristic.RemoteKey.FAST_FORWARD:
							command = 'FASTFORWARD';
							break;
						case Characteristic.RemoteKey.NEXT_TRACK:
							command = 'MENU';
							break;
						case Characteristic.RemoteKey.PREVIOUS_TRACK:
							command = 'MENU';
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
							command = this.mediaState ? 'PLAY' : 'PAUSE';
							this.mediaState = !this.mediaState;
						case Characteristic.RemoteKey.INFORMATION:
							command = this.switchInfoMenu ? 'MENU' : 'INFO';
							break;
					}
					this.pointerInputSocket.send('button', {
						name: command
					});
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Remote Key successful, command: %s', this.host, accessoryName, command);
					}
				}
			});

		//optional characteristics
		this.televisionService.getCharacteristic(Characteristic.Brightness)
			.onGet(async () => {
				const value = (this.webOS >= 4) ? this.brightness : 0;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get Brightness successful: %s %', this.host, accessoryName, value);
				}
				return value;
			})
			.onSet(async (value) => {
				const params = {
					category: 'picture',
					settings: {
						'brightness': value
					}
				}
				this.lgtv.request('ssap://settings/setSystemSettings', params, (error, response) => {
					if (error) {
						this.log.error('Device: %s %s, set Brightness error: %s.', this.host, this.name, error);
					} else {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Brightness successful: %s %.', this.host, accessoryName, value);
						}
					}
				});
			});

		this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
			.onGet(async () => {
				const state = 0;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get Closed captions successful: %s %', this.host, accessoryName, state);
				}
				return state;
			})
			.onSet(async (state) => {
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set Closed captions successful: %s.', this.host, accessoryName, state);
				}
			});

		//this.televisionService.getCharacteristic(Characteristic.DisplayOrder)
		//	.onGet(async () => {
		//		const tag = 0x02;
		//		const length = 0x01;
		//		const value = 0x01;
		//		const data = [tag, length, value];
		//		if (!this.disableLogInfo) {
		//			this.log('Device: %s %s, get display order successful: %s %', this.host, accessoryName, data);
		//		}
		//		return data;
		//	})
		//	.onSet(async (data) => {
		//		if (!this.disableLogInfo) {
		//			this.log('Device: %s %s, set display order successful: %s.', this.host, accessoryName, data);
		//		}
		//	});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				const value = 2;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get Media state successful: %s %', this.host, accessoryName, value);
				}
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP
				const value = 2;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get target Media state successful: %s %', this.host, accessoryName, value);
				}
				return value;
			})
			.onSet(async (value) => {
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set target Media state successful: %s.', this.host, accessoryName, value);
				}
			});

		this.televisionService.getCharacteristic(Characteristic.PictureMode)
			.onGet(async () => {
				const value = this.pictureMode;
				if (!this.disableLogInfo && this.webOS >= 4) {
					this.log('Device: %s %s, get Picture mode: %s', this.host, accessoryName, value);
				}
				return value;
			})
			.onSet(async (command) => {
				try {
					switch (command) {
						//Set picture mode for current input, dynamic range and 3d mode.
						//Known picture modes are: cinema, eco, expert1, expert2, game,
						// normal, photo, sports, technicolor, vivid, hdrEffect,  hdrCinema,
						//hdrCinemaBright, hdrExternal, hdrGame, hdrStandard, hdrTechnicolor,
						//hdrVivid, dolbyHdrCinema, dolbyHdrCinemaBright, dolbyHdrDarkAmazon,
						//dolbyHdrGame, dolbyHdrStandard, dolbyHdrVivid, dolbyStandard
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
					const params = {
						category: 'picture',
						settings: {
							'pictureMode': command
						}
					}
					this.lgtv.request('ssap://settings/setSystemSettings', params, (error, response) => {
						if (error) {
							this.log.error('Device: %s %s, set Picture mode error: %s.', this.host, this.name, error);
						} else {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Picture mode successful, command: %s', this.host, accessoryName, command);
							}
						}
					});
				} catch (error) {
					this.log.error('Device: %s %s %s, can not setP icture Mode command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				if (this.powerState) {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.switchInfoMenu ? 'MENU' : 'INFO';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'BACK';
							break;
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
					}
					this.pointerInputSocket.send('button', {
						name: command
					});
				}
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName, 'Speaker');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				if (this.powerState && this.pointerInputSocket) {
					switch (command) {
						case Characteristic.VolumeSelector.INCREMENT:
							command = 'VOLUMEUP';
							break;
						case Characteristic.VolumeSelector.DECREMENT:
							command = 'VOLUMEDOWN';
							break;
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Volume Selector successful, command: %s', this.host, accessoryName, command);
					}
					this.pointerInputSocket.send('button', {
						name: command
					});
				}
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Volume level successful: %s', this.host, accessoryName, volume);
				}
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.volume;
				}
				this.lgtv.request('ssap://audio/setVolume', {
					volume: volume
				});
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set new Volume level successful: %s', this.host, accessoryName, volume);
				}
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.powerState ? this.muteState : true;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (state != this.muteState) {
					this.lgtv.request('ssap://audio/setMute', {
						muteState: state
					});
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
				}
			});

		this.televisionService.addLinkedService(this.speakerService);
		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'Volume');
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
						const state = this.powerState ? this.muteState : true;
						return !state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'Volume');
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
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeServiceFan);
			}
		}

		//Prepare inputs service
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		this.log.debug('Device: %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, savedInputs)

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		this.log.debug('Device: %s %s, read saved custom Inputs Names successful, names: %s', this.host, accessoryName, savedInputsNames)

		const savedTargetVisibility = ((fs.readFileSync(this.targetVisibilityInputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.targetVisibilityInputsFile)) : {};
		this.log.debug('Device: %s %s, read saved Target Visibility successful, states %s', this.host, accessoryName, savedTargetVisibility);

		//check available inputs and filter custom unnecessary inputs
		const allInputs = (savedInputs.length > 0) ? savedInputs : this.inputs;
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

			const push = this.filterSystemApps ? (filterApp && filterApp1 && filterApp2 && filterApp3 && filterApp4 && filterApp5 && filterApp6 && filterApp7) ? inputsArr.push(allInputs[i]) : false : inputsArr.push(allInputs[i]);
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

			const inputService = new Service.InputSource(accessoryName, 'Input ' + j);
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
					try {
						const nameIdentifier = (inputReference != undefined) ? inputReference : false;
						let newName = savedInputsNames;
						newName[nameIdentifier] = name;
						const newCustomName = JSON.stringify(newName);
						const writeNewCustomName = (nameIdentifier != false) ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						this.log.debug('Device: %s %s, saved new Input successful, savedInputsNames: %s', this.host, accessoryName, newCustomName);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, new Input name saved failed, error: %s', this.host, accessoryName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					try {
						const targetVisibilityIdentifier = (inputReference != undefined) ? inputReference : false;
						let newState = savedTargetVisibility;
						newState[targetVisibilityIdentifier] = state;
						const newTargetVisibility = JSON.stringify(newState);
						const writeNewTargetVisibility = (targetVisibilityIdentifier != false) ? await fsPromises.writeFile(this.targetVisibilityInputsFile, newTargetVisibility) : false;
						this.log.debug('Device: %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, newTargetVisibility);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
						}
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
						this.getAndSaveInputs();
					} catch (error) {
						this.log.error('Device: %s %s, Input: %s, saved target visibility state error: %s', this.host, accessoryName, error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);

			this.inputsService.push(inputService);
			this.televisionService.addLinkedService(this.inputsService[j]);
			accessory.addService(this.inputsService[j]);
		}

		//Prepare inputs button services
		this.log.debug('prepareInputsButtonService');

		//check available buttons and possible buttons count (max 96 - inputsCount)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const maxButtonsCount = ((inputsCount + buttonsCount) < 94) ? buttonsCount : 94 - inputsCount;
		for (let i = 0; i < maxButtonsCount; i++) {

			//get button reference
			const buttonReference = buttons[i].reference;

			//get button name
			const buttonName = (buttons[i].name != undefined) ? buttons[i].name : buttons[i].reference;

			const buttonService = new Service.Switch(accessoryName + ' ' + buttonName, 'Button ' + i);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current state successful: %s', this.host, accessoryName, state);
					}
					return state;
				})
				.onSet(async (state) => {
					try {
						const setInput = (state && this.powerState) ? this.lgtv.request('ssap://system.launcher/launch', {
							id: buttonReference
						}) : false;
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set new Input successful: %s %s', this.host, accessoryName, buttonName, buttonReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
					};
					setTimeout(() => {
						buttonService.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});
			this.buttonsReference.push(buttonReference);
			this.buttonsName.push(buttonName);

			this.buttonsService.push(buttonService);
			accessory.addService(this.buttonsService[i]);
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};