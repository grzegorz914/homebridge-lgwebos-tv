'use strict';

const fs = require('fs');
const lgtv = require('lgtv2');
const wakeOnLan = require('@mi-sec/wol');
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
			for (let i = 0, len = this.devices.length; i < len; i++) {
				let deviceName = this.devices[i];
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
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs;

		//device info
		this.manufacturer = config.manufacturer || 'LG Electronics';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.checkDeviceInfo = false;
		this.checkDeviceState = false;
		this.startPrepareAccessory = true;
		this.currentPowerState = false;
		this.inputNames = new Array();
		this.inputReferences = new Array();
		this.inputTypes = new Array();
		this.inputModes = new Array();
		this.channelNames = new Array();
		this.channelReferences = new Array();
		this.channelNumbers = new Array();
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
		this.systemFile = this.prefDir + '/' + 'system_' + this.host.split('.').join('');
		this.softwareFile = this.prefDir + '/' + 'software_' + this.host.split('.').join('');
		this.servicesFile = this.prefDir + '/' + 'services_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
		this.appsFile = this.prefDir + '/' + 'apps_' + this.host.split('.').join('');
		this.channelsFile = this.prefDir + '/' + 'channels_' + this.host.split('.').join('');
		this.url = 'ws://' + this.host + ':' + WEBSOCKET_PORT;

		this.lgtv = lgtv({
			url: this.url,
			timeout: 10000,
			reconnect: 5000,
			keyFile: this.keyFile
		});

		if (!Array.isArray(this.inputs) || this.inputs === undefined || this.inputs === null) {
			let defaultInputs = [
				{
					name: 'No inputs configured',
					reference: 'No references configured',
					type: 'No types configured',
					mode: 0
				}
			];
			this.inputs = defaultInputs;
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fs.mkdir(this.prefDir, { recursive: false }, (error) => {
				if (error) {
					this.log.error('Device: %s %s, create directory: %s, error: %s', this.host, this.name, this.prefDir, error);
				} else {
					this.log.debug('Device: %s %s, create directory successful: %s', this.host, this.name, this.prefDir);
				}
			});
		}

		//Check device state
		setInterval(function () {
			if (!this.currentPowerState) {
				this.lgtv.connect(this.url);
			}
		}.bind(this), this.refreshInterval * 1000);

		this.lgtv.on('connect', () => {
			this.log('Device: %s %s, connected.', this.host, this.name);
			this.connectToPointerInputSocket();
			this.getDeviceInfo();
			this.updateDeviceState();
			this.currentPowerState = true;
		});

		this.lgtv.on('close', () => {
			this.log('Device: %s %s, disconnected.', this.host, this.name);
			this.pointerInputSocket = null;
			this.currentPowerState = false;

			if (this.televisionService) {
				this.televisionService.updateCharacteristic(Characteristic.Active, 0);
			}
			if (this.speakerService) {
				this.speakerService.updateCharacteristic(Characteristic.Mute, true);
			}
			if (this.volumeService && this.volumeControl == 1) {
				this.volumeService.updateCharacteristic(Characteristic.On, false);
			}
			if (this.volumeServiceFan && this.volumeControl == 2) {
				this.volumeServiceFan.updateCharacteristic(Characteristic.On, true);
			}
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

		this.prepareAccessory();
	}

	connectToPointerInputSocket() {
		this.log.debug('Device: %s %s, connecting to RC socket...', this.host, this.name);
		this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
			if (!error) {
				this.pointerInputSocket = sock;
				this.log('Device: %s %s, RC socket connected.', this.host, this.name);
			}
		});
	}

	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
			me.lgtv.request('ssap://system/getSystemInfo', (error, response) => {
				if (error || response.errorCode) {
					me.log.debug('Device: %s %s, get System info error: %s', me.host, me.name, error);
				} else {
					delete response['returnValue'];
					me.model = response.modelName;
					fs.writeFile(me.systemFile, JSON.stringify(response, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write systemFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, systemFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
						}
					});
				}
			});

			me.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, response) => {
				if (error || response.errorCode) {
					me.log.debug('Device: %s %s, get Software info error: %s', me.host, me.name, error);
				} else {
					delete response['returnValue'];
					me.system = response.product_name;
					me.serial = response.device_id;
					me.firmware = response.minor_ver;
					fs.writeFile(me.softwareFile, JSON.stringify(response, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write softwareFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, softwareFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
						}
					});
				}
			});

			me.lgtv.request('ssap://api/getServiceList', (error, response) => {
				if (error || response.errorCode) {
					me.log.debug('Device: %s %s, get Services list error: %s', me.host, error);
				} else {
					delete response['returnValue'];
					fs.writeFile(me.servicesFile, JSON.stringify(response, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write servicesFile, error: %s', me.host, error);
						} else {
							me.log.debug('Device: %s %s, servicesFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
						}
					});
				}
			});

			me.lgtv.request('ssap://com.webos.applicationManager/listApps', (error, response) => {
				if (error || response.errorCode) {
					me.log.debug('Device: %s %s, get Apps list error: %s', me.host, me.name, error);
				} else {
					delete response['returnValue'];
					fs.writeFile(me.appsFile, JSON.stringify(response, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write appsFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, appsFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
						}
					});
				}
			});
			setTimeout(() => {
				me.log('Device: %s %s, state: Online.', me.host, me.name);
				let manufacturer = me.manufacturer;
				if (typeof me.model !== 'undefined') {
					me.modelName = me.model;
				} else {
					me.modelName = me.modelName;
				};
				if (typeof me.system !== 'undefined') {
					me.system = me.system;
				} else {
					me.system = 'System';
				};
				if (typeof me.serial !== 'undefined') {
					me.serialNumber = me.serial;
				} else {
					me.serialNumber = me.serialNumber;
				};
				if (typeof me.firmware !== 'undefined') {
					me.firmwareRevision = me.firmware;
				} else {
					me.firmwareRevision = me.firmwareRevision;
				};
				me.log('-------- %s --------', me.name);
				me.log('Manufacturer: %s', manufacturer);
				me.log('Model: %s', me.modelName);
				me.log('System: %s', me.system);
				me.log('Serialnr: %s', me.serialNumber);
				me.log('Firmware: %s', me.firmwareRevision);
				me.log('----------------------------------');
			}, 350);
		}, 350);
	}

	updateDeviceState() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
		me.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (error, response) => {
			if (error) {
				me.log.error('Device: %s %s, get current Power state error: %s %s.', me.host, me.name, error, response);
			} else {
				this.log.debug('Device: %s %s, get current Power state data: %s', me.host, me.name, response);
				let prepareOff = (response.processing === 'Request Power Off' || response.processing === 'Request Active Standby' || response.processing === 'Request Suspend' || response.processing === 'Prepare Suspend');
				let prepareScreenSaver = (response.processing === 'Screen Saver Ready');
				let screenSaver = (response.state === 'Screen Saver');
				let pixelRefresh = (response.state === 'Active Standby');
				let powerOff = (response.state === 'Suspend');
				let prepareOn = (response.processing === 'Screen On' || response.processing === 'Request Screen Saver');
				let powerOn = (response.state === 'Active' || screenSaver);
				let state = (powerOn && !pixelRefresh);
				if (state) {
					if (me.televisionService) {
						me.televisionService.updateCharacteristic(Characteristic.Active, 1);
					}
					me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, 'ON');
				} else {
					if (me.televisionService) {
						me.televisionService.updateCharacteristic(Characteristic.Active, 0);
					}
					me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, pixelRefresh ? 'PIXEL REFRESH' : 'OFF');
					me.lgtv.disconnect();
				}
				me.currentPowerState = state;
			}
		});
		me.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, response) => {
			if (error) {
				me.log.error('Device: %s %s, get current App error: %s.', me.host, me.name, error);
			} else {
				me.log.debug('Device: %s %s, get current App state data: %s', me.host, me.name, response);
				let inputReference = response.appId;
				let inputIdentifier = 0;
				if (me.inputReferences.indexOf(inputReference) >= 0) {
					inputIdentifier = me.inputReferences.indexOf(inputReference);
				}
				let inputName = me.inputNames[inputIdentifier];
				let inputMode = me.inputModes[inputIdentifier];
				if (me.televisionService && inputMode == 0) {
					me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}
				me.log.debug('Device: %s %s, get current Input successful: %s %s', me.host, me.name, inputName, inputReference);
				me.currentInputReference = inputReference;
				me.currentInputName = inputName;
				me.currentInputIdentifier = inputIdentifier
			}
		});

		me.lgtv.subscribe('ssap://tv/getCurrentChannel', (error, response) => {
			if (error) {
				me.log.error('Device: %s %s, get current Channel and Name error: %s.', me.host, me.name, error);
			} else {
				me.log.debug('Device: %s %s, get current Channel data: %s', me.host, me.name, response);
				let channelReference = response.channelId;
				let channelName = response.channelName;
				let inputIdentifier = me.inputReferences.indexOf(channelReference);
				let inputMode = me.inputModes[inputIdentifier];
				if (me.televisionService && inputMode == 1) {
					me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}
				me.log.debug('Device: %s %s, get current Channel successful: %s, %s', me.host, me.name, channelName, channelReference);
				me.currentChannelName = channelName;
				me.currentChannelReference = channelReference;
				me.currentInputIdentifier = inputIdentifier
			}
		});

		me.lgtv.subscribe('ssap://audio/getStatus', (error, response) => {
			if (error) {
				me.log.error('Device: %s %s, get current Audio state error: %s.', me.host, me.name, error);
			} else {
				me.log.debug('Device: %s %s, get current Audio state data: %s', me.host, me.name, response);
				let mute = me.currentPowerState ? (response.mute === true) : true;
				let volume = response.volume;
				if (me.speakerService) {
					me.speakerService.updateCharacteristic(Characteristic.Mute, mute);
					me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
					if (me.volumeService && me.volumeControl == 1) {
						me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
						me.volumeService.updateCharacteristic(Characteristic.On, !mute);
					}
					if (me.volumeServiceFan && me.volumeControl == 2) {
						me.volumeServiceFan.updateCharacteristic(Characteristic.RotationSpeed, volume);
						me.volumeServiceFan.updateCharacteristic(Characteristic.On, !mute);
					}
				}
				me.log.debug('Device: %s %s, get current Mute state: %s', me.host, me.name, mute ? 'ON' : 'OFF');
				me.log.debug('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
				me.currentMuteState = mute;
				me.currentVolume = volume;
			}
		});
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
		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

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
			.on('get', (callback) => {
				let state = this.currentPowerState ? 1 : 0;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Power state successfull, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				callback(null, state);
			})
			.on('set', (state, callback) => {
				if (state && !this.currentPowerState) {
					try {
						wakeOnLan(this.mac, {
							address: '255.255.255.255',
							packets: 3,
							interval: 100,
							port: 9
						});
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set new Power state successful: %s', this.host, accessoryName, 'ON');
						}
					} catch (error) {
						this.log.error('Device: %s %s, can not set Power state ON. Might be due to a wrong settings in config, error: %s', this.host);
					};
				} else {
					if (!state && this.currentPowerState) {
						this.lgtv.request('ssap://system/turnOff', (error, response) => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set new Power state successful: %s', this.host, accessoryName, 'OFF');
							}
							this.lgtv.disconnect();
						});
					}
				}
				callback(null);
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', (callback) => {
				let inputIdentifier = this.currentInputIdentifier;
				let inputReference = this.currentInputReference;
				if (this.inputReferences.indexOf(this.currentInputReference) !== -1) {
					inputIdentifier = this.inputReferences.indexOf(inputReference);
				}
				let inputName = this.inputNames[inputIdentifier];
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
				}
				callback(null, inputIdentifier);
			})
			.on('set', (inputIdentifier, callback) => {
				let inputMode = this.inputModes[inputIdentifier];
				let inputName = this.inputNames[inputIdentifier];
				let inputReference = [this.inputReferences[inputIdentifier], "com.webos.app.livetv"][inputMode];
				if (inputMode >= 0) {
					this.lgtv.request('ssap://system.launcher/launch', { id: inputReference });
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
						if (inputMode == 1) {
							let channelReference = this.inputReferences[inputIdentifier];
							this.lgtv.request('ssap://tv/openChannel', { channelId: channelReference });
							if (!me.disableLogInfo) {
								this.log('Device: %s %s, set new Channel successful: %s %s', this.host, accessoryName, inputName, channelReference);
							}
						}
					}
				}
				callback(null);
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', (command, callback) => {
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
				callback(null);
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', (command, callback) => {
				if (this.currentPowerState && this.pointerInputSocket) {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.switchInfoMenu ? 'MENU' : 'INFO';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'BACK';
							break;
					}
					if (!me.disableLogInfo) {
						me.log('Device: %s %s, setPowerModeSelection successful, command: %s', this.host, accessoryName, command);
					}
					this.pointerInputSocket.send('button', { name: command });
				}
				callback(null);
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', (command, callback) => {
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
				callback(null);
			});
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('get', (callback) => {
				let volume = this.currentPowerState ? this.currentVolume : 0;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Volume level successful: %s', this.host, accessoryName, volume);
				}
				callback(null, volume);
			})
			.on('set', (volume, callback) => {
				if (volume == 0 || volume == 100) {
					volume = this.currentVolume;
				}
				this.lgtv.request('ssap://audio/setVolume', { volume: volume });
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set new Volume level successful: %s', this.host, accessoryName, volume);
				}
				callback(null);
			});
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('get', (callback) => {
				let state = this.currentPowerState ? this.currentMuteState : true;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				callback(null, state);
			})
			.on('set', (state, callback) => {
				if (this.currentPowerState && state !== this.currentMuteState) {
					this.lgtv.request('ssap://audio/setMute', { mute: state });
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
				}
				callback(null);
			});

		accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'volumeService');
				this.volumeService.getCharacteristic(Characteristic.Brightness)
					.on('get', (callback) => {
						let volume = this.currentVolume;
						callback(null, volume);
					})
					.on('set', (volume, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
						callback(null);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.on('get', (callback) => {
						let state = this.currentPowerState ? this.currentMuteState : true;
						callback(null, !state);
					})
					.on('set', (state, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
						callback(null);
					});
				accessory.addService(this.volumeService);
				this.volumeService.addLinkedService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'volumeServiceFan');
				this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
					.on('get', (callback) => {
						let volume = this.currentVolume;
						callback(null, volume);
					})
					.on('set', (volume, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
						callback(null);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.on('get', (callback) => {
						let state = this.currentPowerState ? this.currentMuteState : true;
						callback(null, !state);
					})
					.on('set', (state, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
						callback(null);
					});
				accessory.addService(this.volumeServiceFan);
				this.televisionService.addLinkedService(this.volumeServiceFan);
			}

		}

		//Prepare inputs service
		this.log.debug('prepareInputsService');
		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, read customInputsFile failed, error: %s', this.host, accessoryName, error)
		}

		this.inputs.forEach((input, i) => {

			//get input reference
			let inputReference = input.reference;

			//get input name		
			let inputName = input.name;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = input.name;
			}

			//get input type		
			let inputType = input.type;

			//get input mode
			let inputMode = input.mode;

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					savedNames[inputReference] = name;
					fs.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2), (error) => {
						if (error) {
							this.log.error('Device: %s %s, new Input name saved failed, error: %s', this.host, accessoryName, error);
						} else {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
							}
						}
					});
					callback(null);
				});
			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);
			this.inputTypes.push(inputType);
			this.inputModes.push(inputMode);

			accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
		});

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};
