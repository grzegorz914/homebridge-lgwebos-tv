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
				const deviceName = this.devices[i];
				if (!deviceName.name) {
					this.log.warn('Device Name Missing')
				} else {
					this.accessories.push(new lgwebosTvDevice(this.log, deviceName, this.api));
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
		this.inputsName = new Array();
		this.inputsReference = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();
		this.checkDeviceInfo = false;
		this.connectedToTv = false;
		this.startPrepareAccessory = true;
		this.currentPowerState = false;
		this.pixelRefresh = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputReference = '';
		this.currentInputIdentifier = 0;
		this.currentChannelNumber = -1;
		this.currentChannelName = '';
		this.currentChannelReference = '';
		this.currentMediaState = false; //play/pause
		this.prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		this.keyFile = this.prefDir + '/' + 'key_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
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
		if (fs.existsSync(this.devInfoFile) === false) {
			fsPromises.writeFile(this.devInfoFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.inputsFile) === false) {
			fsPromises.writeFile(this.inputsFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.customInputsFile) === false) {
			fsPromises.writeFile(this.customInputsFile, '{}');
		}

		//Check device state
		setInterval(function () {
			if (!this.connectedToTv) {
				tcpp.probe(this.host, WEBSOCKET_PORT, (err, online) => {
					if (online && !this.pixelRefresh && !this.currentPowerState) {
						this.connectToTv();
					}
				});
			}
		}.bind(this), this.refreshInterval * 1000);

		if (this.startPrepareAccessory) {
			this.prepareAccessory();
		}
	}

	connectToTv() {
		this.log.debug('Device: %s %s, connecting to TV', this.host, this.name);
		try {
			this.lgtv = lgtv({
				url: this.url,
				timeout: 5000,
				reconnect: 5000,
				keyFile: this.keyFile
			});

			this.lgtv.connect(this.url);
			this.lgtv.on('connect', () => {
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, connected.', this.host, this.name);
				}
				this.connectedToTv = true;
				this.currentPowerState = true;
				this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
					this.pointerInputSocket = sock;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, RC socket connected.', this.host, this.name);
					}
					this.getDeviceInfo();
				});
			});

			this.lgtv.on('error', (error) => {
				this.log.debug('Device: %s %s, error: %s', this.host, this.name, error);
			});

			this.lgtv.on('prompt', () => {
				this.log('Device: %s %s, waiting on confirmation...', this.host, this.name);
				this.currentPowerState = false;
			});

			this.lgtv.on('connecting', () => {
				this.log.debug('Device: %s %s, connecting...', this.host, this.name);
				this.currentPowerState = false;
			});

		} catch (error) {
			this.log.error('Device: %s %s, connecting to TV error: %s, state: Offline, trying to reconnect', this.host, this.name, error);
			this.connectedToTv = false;
		};
	}

	disconnectFromTv() {
		this.log.debug('Device: %s %s, disconnecting from TV', this.host, this.name);
		try {
			this.lgtv.disconnect();
			this.lgtv.on('close', () => {
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, disconnected.', this.host, this.name);
				}
				this.pointerInputSocket = null;
				this.connectedToTv = false;
			});
		} catch (error) {
			this.log.error('Device: %s %s, disconnecting from TV error: %s, state: Offline, trying to reconnect', this.host, this.name, error);
			this.connectedToTv = false;
		};
	}

	async getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting Device Info.', this.host, this.name);
		try {
			this.lgtv.request('ssap://system/getSystemInfo', (error, response) => {
				if (error || response.errorCode) {
					this.log.error('Device: %s %s, get System info error: %s', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, get System info response: %s', this.host, this.name, response);
					this.modelName = response.modelName;
				}
				this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, response1) => {
					if (error || response1.errorCode) {
						this.log.error('Device: %s %s, get Software info error: %s', this.host, this.name, error);
					} else {
						this.log.debug('Device: %s %s, get System info response1: %s', this.host, this.name, response1);
						this.productName = response1.product_name;
						this.serialNumber = response1.device_id;
						this.firmwareRevision = response1.major_ver + '.' + response1.minor_ver;
					}
					const obj = Object.assign(response, response1);
					const devInfo = JSON.stringify(obj, null, 2);
					const writeDevInfoFile = fsPromises.writeFile(this.devInfoFile, devInfo);
					this.log.debug('Device: %s %s, saved Device Info successful: %s', this.host, this.name, devInfo);

					if (!this.disableLogInfo) {
						this.log('Device: %s %s, state: Online.', this.host, this.name);
					}
					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', this.manufacturer);
					this.log('Model: %s', this.modelName);
					this.log('System: %s', this.productName);
					this.log('Serialnr: %s', this.serialNumber);
					this.log('Firmware: %s', this.firmwareRevision);
					this.log('----------------------------------');
				});
			});
			this.updateDeviceState();
		} catch (error) {
			this.log.error('Device: %s %s, requesting Device Info failed, error: %s', this.host, this.name, error)
		}
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, requesting Device state.', this.host, this.name);
		try {
			this.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Power state error: %s %s.', this.host, this.name, error, response);
				} else {
					this.log.debug('Device: %s %s, get current Power state data: %s', this.host, this.name, response);
					const preparePowerOn = (response.state === 'Suspend' && response.processing === 'Screen On');
					const powerOnStill = (response.state === 'Active' && response.processing === 'Screen On');

					const prepareOff = ((response.state === 'Active' && response.processing === 'Request Power Off' && response.onOff === 'off') || (response.state === 'Active' && response.processing === 'Request Active Standby') || (response.state === 'Active' && response.processing === 'Request Suspend') || (response.state === 'Active' && response.processing === 'Prepare Suspend'));

					const powerOn = ((response.state === 'Active') && (prepareOff === false));
					const powerOff = ((response.state === 'Suspend') && (preparePowerOn === false));

					const prepareScreenSaver = (response.state === 'Active' && response.processing === 'Request Screen Saver');
					const screenSaver = (response.state === 'Screen Saver');

					const pixelRefresh = (response.state === 'Active Standby');

					const powerStateOn = ((preparePowerOn || powerOnStill || powerOn || prepareScreenSaver) === true);
					const powerStateOff = ((prepareOff || powerOff) === true);
					if (this.televisionService && powerStateOn) {
						this.televisionService.updateCharacteristic(Characteristic.Active, true);
						this.currentPowerState = true;
					}
					if (this.televisionService && powerStateOff) {
						this.televisionService.updateCharacteristic(Characteristic.Active, false);
						this.currentPowerState = false;
						this.disconnectFromTv();
					}
					this.pixelRefresh = pixelRefresh;
				}
			});
			this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current App error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, get current App state response: %s', this.host, this.name, response);
					const inputReference = response.appId;
					const inputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : 0;
					const inputName = this.inputsName[inputIdentifier];
					if (this.televisionService) {
						this.televisionService
							.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
					}
					this.currentInputReference = inputReference;
					this.currentInputIdentifier = inputIdentifier
					this.currentInputName = inputName;
				}
			});

			this.lgtv.subscribe('ssap://tv/getCurrentChannel', (error, response) => {
				if (error) {
					this.log.error('Device: %s %s, get current Channel and Name error: %s.', this.host, this.name, error);
				} else {
					this.log.debug('Device: %s %s, get current Channel response: %s', this.host, this.name, response);
					const channelReference = response.channelId;
					const channelName = response.channelName;
					const inputIdentifier = (this.inputsReference.indexOf(channelReference) >= 0) ? this.inputsReference.indexOf(channelReference) : 0;
					const inputMode = this.inputsMode[inputIdentifier];
					if (this.televisionService && inputMode == 1) {
						this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
					}
					this.currentChannelName = channelName;
					this.currentChannelReference = channelReference;
					this.currentInputIdentifier = inputIdentifier
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
					}
					this.currentMuteState = mute;
					this.currentVolume = volume;
				}
			});
		} catch (error) {
			this.log.error('Device: %s %s, update Device state error: %s', this.host, this.name, error);
			this.checkDeviceInfo = false;
		};
	}

	//Prepare accessory
	prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		const accessoryCategory = Categories.TELEVISION;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');
		let devInfo = { 'manufacturer': 'Manufacturer', 'modelName': 'Model name', 'device_id': 'Serial number', 'major_ver': 'Firmware', 'minor_ver': 'Firmware', };
		try {
			devInfo = JSON.parse(fs.readFileSync(this.devInfoFile));
			this.log.debug('Device: %s %s, read devInfo: %s', this.host, accessoryName, devInfo)
		} catch (error) {
			this.log.error('Device: %s %s, read devInfo failed, error: %s', this.host, accessoryName, error)
		}

		const manufacturer = this.manufacturer;
		const modelName = devInfo.modelName;
		const serialNumber = devInfo.device_id;
		const firmwareRevision = devInfo.major_ver + '.' + devInfo.minor_ver;

		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Name, accessoryName)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
		accessory.addService(informationService);


		//Prepare TV service 
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.currentPowerState;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Power state successfull, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				try {
					if (state) {
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
						this.lgtv.request('ssap://system/turnOff', (error, response) => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set new Power state successful: %s', this.host, accessoryName, 'OFF');
							}
						});
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputReference = this.currentInputReference;
				const inputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : 0;
				const inputName = this.inputsName[inputIdentifier];
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputReference = this.inputsReference[inputIdentifier];
					this.lgtv.request('ssap://system.launcher/launch', { id: inputReference });
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
					}
					this.currentInputReference = inputReference;
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
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setRemoteKey successful, command: %s', this.host, accessoryName, command);
					}
					this.pointerInputSocket.send('button', { name: command });
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

		accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);

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
				this.volumeService.addLinkedService(this.volumeService);
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
				this.televisionService.addLinkedService(this.volumeServiceFan);
			}
		}

		//Prepare inputs service
		if (this.inputs.length > 0) {
			this.log.debug('prepareInputsService');
			this.inputsService = new Array();
			let savedNames = {};
			try {
				savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
				this.log.debug('Device: %s %s, read savedNames: %s', this.host, accessoryName, savedNames)
			} catch (error) {
				this.log.error('Device: %s %s, read savedNames failed, error: %s', this.host, accessoryName, error)
			}

			const inputs = this.inputs;
			let inputsLength = inputs.length;
			if (inputsLength > 94) {
				inputsLength = 94
			}
			for (let i = 0; i < inputsLength; i++) {

				//get input reference
				const inputReference = inputs[i].reference;

				//get input name
				let inputName = inputs[i].name;
				if (savedNames && savedNames[inputReference]) {
					inputName = savedNames[inputReference];
				} else {
					inputName = (inputs[i].name !== undefined) ? inputs[i].name : inputs[i].reference;;
				}

				//get input type
				const inputType = inputs[i].type;

				//get input mode
				const inputMode = inputs[i].mode;

				const inputService = new Service.InputSource(inputReference, 'input' + i);
				inputService
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, inputType)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
					.setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.SHOWN);

				inputService
					.getCharacteristic(Characteristic.ConfiguredName)
					.onSet(async (name) => {
						savedNames[inputReference] = name;
						fs.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2), (error) => {
							if (error) {
								this.log.error('Device: %s %s, new Input name saved failed, error: %s', this.host, accessoryName, error);
							} else {
								this.log.debug('Device: %s %s, saved new Input successful, savedNames: %s', this.host, accessoryName, JSON.stringify(savedNames, null, 2));
								if (!this.disableLogInfo) {
									this.log('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
								}
							}
						});
					});
				this.inputsReference.push(inputReference);
				this.inputsName.push(inputName);
				this.inputsType.push(inputType);
				this.inputsMode.push(inputMode);

				this.inputsService.push(inputService);
				accessory.addService(this.inputsService[i]);
				this.televisionService.addLinkedService(this.inputsService[i]);
			}
		}

		//Prepare inputs button services
		if (this.buttons.length > 0) {
			this.log.debug('prepareInputsButtonService');
			this.buttonsService = new Array();
			this.buttonsName = new Array();
			this.buttonsReference = new Array();
			for (let i = 0; i < this.buttons.length; i++) {
				const buttonName = (buttons[i].name !== undefined) ? buttons[i].name : buttons[i].reference;
				const buttonReference = this.buttons[i].reference;
				const buttonService = new Service.Switch(accessoryName + ' ' + this.buttons[i].name, 'buttonService' + i);
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
									buttonService.getCharacteristic(Characteristic.On).updateValue(false);
								}, 350);
							} catch (error) {
								this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
							};
						} else {
							setTimeout(() => {
								buttonService.getCharacteristic(Characteristic.On).updateValue(false);
							}, 350);
						}
					});
				this.buttonsReference.push(buttonReference);
				this.buttonsName.push(buttonName);

				this.buttonsService.push(buttonService)
				accessory.addService(this.buttonsService[i]);
				this.televisionService.addLinkedService(this.buttonsService[i]);
			}
		}

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};