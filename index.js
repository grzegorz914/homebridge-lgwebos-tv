const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const Lgtv2 = require('lgtv2');
const wol = require('wake_on_lan');
const tcpp = require('tcp-ping');
const responseDelay = 1500;

var Accessory, Service, Characteristic, hap, UUIDGen;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	hap = homebridge.hap;

	homebridge.registerPlatform('homebridge-lgwebos-tv', 'lgWebOsTv', lgwebosTvPlatform, true);
};


class lgwebosTvPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		this.devices = config.devices || [];
		this.tvAccessories = [];

		if (this.version < 2.1) {
			throw new Error('Unexpected API version.');
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new lgwebosTvDevice(log, this.devices[i], api));
		}

		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
	configureAccessory() { }
	removeAccessory() { }
	didFinishLaunching() {
		var me = this;
		setTimeout(function () {
			me.log.debug('didFinishLaunching');
		},
			(this.devices.length + 1) * responseDelay);
	}
}

class lgwebosTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.port = 3000;

		//device configuration
		this.device = device;
		this.name = device.name;
		this.host = device.host;
		this.mac = device.mac;
		this.switchInfoMenu = device.switchInfoMenu;
		this.inputs = device.inputs;
		this.broadcastAdr = '255.255.255.255';

		//setup variables
		this.connectionStatus = false;
		this.inputsDir = ppath('lgwebosTv/');
		this.inputsFile = this.inputsDir + 'inputs_' + this.name.split(' ').join('');
		this.keyFile = this.inputsDir + 'keyFile_' + this.name.split(' ').join('');
		this.tvInfoFile = this.inputsDir + 'info_' + this.name.split(' ').join('');
		this.url = 'ws://' + this.host + ':' + this.port;

		//get Device info
		this.manufacturer = device.manufacturer || 'LG WebOS';
		this.modelName = device.model || 'homebridge-lgwebos-tv';
		this.serialNumber = device.serialNumber || 'SN000004';
		this.firmwareRevision = device.firmwareRevision || 'FW000004';

		//check if prefs directory ends with a /, if not then add it
		if (this.inputsDir.endsWith('/') === false) {
			this.inputsDir = this.inputsDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.inputsDir) === false) {
			mkdirp(this.inputsDir);
		}

		// create the lgtv instance
		this.lgtv = new Lgtv2({
			url: this.url,
			timeout: 5000,
			reconnect: 3000,
			keyFile: this.keyFile
		});

		//Check net state
		setInterval(function () {
			tcpp.probe(this.host, this.port, (error, isAlive) => {
				if (!isAlive && this.connectingStatus) {
					this.log('Device: %s, state: Offline.', this.host);
					this.disconnect();
					callback(null, false);
				} else if (isAlive && !this.connectingStatus) {
					this.log('Device: %s, state: Online.', this.host);
					this.lgtv.connect(this.url);
				}
			});
		}.bind(this), 5000);

		//register to listeners
		this.lgtv.on('connect', () => {
			this.log.debug('Device: %s, connected to TV, checking power status', this.host);
			this.lgtv.request('ssap://com.webos.service.tvpower/power/getPowerState', (error, data) => {
				if (error || (data && data.state && data.state === 'Active Standby')) {
					this.log.debug('Device: %s, power state Off or Pixel Refresher is running, disconnecting...', this.host);
					//this.connectionStatus = false;
					this.lgtv.disconnect();
				} else {
					this.log.debug('Device: %s, power status: On', this.host);
					this.connectionStatus = true;
					this.connect();
				}
			});
		});

		this.lgtv.on('close', () => {
			this.log.debug('Device: %s, disconnected.', this.host);
			this.connectionStatus = false;
			this.pointerInputSocket = null;
		});

		this.lgtv.on('error', (error) => {
			this.log.error('Device: %s, error: %s', this.host, error);
		});

		this.lgtv.on('prompt', () => {
			this.log.info('Device: %s, prompt for confirmation...', this.host);
			this.connectionStatus = false;
		});

		this.lgtv.on('connecting', () => {
			this.log.debug('Device: %s, connecting...', this.host);
			this.connectionStatus = false;
		});

		var deviceName = this.name;
		var uuid = UUIDGen.generate(deviceName);
		this.tvAccesory = new Accessory(deviceName, uuid, hap.Accessory.Categories.TV);
		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-lgwebos-tv', [this.tvAccesory]);
	}


	// --== CONNECT/DISCONNECT METHODS ==--	
	connect() {
		this.log.info('Device: %s, connected.', this.host);
		this.getDeviceInfo();
		this.connectToPointerInputSocket();
		this.connectionStatus = true;
	}

	disconnect() {
		this.log.info('Device: %s, disconnected.', this.host);
		this.lgtv.disconnect();
		//this.connectionStatus = false;
	}

	connectToPointerInputSocket() {
		this.log.debug('Device: %s, connecting to remote control socket', this.host);
		this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
			if (!error) {
				this.log.debug('Device: %s, connect to pointerInputSocker successful.', this.host);
				this.pointerInputSocket = sock;
			}
			this.log.debug('Device: %s, connect to pointerInputSocker error: %s', this.host), error;
		});
	}

	getDeviceInfo() {
		setTimeout(() => {
			this.log.debug('Device: %s, requesting TV information', this.host);
			this.lgtv.request('ssap://system/getSystemInfo', (error, data) => {
				if (!data || error || data.errorCode) {
					this.log.debug('Device: %s, get system info error: %s', this.host, erroe);
				} else {
					delete data['returnValue'];
					this.log.debug('Device: %s, get system info successfull: %s', this.host, JSON.stringify(data, null, 2));
					// save the tv info to a file if does not exists
					if (fs.existsSync(this.tvInfoFile) === false) {
						fs.writeFile(this.tvInfoFile, JSON.stringify(data), (error) => {
							if (error) {
								this.log.debug('Device: %s, write tvInfoFile error: %s', this.host, error);
							} else {
								this.log.debug('Device: %s, saved tvInfoFile successfully.', this.host);
							}
						});
					} else {
						this.log.debug('Device: %s, tvInfoFile already exists, not saving!', this.host);
					}
				}
			});

			this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, data) => {
				if (!data || error || data.errorCode) {
					this.log.debug('Device: %s, get sw information error: %s', this.host, error);
				} else {
					delete data['returnValue'];
					this.log.debug('Device: %s, get sw information successful: %s', this.host,  JSON.stringify(data, null, 2));
				}
			});

			this.lgtv.request('ssap://api/getServiceList', (error, data) => {
				if (!data || error || data.errorCode) {
					this.log.debug('Device: %s, get service list error: %s', this.host, error);
				} else {
					delete data['returnValue'];
					this.log.debug('Device: %s, get service list successful: %s', this.host, JSON.stringify(data, null, 2));
				}
			});
		}, 100);
	}

	//Prepare TV service 
	prepereTvService() {
		// currently i save the tv info in a file and load if it exists
		let modelName = this.modelName;
		try {
			let infoArr = JSON.parse(fs.readFileSync(this.tvInfoFile));
			modelName = infoArr.modelName;
		} catch (error) {
			this.log.debug('Device: %s, tv info file does not exist, error: %s', this.host, error);
		}

		this.log.debug('prepereTvService');
		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', (inputIdentifier, callback) => {
				this.setInput(callback, this.inputReferences[inputIdentifier]);
			})
			.on('get', this.getInput.bind(this));

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerMode.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);
		this.prepereTvSpeakerService();
		this.prepareInputServices();
	}

	//Prepare speaker service
	prepereTvSpeakerService() {
		this.log.debug('prepereTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.volumeSelectorPress.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	//Prepare inputs services
	prepareInputServices() {
		this.log.debug('prepareInputServices');
		if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
			return;
		}

		if (Array.isArray(this.inputs) === false) {
			this.inputs = [this.inputs];
		}

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.inputsFile));
		} catch (err) {
			this.log.debug('Device: %s,  inputs file does not exist', this.host)
		}

		this.inputReferences = new Array();
		this.inputs.forEach((input, i) => {

			//get input reference
			let inputReference = null;

			if (input.reference !== undefined) {
				inputReference = input.reference;
			} else {
				inputReference = input;
			}

			//get input name		
			let inputName = inputReference;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else if (input.name) {
				inputName = input.name;
			}

			//if reference not null or empty add the input
			if (inputReference !== undefined && inputReference !== null && inputReference !== '') {
				inputReference = inputReference.replace(/\s/g, ''); // remove all white spaces from the string

				let tempInput = new Service.InputSource(inputReference, 'input' + i);
				tempInput
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tempInput
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (name, callback) => {
						this.inputs[inputReference] = name;
						fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
							if (error) {
								this.log.debug('Device: %s, can not write new Input name, error: %s', this.host, error);
							} else {
								this.log('Device: %s, saved new Input successfull, name: %s reference: %s', this.host, name, inputReference);
							}
						});
						callback()
					});
				this.tvAccesory.addService(tempInput);
				if (!tempInput.linked)
					this.tvService.addLinkedService(tempInput);
				this.inputReferences.push(inputReference);
			}

		});
	}

	getPowerState(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					let statusState = (data && data.state ? data.state : null);
					let statusProcessing = (data && data.processing ? data.processing : null);
					let statusPowerOnReason = (data && data.powerOnReason ? data.powerOnReason : null);
					let state = '';

					if (statusState) {
						state = true;
					}

					if (statusProcessing) {
						state = true;
					}

					if (statusPowerOnReason) {
						state = true;
					}

					if (statusState === 'Active Standby') {
						state = false;
						this.disconnect();
					}
					me.log('Device: %s, get current Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, get current Power state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setPowerState(state, callback) {
		var me = this;
		if (me.connectionStatus) {
			wol.wake(this.mac, { 'address': this.broadcastAdr }, function (error) {
				if (error) {
					me.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set new Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, set new Power state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	getMute(callback) {
		var me = this;
		this.lgtv.subscribe('ssap://audio/getStatus', function (error, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				var state = data.mute;
				me.log('Device: %s, get current Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
				callback(null, state);
			}
		});
	}

	setMute(state, callback) {
		var me = this;
		var newState = state ? true : false;
		this.lgtv.request('ssap://audio/setMute', { mute: newState }, function (error) {
			if (error) {
				me.log.debug('Device: %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				me.log('Device: %s, set new Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
				callback(null, state);
			}
		});
	}

	getVolume(callback) {
		var me = this;
		this.lgtv.subscribe('ssap://audio/getStatus', function (error, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				var volume = data.volume;
				me.log('Device: %s, get current Volume level successfull: %s', me.host, volume);
				callback(null, volume);
			}
		});
	}

	setVolume(volume, callback) {
		var me = this;
		var targetVolume = volume;
		this.lgtv.request('ssap://audio/setVolume', { volume: targetVolume }, function (error) {
			if (error) {
				me.log.debug('Device: %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				me.log('Device: %s, set new Volume level successfull: %s', me.host, targetVolume);
				callback(null, volume);
			}
		});
	}

	getInput(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					let inputReference = data.appId;
					for (let i = 0; i < me.inputReferences.length; i++) {
						if (inputReference === me.inputReferences[i]) {
							me.tvService
								.getCharacteristic(Characteristic.ActiveIdentifier)
								.updateValue(i);
							me.log('Device: %s, get current Input successfull: %s', me.host, inputReference);
						}
					}
					callback();
				}
			});
		} else {
			me.log('Device: %s, get current Input failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setInput(callback, inputReference) {
		var me = this;
		if (me.connectionStatus) {
			me.getInput(function (error, currentInputReference) {
				if (error) {
					me.log.debug('Device: %s, can not get current Input Reference. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					if (currentInputReference == inputReference) {
						callback(null, inputReference);
					} else {
						this.lgtv.request('ssap://system.launcher/launch', { id: inputReference }, function (error) {
							if (error) {
								me.log.debug('Device: %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, error);
								if (callback)
									callback(error);
							} else {
								me.log('Device: %s, set new Input successfull: %s', me.host, inputReference);
								if (callback)
									callback(null, inputReference);
							}
						});
					}
				}
			});
		} else {
			me.log('Device: %s, set new Input failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setPowerMode(callback, state) {
		var me = this;
		var command = this.menuButton ? 'INFO' : 'MENU';
		me.log('Device: %s, command: %s', me.host, command);
		this.sendRemoteControlCommand(command, callback);
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = 'UP';
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = 'DOWN';
				break;
		}
		me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	remoteKeyPress(remoteKey, callback) {
		var me = this;
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
				command = 'REWIND';
				break;
			case Characteristic.RemoteKey.FAST_FORWARD:
				command = 'FASTFORWARD';
				break;
			case Characteristic.RemoteKey.NEXT_TRACK:
				command = '';
				break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
				command = '';
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
				if (me.isPaused) {
					command = 'PLAY';
				} else {
					command = 'PAUSE';
				}
				me.isPaused = !this.isPaused;
				break;
			case Characteristic.RemoteKey.INFORMATION:
				command = '';
				break;
		}
		me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		if (me.connectionStatus) {
			if (command === 'CLICK') {
				this.pointerInputSocket.send('click');
			} else {
				this.pointerInputSocket.send('button', {
					name: command
				});
			}
			me.log('Device: %s, send RC command successfull: %s', me.host, command);
			callback(null, command);
		}
	}
};