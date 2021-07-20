'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
const lgtv = require('lgtv2');
const wakeOnLan = require('@mi-sec/wol');
const tcpp = require('tcp-ping');
const path = require('path');

const WEBSOCKET_PORT = 3000;
const PLUGIN_NAME = 'homebridge-lgwebos-tv';
const PLATFORM_NAME = 'LgWebOsTv';

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
			log('No configuration found for homebridge-lgwebos-tv');
			return;
		}
		this.log = log;
		this.config = config;
		this.api = api;
		this.devices = config.devices;
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				const deviceName = device.name;
				if (!deviceName) {
					this.log.warn('Device Name Missing')
				} else {
					this.log.info('Adding new accessory:', deviceName);
					this.accessories.push(new lgwebosTvDevice(this.log, device, this.api));
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
		this.api = api;
		this.config = config;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.mac = config.mac;
		this.refreshInterval = config.refreshInterval || 5;
		this.disableLogInfo = config.disableLogInfo;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];

		//device info
		this.manufacturer = config.manufacturer || 'LG Electronics';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.inputsService = new Array();
		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();
		this.buttonsService = new Array();
		this.buttonsName = new Array();
		this.buttonsReference = new Array();
		this.checkDeviceInfo = false;
		this.connectedToTv = false;
		this.setStartInput = false;
		this.currentPowerState = false;
		this.screenPixelRefresh = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputMode = 0;
		this.currentInputReference = '';
		this.currentInputIdentifier = 0;
		this.setStartInputIdentifier = 0;
		this.currentChannelNumber = 0;
		this.currentChannelName = '';
		this.currentChannelReference = '';
		this.currentChannelIdentifier = 0;
		this.setStartInputIdentifier = 0;
		this.inputsLength = this.inputs.length;
		this.buttonsLength = this.buttons.length;
		this.currentMediaState = false; //play/pause
		this.prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		this.keyFile = this.prefDir + '/' + 'key_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
		this.targetVisibilityInputsFile = this.prefDir + '/' + 'targetVisibilityInputs_' + this.host.split('.').join('');
		this.channelsFile = this.prefDir + '/' + 'channels_' + this.host.split('.').join('');
		this.url = 'ws://' + this.host + ':' + WEBSOCKET_PORT;

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}
		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fsPromises.mkdir(this.prefDir);
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.inputsFile) === false) {
			fsPromises.writeFile(this.inputsFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.customInputsFile) === false) {
			fsPromises.writeFile(this.customInputsFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.targetVisibilityInputsFile) === false) {
			fsPromises.writeFile(this.targetVisibilityInputsFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devInfoFile) === false) {
			fsPromises.writeFile(this.devInfoFile, '');
		}

		//Check device state
		setInterval(function () {
			if (!this.connectedToTv) {
				tcpp.probe(this.host, WEBSOCKET_PORT, (err, online) => {
					if (online) {
						this.connectToTv();
					}
				});
			}
		}.bind(this), this.refreshInterval * 1000);

		this.prepareAccessory();
	}

	connectToTv() {
		this.log.debug('Device: %s %s, connecting to TV', this.host, this.name);
		this.lgtv = lgtv({
			url: this.url,
			timeout: 3000,
			reconnect: 5000,
			keyFile: this.keyFile
		});

		this.lgtv.connect(this.url);

		this.lgtv.on('connect', () => {
			this.log('Device: %s %s, connected.', this.host, this.name);
			this.connectedToTv = true;
			this.connectToTvRcSockeet();
		});

		this.lgtv.on('error', (error) => {
			this.log.debug('Device: %s %s, connect error: %s', this.host, this.name, error);
		});

		this.lgtv.on('prompt', () => {
			this.log('Device: %s %s, waiting on confirmation...', this.host, this.name);
			this.currentPowerState = false;
		});

		this.lgtv.on('connecting', () => {
			this.log.debug('Device: %s %s, connecting...', this.host, this.name);
			this.currentPowerState = false;
		});
	}

	connectToTvRcSockeet() {
		this.log.debug('Device: %s %s, connecting to TV Rc socket', this.host, this.name);
		this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
			if (error) {
				this.log.debug('Device: %s %s, RC socket connected error: %s', this.host, this.name, error);
			} else {
				this.log('Device: %s %s, RC socket connected.', this.host, this.name);
				this.pointerInputSocket = sock;
				this.getDeviceInfo();
				this.updateDeviceState();
			}
		});
	}

	disconnectFromTv() {
		this.log.debug('Device: %s %s, disconnecting from TV', this.host, this.name);
		this.currentPowerState = false;
		this.lgtv.on('close', () => {
			this.log('Device: %s %s, disconnected.', this.host, this.name);
			this.pointerInputSocket = null;
			this.connectedToTv = false;
			this.lgtv.disconnect();
		});
	}

	getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting Device Info.', this.host, this.name);
		this.lgtv.request('ssap://system/getSystemInfo', (error, response) => {
			if (error || response.errorCode) {
				this.log.error('Device: %s %s, get System info error: %s', this.host, this.name, error);
			} else {
				this.log.debug('Device: %s %s, get System info response: %s', this.host, this.name, response);
				const modelName = response.modelName;

				this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, response1) => {
					if (error || response1.errorCode) {
						this.log.error('Device: %s %s, get Software info error: %s', this.host, this.name, error);
					} else {
						this.log.debug('Device: %s %s, get System info response1: %s', this.host, this.name, response1);
						const productName = response1.product_name;
						const serialNumber = response1.device_id;
						const firmwareRevision = response1.major_ver + '.' + response1.minor_ver;

						const obj = Object.assign(response, response1);
						const devInfo = JSON.stringify(obj, null, 2);
						const writeDevInfo = fsPromises.writeFile(this.devInfoFile, devInfo);
						this.log.debug('Device: %s %s, saved Device Info successful: %s', this.host, this.name, devInfo);

						this.lgtv.request('ssap://com.webos.applicationManager/listApps', (error, response2) => {
							if (error || response2.errorCode) {
								this.log.error('Device: %s %s, get apps list error: %s', this.host, this.name, error);
							} else {
								this.log.debug('Device: %s %s, get apps list response2: %s', this.host, this.name, response2);
								const appsLength = response2.apps.length;
								const appsArr = new Array();
								for (let i = 0; i < appsLength; i++) {
									const name = response2.apps[i].title;
									const reference = response2.apps[i].id;
									const appsObj = { 'name': name, 'reference': reference }
									appsArr.push(appsObj);
								}
								const obj = JSON.stringify(appsArr, null, 2);
								const writeInputs = fsPromises.writeFile(this.inputsFile, obj);
								this.log.debug('Device: %s %s, write apps list: %s', this.host, this.name, obj);
							}
						});

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
						this.serialNumber = serialNumber;
						this.firmwareRevision = firmwareRevision;

					}
				});
			}
		});
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, requesting device state.', this.host, this.name);
		try {
			this.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Power state error: %s %s.', this.host, this.name, error, response);
				} else {
					this.log.debug('Device: %s %s, get current Power state data: %s', this.host, this.name, response);
					//screen On
					const prepareScreenOn = ((response.state === 'Suspend' && response.processing === 'Screen On') || (response.state === 'Screen Saver' && response.processing === 'Screen On') || (response.state === 'Active Standby' && response.processing === 'Screen On'));
					const stillScreenOn = (response.state === 'Active' && response.processing === 'Screen On');
					const screenOn = (response.state === 'Active');

					//screen Saver
					const prepareScreenSaver = (response.state === 'Active' && response.processing === 'Request Screen Saver');
					const screenSaver = (response.state === 'Screen Saver');

					//screen Off
					const prepareScreenOff = ((response.state === 'Active' && response.processing === 'Request Power Off') || (response.state === 'Active' && response.processing === 'Request Suspend') || (response.state === 'Active' && response.processing === 'Prepare Suspend') ||
						(response.state === 'Screen Saver' && response.processing === 'Request Power Off') || (response.state === 'Screen Saver' && response.processing === 'Request Suspend') || (response.state === 'Screen Saver' && response.processing === 'Prepare Suspend')) ||
						(response.state === 'Active Standby' && response.processing === 'Request Power Off') || (response.state === 'Active Standby' && response.processing === 'Request Suspend') || (response.state === 'Active Standby' && response.processing === 'Prepare Suspend');
					const screenOff = (response.state === 'Suspend');

					//pixelRefresh
					const prepareScreenPixelRefresh = ((response.state === 'Active' && response.processing === 'Request Active Standby') || (response.state === 'Screen Saver' && response.processing === 'Request Active Standby'));
					const screenPixelRefresh = (response.state === 'Active Standby');

					//powerState
					const pixelRefresh = (prepareScreenPixelRefresh || screenPixelRefresh);
					const powerOn = ((prepareScreenOn || stillScreenOn || screenOn || prepareScreenSaver || screenSaver) && !prepareScreenOff);
					const powerOff = ((prepareScreenOff || screenOff || pixelRefresh) && !prepareScreenOn);

					if (this.televisionService && powerOn) {
						this.televisionService
							.updateCharacteristic(Characteristic.Active, true);
						this.currentPowerState = true;
					}
					if (this.televisionService && powerOff) {
						this.televisionService.updateCharacteristic(Characteristic.Active, false);
					}
					if (this.currentPowerState && powerOff) {
						this.disconnectFromTv();
					}
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
					if (this.televisionService && inputMode === 0) {
						const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
							this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
						this.setStartInput = (currentInputIdentifier === inputIdentifier) ? false : true;

						this.currentInputReference = inputReference;
						this.currentInputIdentifier = inputIdentifier
						this.currentInputName = inputName;
						this.currentInputMode = inputMode;
					}
				}
			});

			this.lgtv.subscribe('ssap://tv/getCurrentChannel', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Channel and Name error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, get current Channel response: %s', this.host, this.name, response);
					const channelReference = response.channelId;
					const currentInputIdentifier = (this.inputsReference.indexOf(channelReference) >= 0) ? this.inputsReference.indexOf(channelReference) : 0;
					const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
					const channelName = response.channelName;
					const inputMode = this.inputsMode[inputIdentifier];
					if (this.televisionService && inputMode === 1) {
						const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
							this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
						this.setStartInput = (currentInputIdentifier === inputIdentifier) ? false : true;
						this.currentChannelReference = channelReference;
						this.currentInputIdentifier = inputIdentifier
						this.currentChannelName = channelName;
					}
				}
			});

			this.lgtv.subscribe('ssap://audio/getStatus', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Audio state error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, get current Audio state response: %s', this.host, this.name, response);
					const volume = response.volume;
					const mute = (response.mute === true);
					if (this.speakerService) {
						this.speakerService
							.updateCharacteristic(Characteristic.Volume, volume)
							.updateCharacteristic(Characteristic.Mute, mute);
						if (this.volumeService && this.volumeControl === 1) {
							this.volumeService
								.updateCharacteristic(Characteristic.Brightness, volume)
								.updateCharacteristic(Characteristic.On, !mute);
						}
						if (this.volumeServiceFan && this.volumeControl === 2) {
							this.volumeServiceFan
								.updateCharacteristic(Characteristic.RotationSpeed, volume)
								.updateCharacteristic(Characteristic.On, !mute);
						}
						this.currentVolume = volume;
						this.currentMuteState = mute;
					}
				}
			});
		} catch (error) {
			this.log.debug('Device: %s %s, update device state error: %s', this.host, this.name, error);
		};
	}

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		const accessoryCategory = Categories.TELEVISION;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');
		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = (readDevInfo !== undefined) ? JSON.parse(readDevInfo) : { 'manufacturer': this.manufacturer, 'modelName': this.modelName, 'device_id': this.serialNumber, 'major_ver': 'Firmware', 'minor_ver': 'Firmware' };
			this.log.debug('Device: %s %s, read devInfo: %s', this.host, accessoryName, devInfo)

			const manufacturer = this.manufacturer;
			const modelName = devInfo.modelName;
			const serialNumber = devInfo.device_id;
			const firmwareRevision = devInfo.major_ver + '.' + devInfo.minor_ver;

			accessory.removeService(accessory.getService(Service.AccessoryInformation));
			const informationService = new Service.AccessoryInformation(accessoryName)
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
		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				try {
					const state = this.currentPowerState;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current Power state successfull, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
					return state;
				} catch (error) {
					this.log.error('Device: %s %s, get current Power state error: %s', this.host, accessoryName, error);
				};
			})
			.onSet(async (state) => {
				try {
					if (state && !this.currentPowerState) {
						wakeOnLan(this.mac, {
							address: '255.255.255.255',
							packets: 3,
							interval: 100,
							port: 9
						});
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set new Power state successful: %s', this.host, accessoryName, 'ON');
						}
					} else {
						if (!state && this.currentPowerState) {
							this.lgtv.request('ssap://system/turnOff', (error, response) => {
								if (!this.disableLogInfo) {
									this.log('Device: %s %s, set new Power state successful: %s', this.host, accessoryName, 'OFF');
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
				const inputName = this.currentInputName;
				const inputReference = this.currentInputReference;
				const inputIdentifier = this.currentInputIdentifier;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputMode = this.inputsMode[inputIdentifier];
					const inputReference = (inputMode === 0 && this.inputsReference[inputIdentifier] !== undefined) ? this.inputsReference[inputIdentifier] : "com.webos.app.livetv";
					const setInput = this.connectedToTv ? this.lgtv.request('ssap://system.launcher/launch', { id: inputReference }) : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
					}
					if (inputMode === 1) {
						const channelReference = (this.inputsReference[inputIdentifier] !== undefined) ? this.inputsReference[inputIdentifier] : 0;
						this.lgtv.request('ssap://tv/openChannel', { channelId: channelReference });
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set new Channel successful: %s %s', this.host, accessoryName, inputName, channelReference);
						}
					}
					this.setStartInputIdentifier = inputIdentifier;
					this.setStartInput = this.currentPowerState ? false : true;
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				if (this.currentPowerState && this.pointerInputSocket) {
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
							command = this.currentMediaState ? 'PLAY' : 'PAUSE';
							this.currentMediaState = !this.currentMediaState;
						case Characteristic.RemoteKey.INFORMATION:
							command = this.switchInfoMenu ? 'MENU' : 'INFO';
							break;
					}
					this.pointerInputSocket.send('button', { name: command });
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setRemoteKey successful, command: %s', this.host, accessoryName, command);
					}
				}
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				if (this.currentPowerState && this.pointerInputSocket) {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.switchInfoMenu ? 'MENU' : 'INFO';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'BACK';
							break;
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setPowerModeSelection successful, command: %s', this.host, accessoryName, command);
					}
					this.pointerInputSocket.send('button', { name: command });
				}
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				if (this.currentPowerState && this.pointerInputSocket) {
					switch (command) {
						case Characteristic.VolumeSelector.INCREMENT:
							command = 'VOLUMEUP';
							break;
						case Characteristic.VolumeSelector.DECREMENT:
							command = 'VOLUMEDOWN';
							break;
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, command);
					}
					this.pointerInputSocket.send('button', { name: command });
				}
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.currentVolume;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Volume level successful: %s', this.host, accessoryName, volume);
				}
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.currentVolume;
				}
				this.lgtv.request('ssap://audio/setVolume', { volume: volume });
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set new Volume level successful: %s', this.host, accessoryName, volume);
				}
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.currentPowerState ? this.currentMuteState : true;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (state !== this.currentMuteState) {
					this.lgtv.request('ssap://audio/setMute', { mute: state });
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
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'volumeService');
				this.volumeService.getCharacteristic(Characteristic.Brightness)
					.onGet(async () => {
						const volume = this.currentVolume;
						return volume;
					})
					.onSet(async (volume) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.currentPowerState ? !this.currentMuteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});

				accessory.addService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'volumeServiceFan');
				this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
					.onGet(async () => {
						const volume = this.currentVolume;
						return volume;
					})
					.onSet(async (volume) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.currentPowerState ? !this.currentMuteState : false;
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
		const inputs = this.inputs;

		const savedNames = ((fs.readFileSync(this.customInputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.customInputsFile)) : {};
		this.log.debug('Device: %s %s, read savedNames: %s', this.host, accessoryName, savedNames)

		const savedTargetVisibility = ((fs.readFileSync(this.targetVisibilityInputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.targetVisibilityInputsFile)) : {};
		this.log.debug('Device: %s %s, read savedTargetVisibility: %s', this.host, accessoryName, savedTargetVisibility);

		//check possible inputs count
		const inputsLength = (this.inputsLength > 96) ? 96 : this.inputsLength;
		for (let i = 0; i < inputsLength; i++) {

			//get input reference
			const inputReference = inputs[i].reference;

			//get input name		
			const inputName = (savedNames[inputReference] !== undefined) ? savedNames[inputReference] : (inputs[i].name !== undefined) ? inputs[i].name : inputs[i].reference;

			//get input type
			const inputType = inputs[i].type;

			//get input mode
			const inputMode = inputs[i].mode;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const targetVisibility = (savedTargetVisibility[inputReference] !== undefined) ? savedTargetVisibility[inputReference] : 0;
			const currentVisibility = targetVisibility;

			const inputService = new Service.InputSource(inputReference, 'input' + i);
			inputService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, isConfigured)
				.setCharacteristic(Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)
				.setCharacteristic(Characteristic.TargetVisibilityState, targetVisibility);

			inputService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onSet(async (name) => {
					try {
						let newName = savedNames;
						newName[inputReference] = name;
						const newCustomName = JSON.stringify(newName);
						await fsPromises.writeFile(this.customInputsFile, newCustomName);
						this.log.debug('Device: %s %s, saved new Input successful, savedNames: %s', this.host, accessoryName, newCustomName);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, new Input name saved failed, error: %s', this.host, accessoryName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onGet(async () => {
					const state = targetVisibility;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, Input: %s, get target visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
					}
					return state;
				})
				.onSet(async (state) => {
					try {
						let newState = savedTargetVisibility;
						newState[inputReference] = state;
						const newTargetVisibility = JSON.stringify(newState);
						await fsPromises.writeFile(this.targetVisibilityInputsFile, newTargetVisibility);
						this.log.debug('Device: %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, newTargetVisibility);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
						}
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s, Input: %s, saved target visibility state error: %s', this.host, accessoryName, error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);

			this.inputsService.push(inputService);
			this.televisionService.addLinkedService(this.inputsService[i]);
			accessory.addService(this.inputsService[i]);
		}

		//Prepare inputs button services
		this.log.debug('prepareInputsButtonService');
		const buttons = this.buttons;

		//check possible buttons count
		const buttonsLength = ((this.inputsLength + this.buttonsLength) > 96) ? 96 - this.inputsLength : this.buttonsLength;
		for (let i = 0; i < buttonsLength; i++) {

			//get button reference
			const buttonReference = buttons[i].reference;

			//get button name
			const buttonName = (buttons[i].name !== undefined) ? buttons[i].name : buttons[i].reference;

			const buttonService = new Service.Switch(accessoryName + ' ' + buttonName, 'buttonService' + i);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current state successful: %s', this.host, accessoryName, state);
					}
					return state;
				})
				.onSet(async (state) => {
					if (state && this.currentPowerState) {
						try {
							this.lgtv.request('ssap://system.launcher/launch', { id: buttonReference });
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set new Input successful: %s %s', this.host, accessoryName, buttonName, buttonReference);
							}
							setTimeout(() => {
								buttonService.updateCharacteristic(Characteristic.On, false);
							}, 250);
						} catch (error) {
							this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
							setTimeout(() => {
								buttonService.updateCharacteristic(Characteristic.On, false);
							}, 250);
						};
					} else {
						setTimeout(() => {
							buttonService.updateCharacteristic(Characteristic.On, false);
						}, 250);
					}
				});
			this.buttonsReference.push(buttonReference);
			this.buttonsName.push(buttonName);

			this.buttonsService.push(buttonService)
			accessory.addService(this.buttonsService[i]);
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}

};