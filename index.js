'use strict';

const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const lgtv = require('./src/lgwebos');
const wol = require('@mi-sec/wol');

const PLUGIN_NAME = 'homebridge-lgwebos-tv';
const PLATFORM_NAME = 'LgWebOsTv';

const API_URL = {
	'WsUrl': 'ws://lgwebostv:3000',
	'ApiGetServiceList': 'ssap://api/getServiceList',
	'GetSystemInfo': 'ssap://system/getSystemInfo',
	'GetSoftwareInfo': 'ssap://com.webos.service.update/getCurrentSWInformation',
	'GetInstalledApps': 'ssap://com.webos.applicationManager/listApps',
	'GetChannelList': 'ssap:/tv/getChannelList',
	'GetPowerState': 'ssap://com.webos.service.tvpower/power/getPowerState',
	'GetForegroundAppInfo': 'ssap://com.webos.applicationManager/getForegroundAppInfo',
	'GetCurrentChannel': 'ssap://tv/getCurrentChannel',
	'GetChannelProgramInfo': 'ssap://tv/getChannelProgramInfo',
	'GetExternalInputList': 'ssap://tv/getExternalInputList',
	'SwitchInput': 'ssap://tv/switchInput',
	'GetAudioStatus': 'ssap://audio/getStatus',
	'GetSystemSettings': 'ssap://settings/getSystemSettings',
	'GetVolume': 'ssap://audio/getVolume',
	'GetAppState': 'com.webos.service.appstatus/getAppStatus',
	'TurnOff': 'ssap://system/turnOff',
	'LaunchApp': 'ssap://system.launcher/launch',
	'CloseApp': 'ssap://system.launcher/close',
	'CloseMediaViewer': 'ssap://media.viewer/close',
	'CloseWebApp': 'ssap://webapp/closeWebApp',
	'OpenChannel': 'ssap://tv/openChannel',
	'SetSystemSettings': 'luna://com.webos.settingsservice/setSystemSettings',
	'SetVolume': 'ssap://audio/setVolume',
	'SetVolumeUp': 'ssap://audio/volumeUp',
	'SetVolumeDown': 'ssap://audio/volumeDown',
	'SetMute': 'ssap://audio/setMute',
	'Set3dOn': 'ssap://com.webos.service.tv.display/set3DOn',
	'Set3dOff': 'ssap://com.webos.service.tv.display/set3DOff',
	'SetMediaPlay': 'ssap://media.controls/play',
	'SetMediaPause': 'ssap://media.controls/pause',
	'SetMediaStop': 'ssap://media.controls/stop',
	'SetMediaRewind': 'ssap://media.controls/rewind',
	'SetMediaFastForward': 'ssap://media.controls/fastForward',
	'SetTvChannelUp': 'ssap://tv/channelUp',
	'SetTvChannelDown': 'ssap://tv/channelDown',
	'SetToast': 'ssap://system.notifications/createToast'
};
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
				if (!device.name) {
					this.log.warn('Device Name Missing');
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
		this.host = config.host || '';
		this.mac = config.mac || '';
		this.refreshInterval = config.refreshInterval || 2500;
		this.disableLogInfo = config.disableLogInfo || false;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu || false;
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
		this.inputSocketUrl = null;

		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();

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
		this.inputMode = 0;

		this.channelName = '';
		this.channelNumber = 0;

		this.productName = 'webOS';
		this.webOS = 2;

		this.brightness = 0;
		this.backlight = 0;
		this.contrast = 0;
		this.color = 0;
		this.pictureMode = '';

		const prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		this.keyFile = prefDir + '/' + 'key_' + this.host.split('.').join('');
		this.devInfoFile = prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.inputsFile = prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.inputsNamesFile = prefDir + '/' + 'inputsNames_' + this.host.split('.').join('');
		this.inputsTargetVisibilityFile = prefDir + '/' + 'inputsTargetVisibility_' + this.host.split('.').join('');
		this.channelsFile = prefDir + '/' + 'channels_' + this.host.split('.').join('');

		//check required directory and files
		const dir = fs.existsSync(prefDir) ? false : fsPromises.mkdir(prefDir)
		const keyFile = fs.existsSync(this.keyFile) ? false : fsPromises.mkdir(this.keyFile, '')
		const devInfoFile = fs.existsSync(this.devInfoFile) ? false : fsPromises.mkdir(this.devInfoFile, '')
		const inputsFile = fs.existsSync(this.inputsFile) ? false : fsPromises.mkdir(this.inputsFile, '')
		const inputsNamesFile = fs.existsSync(this.inputsNamesFile) ? false : fsPromises.mkdir(this.inputsNamesFile, '')
		const inputsTargetVisibilityFile = fs.existsSync(this.inputsTargetVisibilityFile) ? false : fsPromises.mkdir(this.inputsTargetVisibilityFile, '')
		const channelsFile = fs.existsSync(this.channelsFile) ? false : fsPromises.mkdir(this.channelsFile, '')

		//prepare lgtv socket connection
		const url = 'ws://' + this.host + ':' + WEBSOCKET_PORT || API_URL.WsUrl;
		this.lgtv = new lgtv({
			url: url,
			timeout: 2500,
			reconnect: this.refreshInterval,
			keyFile: this.keyFile
		});

		this.lgtv.on('connect', (message) => {
			this.log('Device: %s %s, %s', this.host, this.name, message);
			this.lgtv.getSocket((error, sock) => {
				if (error) {
					this.inputSocketUrl = null;
				} else {
					this.log.debug('Device: %s %s, TV RC Socket Url: %s.', this.host, this.name, sock);
					this.connectedToDevice = true;
					this.inputSocketUrl = sock;
					this.getDeviceInfo();
					this.getAndSaveInputs();
					this.getAndSaveChannels();
					this.updateDeviceState();
				}
			});
		});

		this.lgtv.on('message', (message) => {
			this.log('Device: %s %s, %s', this.host, this.name, message);
		});

		this.lgtv.on('error', (error) => {
			this.log('Device: %s %s, %s', this.host, this.name, error);
			this.connectedToDevice = false;
		});

		this.lgtv.on('close', (message) => {
			this.log('Device: %s %s, %s', this.host, this.name, message);
			this.connectedToDevice = false;
			this.inputSocketUrl = null;
			this.powerState = false;
		});

		//start prepare accessory
		this.prepareAccessory();
	}

	getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting Device Info.', this.host, this.name);
		this.lgtv.send('request', API_URL.GetSystemInfo, (error, response) => {
			if (error || response.errorCode) {
				this.log.debug('Device: %s %s, get System info error: %s', this.host, this.name, error);
			} else {
				this.log.debug('Device: %s %s, debug System info response: %s', this.host, this.name, response);
				const modelName = response.modelName;

				this.lgtv.send('request', API_URL.GetSoftwareInfo, (error, response1) => {
					if (error || response1.errorCode) {
						this.log.debug('Device: %s %s, get Software info error: %s', this.host, this.name, error);
					} else {
						this.log.debug('Device: %s %s, debug Software info response1: %s', this.host, this.name, response1);
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
					}
				});
			}
		});
	}

	getAndSaveInputs() {
		this.log.debug('Device: %s %s, subscribe and save inputs, apps.', this.host, this.name);
		this.lgtv.send('subscribe', API_URL.GetInstalledApps, (error, response) => {
			if (error || response.errorCode) {
				this.log.debug('Device: %s %s, get inputs/apps list error: %s', this.host, this.name, error);
			} else {
				this.log.debug('Device: %s %s, debug inputs/apps list: %s', this.host, this.name, response);
				//save inputs from device to the file
				if (response.apps != undefined) {
					const inputsArr = new Array();
					const inputsData = response.apps;
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
					}
					const obj = JSON.stringify(inputsArr, null, 2);
					const writeInputs = fsPromises.writeFile(this.inputsFile, obj);
					this.log.debug('Device: %s %s, write inputs/apps list: %s', this.host, this.name, obj);
				}
			}
		});
	}

	getAndSaveChannels() {
		this.log.debug('Device: %s %s, subscribe and save channels.', this.host, this.name);
		this.lgtv.send('subscribe', API_URL.GetChannelList, (error, response) => {
			if (error || response.errorCode) {
				this.log.debug('Device: %s %s, get channels list error: %s', this.host, this.name, error);
			} else {
				this.log.debug('Device: %s %s, debug channels list: %s', this.host, this.name, response);
				//save channels from device to the file
				if (response.channelList != undefined) {
					const channelsArr = new Array();
					const channelsData = response.channelList;
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
					const writeChannels = fsPromises.writeFile(this.channelsFile, obj);
					this.log.debug('Device: %s %s, write channels list: %s', this.host, this.name, obj);
				}
			}
		});
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, requesting device state.', this.host, this.name);
		try {
			const webOS = this.webOS;

			this.lgtv.send('subscribe', API_URL.GetPowerState, (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Power state error: %s %s.', this.host, this.name, error, response);
				} else {
					this.log.debug('Device: %s %s, debug current Power state response: %s', this.host, this.name, response);
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
						this.televisionService
							.updateCharacteristic(Characteristic.Active, powerState);
						if (this.speakerService) {
							this.speakerService
								.updateCharacteristic(Characteristic.Mute, !powerState);
							if (this.volumeService && this.volumeControl == 1) {
								this.volumeService
									.updateCharacteristic(Characteristic.On, powerState);
							}
							if (this.volumeServiceFan && this.volumeControl == 2) {
								this.volumeServiceFan
									.updateCharacteristic(Characteristic.On, powerState);
							}
							this.muteState = !powerState;
						}
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
					}
					this.powerState = powerState;
					this.screenPixelRefresh = pixelRefresh;
				}
			});

			this.lgtv.send('subscribe', API_URL.GetForegroundAppInfo, (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current App error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, debug current App response: %s', this.host, this.name, response);
					const inputReference = response.appId;

					const currentInputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : this.inputIdentifier;
					const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
					const inputMode = this.inputsMode[inputIdentifier];

					if (this.televisionService && inputMode == 0) {
						const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
							this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

						this.setStartInput = (currentInputIdentifier == inputIdentifier) ? false : true;
						this.inputReference = inputReference;
						this.inputIdentifier = inputIdentifier;
						this.inputMode = inputMode;
					}
				}
			});

			this.lgtv.send('subscribe', API_URL.GetCurrentChannel, (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Channel and Name error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, debug current Channel response: %s', this.host, this.name, response);

					const channelName = response.channelName;
					const channelReference = response.channelId;
					const channelNumber = response.channelNumber;

					const currentInputIdentifier = (this.inputsReference.indexOf(channelReference) >= 0) ? this.inputsReference.indexOf(channelReference) : this.inputIdentifier;
					const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
					const inputMode = this.inputsMode[inputIdentifier];

					if (this.televisionService && inputMode == 1) {
						const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
							this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

						this.setStartInput = (currentInputIdentifier == inputIdentifier) ? false : true;
						this.channelName = channelName;
						this.inputReference = channelReference;
						this.channelNumber = channelNumber;
						this.inputIdentifier = inputIdentifier;
						this.inputMode = inputMode;
					}
				}
			});

			this.lgtv.send('subscribe', API_URL.GetAudioStatus, (error, response) => {
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
				const payload = {
					category: 'picture',
					keys: ['brightness', 'backlight', 'contrast', 'color']
				}
				this.lgtv.send('subscribe', API_URL.GetSystemSettings, payload, (error, response) => {
					if (error) {
						this.log.error('Device: %s %s, get system settings error: %s.', this.host, this.name, error);
					} else {
						this.log.debug('Device: %s %s, debug system settings response: %s', this.host, this.name, response.settings);

						const brightness = response.settings.brightness;
						const backlight = response.settings.backlight;
						const contrast = response.settings.contrast;
						const color = response.settings.color;
						const pictureMode = 3;

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

					}
				});
			}
		} catch (error) {
			this.log.debug('Device: %s %s, update device state error: %s', this.host, this.name, error);
		};
	}

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
			const webOS = devInfo.product_name.slice(8, -2);

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
			this.log.debug('Device: %s %s, prepareInformationService error: %s', this.host, accessoryName, error);
		};

		//Prepare television service 
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				try {
					const state = this.powerState;
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
					const setPowerOn = (state && !this.powerState) ? wol(this.mac, {
						address: '255.255.255.255',
						packets: 3,
						interval: 100,
						port: 9
					}) : false;
					const setPowerOff = (!state && this.powerState) ? this.lgtv.send('request', API_URL.TurnOff) : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
				} catch (error) {
					this.log.error('Device: %s %s, set Power state error: %s', this.host, accessoryName, error);
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputName = this.inputName;
				const inputReference = this.inputReference;
				const inputMode = this.inputMode;
				const inputIdentifier = this.inputIdentifier;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get %s successful, name: %s, reference %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', inputName, inputReference);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputMode = this.inputsMode[inputIdentifier];
					const inputReference = this.inputsReference[inputIdentifier];
					const inputId = (inputMode == 0) ? this.inputsReference[inputIdentifier] : 'com.webos.app.livetv';
					const payload = {
						id: inputId
					}
					const setInput = (inputReference != undefined) ? this.lgtv.send('request', API_URL.LaunchApp, payload) : false;
					const payload1 = {
						channelId: inputReference
					}
					const setChannel = (inputReference != undefined && inputMode == 1) ? this.lgtv.send('request', API_URL.OpenChannel, payload1) : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', inputName, inputReference);
					}
				} catch (error) {
					this.log.error('Device: %s %s, set %s error: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', error);
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
					const payload = {
						name: command
					}
					this.inputSocketUrl.send('button', payload);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Remote Key successful, command: %s', this.host, accessoryName, command);
					}
				}
			});

		//optional television characteristics
		this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
			.onGet(async () => {
				const state = 0;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get Closed captions successful: %s', this.host, accessoryName, state);
				}
				return state;
			})
			.onSet(async (state) => {
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set Closed captions successful: %s', this.host, accessoryName, state);
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
					this.log('Device: %s %s, get Media state successful: %s', this.host, accessoryName, value);
				}
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP
				const value = 2;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get target Media state successful: %s', this.host, accessoryName, value);
				}
				return value;
			})
			.onSet(async (value) => {
				try {
					const newMediaState = [API_URL.SetMediaPlay, API_URL.SetMediaPause, API_URL.SetMediaStop][value]
					this.lgtv.send('request', newMediaState);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Media state successful, state: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP'][value]);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, set Media state error: %s', this.host, accessoryName, error);
				};
			});

		if (this.webOS >= 4 && this.pictureModeControl) {
			this.televisionService.getCharacteristic(Characteristic.PictureMode)
				.onGet(async () => {
					const value = 3;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Picture mode: %s', this.host, accessoryName, value);
					}
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
						}
						const payload = {
							category: 'picture',
							settings: {
								'pictureMode': command
							}
						}
						this.lgtv.send('request', API_URL.SetSystemSettings, payload);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Picture mode successful, command: %s', this.host, accessoryName, command);
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, set Picture Mode error: %s', this.host, accessoryName, error);
					};
				});
		}

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
					const payload = {
						name: command
					}
					this.inputSocketUrl.send('button', payload);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
					}
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
				if (this.powerState && this.inputSocketUrl) {
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
					this.inputSocketUrl.send('button', payload);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Volume Selector successful, command: %s', this.host, accessoryName, command);
					}
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
				const payload = {
					volume: volume
				}
				this.lgtv.send('request', API_URL.SetVolume, payload);
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
					const payload = {
						muteState: state
					}
					this.lgtv.send('request', API_URL.SetMute, payload);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
				}
			});

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

		if (this.webOS >= 4) {
			//Backlight
			if (this.backlightControl) {
				this.log.debug('prepareBacklightService');
				this.backlightService = new Service.Lightbulb(accessoryName + ' Backlight', 'Backlight');
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
							}
							this.lgtv.send('request', API_URL.SetSystemSettings, payload);
							if (this.disableLogInfo) {
								this.log('Device: %s %s, set Backlight successful, value: %s', this.host, accessoryName, value, response);
							}
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
				this.brightnessService = new Service.Lightbulb(accessoryName + ' Brightness', 'Brightness');
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
							}
							this.lgtv.send('request', API_URL.SetSystemSettings, payload);
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Brightness successful, value: %s', this.host, accessoryName, value, response);
							}
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
				this.contrastService = new Service.Lightbulb(accessoryName + ' Contrast', 'Contrast');
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
							}
							this.lgtv.send('request', API_URL.SetSystemSettings, payload);
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Contrast successful, value: %s', this.host, accessoryName, value);
							}
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
				this.colorService = new Service.Lightbulb(accessoryName + ' Color', 'Color');
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
							}
							this.lgtv.send('request', API_URL.SetSystemSettings, payload);
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Color successful, value: %s', this.host, accessoryName, value);
							}
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

					this.pictureModeService = new Service.Switch(accessoryName + ' ' + pictureModeName, 'Picture Mode' + i);
					this.pictureModeService.getCharacteristic(Characteristic.On)
						.onGet(async () => {
							const state = false;
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, get Picture Mode successful: %s', this.host, accessoryName, state);
							}
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
								}
								const setMode = (state && this.powerState) ? this.lgtv.send('request', API_URL.SetSystemSettings, payload) : false;
								if (!this.disableLogInfo) {
									this.log('Device: %s %s, set Picture Mode successful, Mode: %s', this.host, accessoryName, pictureModeName, response);
								}

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
		}

		//Prepare inputs service
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		this.log.debug('Device: %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, savedInputs)

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		this.log.debug('Device: %s %s, read saved custom Inputs Names successful, names: %s', this.host, accessoryName, savedInputsNames)

		const savedTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		this.log.debug('Device: %s %s, read saved Target Visibility successful, states %s', this.host, accessoryName, savedTargetVisibility);

		const savedChannels = ((fs.readFileSync(this.channelsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.channelsFile)) : [];
		this.log.debug('Device: %s %s, read saved Channels successful, channels: %s', this.host, accessoryName, savedChannels)

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
						this.log.debug('Device: %s %s, saved new %s successful, savedInputsNames: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', newCustomName);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, new %s name saved successful, name: %s reference: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', name, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, save new %s name error: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', error);
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
						const writeNewTargetVisibility = (targetVisibilityIdentifier != false) ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						this.log.debug('Device: %s %s, %s: %s, saved target visibility state: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', inputName, newTargetVisibility);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, %s: %s, saved target visibility state: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', inputName, state ? 'HIDEN' : 'SHOWN');
						}
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s, save new %s target visibility error: %s', this.host, accessoryName, inputMode == 0 ? 'Input' : 'Channel', error);
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

			//get button mode
			const buttonMode = buttons[i].mode;

			const buttonService = new Service.Switch(accessoryName + ' ' + buttonName, 'Button ' + i);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get button state successful, state: %s', this.host, accessoryName, state);
					}
					return state;
				})
				.onSet(async (state) => {
					try {
						const appId = (buttonMode == 0) ? buttonReference : 'com.webos.app.livetv';
						const payload = {
							id: appId
						}
						const setInput = (state && this.powerState) ? this.lgtv.send('request', API_URL.LaunchApp, payload) : false;
						const payload1 = {
							channelId: buttonReference
						}
						const setChannel = (state && this.powerState && buttonMode == 1) ? this.lgtv.send('request', API_URL.OpenChannel, payload1) : false;
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, buttonMode == 0 ? 'Input' : 'Channel', buttonName, buttonReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, set %s error: %s', this.host, accessoryName, buttonMode == 0 ? 'Input' : 'Channel', error);
					};
					setTimeout(() => {
						buttonService.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});

			accessory.addService(buttonService);
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};