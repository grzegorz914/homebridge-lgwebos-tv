<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/lgwebos.png" width="540"></a>
</p>

<span align="center">

# Homebridge LG webOS TV

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![npm](https://badgen.net/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![npm](https://img.shields.io/npm/v/homebridge-lgwebos-tv/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Homebridge plugin for LG webOS.
Tested with OLED65G6V, 32LM6300PLA, 49SK8500, OLED65C7T, 55SK800PLB, OLED48CX.

</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/homebridge/homebridge-config-ui-x) | [Config UI X Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [LG webOS TV](https://www.npmjs.com/package/homebridge-lgwebos-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-lgwebos-tv/wiki) | Homebridge Plug-In | Required |

## Abut The Plugin

* Power and Screen ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume and Mute control is possible throught extra `lightbulb`/`fan` (slider).
* Inputs can be changed using Inputs selector in HomeKit.app, additionally can create separate tile.
* Channels can be changed using Channels selector in HomeKit app, additionally can create separate tile.
* Brightness, Contrast, Backlight, Color, Picture Mode, Sound Mode and Sound Output can be changed using extra tile.
* Siri can be used for all functions, some times need create legacy buttons/switches/sensors.
* Automations can be used for all functions, some times need create legacy buttons/switches/sensors.
* Support external integrations, [RESTFul](https://github.com/grzegorz914/homebridge-lgwebos-tv?tab=readme-ov-file#restful-integration), [MQTT](https://github.com/grzegorz914/homebridge-lgwebos-tv?tab=readme-ov-file#mqtt-integration).

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/homekit.png" width="382"></a>
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/inputs.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/RC.png" width="135"></a>
</p>

## Configuration

* Please configure [LG Connect Apps](https://www.lg.com/au/support/product-help/CT20088015-1437132986635)
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of TV. |
| `mac` | Here set the *Mac Address* of TV. |
| `broadcastAddress` | Here set the *Broadcast address* of network interaface to send WOL packet, default is `255.255.255.255`. |
| `disableAccessory` | If enabled, the accessory will be disabled. |
| `getInputsFromDevice` | This enable load inputs and apps direct from device. |
| `filterSystemApps` | This enable filter sysem apps, only if `getInputsFromDevice` is `true`. |
| `disableLoadDefaultInputs` | This function disable load default inputs `Live TV`, `HDMI 1`, `HDMI 2` in to the inputs list. |
| `inputsDisplayOrder` | Here select display order of the inputs list, `0 - None`, `1 - Ascending by Name`, `2 - Descending by Name`, `3 - Ascending by Reference`, `4 - Ascending by Reference`.. |
| `inputs.name` | Here set *Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Here set *Reference*. `Live TV`, `HDMI 1`, `HDMI 2` are created by default. |
| `inputs.mode` | Here select input mode, `0 - Input/App`, `1 - Live TV Channel`. |
| `buttons.name` | Here set *Name* which You want expose to the *Homebridge/HomeKit*. |
| `buttons.mode` | Here select button mode, `0 - Input/App`, `1 - Live TV Channel`, `2 - Remote Control`. |
| `buttons.reference` | Here set *Reference*, only for `Input/App` or `Live TV Channel` mode, in other case leave empty. |
| `buttons.command` | Here select `Remote Control` command which will be assigned to the button. |
| `buttons.displayType` | Here select display type in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`.|
| `buttons.namePrefix` | Here enable/disable the accessory name as a prefix for button name.|
| `sensorPower`| If enabled, then the Power will be exposed as a `Contact Sensor`, fired if Power ON. |
| `sensorPixelRefresh`| If enabled, then the PoPixel Refresh will be exposed as a `Contact Sensor`, fired if Pixel Refresh ON. |
| `sensorVolume`| If enabled, then the Volume will be exposed as a `Contact Sensor`, fired on every Volume change. |
| `sensorMute`| If enabled, then the Mute will be exposed as a `Contact Sensor`, fired if Mmute ON. |
| `sensorInput`| If enabled, then the Input will be exposed as a `Contact Sensor`, fired on every Input change. |
| `sensorChannel`| If enabled, then the Channel will be exposed as a `Contact Sensor`, fired on every Channel change. |
| `sensorSoundMode`| If enabled, then the Sound Mode will be exposed as a `Contact Sensor`, fired on every Sound Mode change, webOS >= 6.0. |
| `sensorSoundOutput`| If enabled, then the Sound Output will be exposed as a `Contact Sensor`, ffired on every Sound Output change. |
| `sensorPictureMode`| If enabled, then the Picture Mode will be exposed as a `Contact Sensor`, fired on every Picture Mode change, webOS >= 4.0. |
| `sensorScreenOnOff`| If enabled, then the Screen On/Off will be exposed as a `Contact Sensor`, fired on Screen OFF, webOS >= 4.0. |
| `sensorScreenSaver`| If enabled, then the Screen Saver will be exposed as a `Contact Sensor`, fired on Screen Saver ON, webOS >= 4.0. |
| `sensorPlayState`| If enabled, then the Play State will be exposed as a `Contact Sensor`, fired on Playing, webOS >= 7.0. |
| `sensorInputs`| Her create custom Inputs sensor, sensors will be exposed as a `Contact Sensor`, fired if switch to it. |
| `sensorInputs.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `sensorInputs.reference` | Here set *Reference* like `com.webos.app.hdmi1` to be exposed as sensor (active on switch to this Input). |
| `sensorInputs.displayType` | Here select sensor type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `sensorInputs.namePrefix` | Here enable/disable the accessory name as a prefix for sensor name.|
| `pictureModeControl` | Here enable/disable control of picture mode, webOS >= 4.0. |
| `pictureModes.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `pictureModes.reference` | Here select mode to be exposed in *Homebridge/HomeKit*. |
| `pictureModes.displayType` | Here select display type in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`.|
| `pictureModes.namePrefix` | Here enable/disable the accessory name as a prefix for picture mode.|
| `soundModeControl` | Here enable/disable control of sound mode, webOS >= 6.0. |
| `soundModes.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `soundModes.reference` | Here select mode to be exposed in *Homebridge/HomeKit*. |
| `soundModes.displayType` | Here select display type in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`.|
| `soundModes.namePrefix` | Here enable/disable the accessory name as a prefix for sound mode.|
| `soundOutputControl` | Here enable/disable control of sound output. |
| `soundOutputs.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `soundOutputs.reference` | Here select output to be exposed in *Homebridge/HomeKit*. |
| `soundModes.displayType` | Here select display type in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`.|
| `soundOutputs.namePrefix` | Here enable/disable the accessory name as a prefix for sound output.|
| `volumeControlNamePrefix` | Here enable/disable the accessory name as a prefix for volume control name. |
| `volumeControlName` | Here set Your own volume control name or leave empty. |
| `volumeControl` | Here select volume control mode `0 - None/Disabled`, `1 - Slider`, `2 - Fan`. |
| `turnScreenOnOff` | This enable possibility turn the screen ON/OFF, webOS >= 4.0. |
| `turnScreenSaverOnOff` | This enable possibility turn the screen saver ON/OFF, webOS >= 4.0. |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `sslWebSocket` | If enabled, SSL WebSocket will support TV with new firmware. |
| `serviceMenu` | If enabled, service menu will be available from the input list. |
| `ezAdjustMenu` | If enabled, ez adjust menu will be available from the input list. |
| `disableTvService` | If enabled, TV service will be disabled and prevent display double services if TV already support HomeKit native. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogSuccess` | If enabled, disable logging device success. |
| `disableLogWarn` | If enabled, disable logging device warnings. |
| `disableLogError` | If enabled, disable logging device error. |
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `restFul` | This is RSTful server. |
| `enable` | If enabled, RESTful server will start automatically and respond to any path request. |
| `port` | Here set the listening `Port` for RESTful server. |
| `debug` | If enabled, deep log will be present in homebridge console for RESTFul server. |
| `mqtt` | This is MQTT Broker. |
| `enable` | If enabled, MQTT Broker will start automatically and publish all awailable PV data. |
| `host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `port` | Here set the `Port` for MQTT Broker, default 1883. |
| `clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `auth` | If enabled, MQTT Broker will use authorization credentials. |
| `user` | Here set the MQTT Broker user. |
| `passwd` | Here set the MQTT Broker password. |
| `debug` | If enabled, deep log will be present in homebridge console for MQTT. |
| `reference` | All can be found in `homebridge_directory/lgwebosTv`, `inputs_xxx` file, where `reference == id`, or `channels_xxx` file, where `reference == channelId`. |

### RESTFul Integration

* POST data as a JSON Object `{Power: true}`, content type must be `application/json`
* References:
  * Picture Mode - `cinema`, `eco`, `expert1`, `expert2`, `game`, `normal`, `photo`, `sports`, `technicolor`, `vivid`, `hdrEffect`, `hdrFilmMaker`, `hdrCinema`, `hdrCinemaBright`, `hdrStandard`, `hdrEffect`, `hdrGame`, `hdrVivid`, `hdrTechnicolor`, `hdrExternal`, `dolbyHdrCinema`, `dolbyHdrCinemaBright`, `dolbyHdrDarkAmazon`, `dolbyHdrStandard`, `dolbyHdrGame`, `dolbyHdrVivid`.
  * Sound Mode - `aiSoundPlus`, `standard`, `movie`, `clearVoice`, `news`, `sport`, `music`, `game`.
  * Sound Output - `tv_speaker`, `external_speaker`, `external_optical`, `external_arc`, `lineout`, `headphone`, `tv_external_speaker`, `tv_external_headphone`, `bt_soundbar`, `soundbar`.

| Method | URL | Path | Response | Type |
| --- | --- | --- | --- | --- |
| GET | `http//ip:port` | `systeminfo`, `softwareinfo`, `channels`, `apps`, `power`, `audio`, `currentapp`, `currentchannel`, `picturesettings`, `soundmode`, `soundoutput`, `externalinputlist`, `mediainfo`. | `{"state": Active}` | JSON object. |

| Method | URL | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Power state. |
|      | `http//ip:port` | `Input` | `input reference` | string | Set input. |
|      | `http//ip:port` | `Channel` | `channel reference` | string | Set channel. |
|      | `http//ip:port` | `Volume` | `100` | integer | Set volume. |
|      | `http//ip:port` | `Mute` | `true`, `false` | boolean | Set mute. |
|      | `http//ip:port` | `Brightness` | `100` | integer | Set brightness. |
|      | `http//ip:port` | `Backlight` | `100` | integer | Set backlight. |
|      | `http//ip:port` | `Contrast` | `100` | integer | Set contrast. |
|      | `http//ip:port` | `Color` | `100` | integer | Set color. |
|      | `http//ip:port` | `PictureMode` | `picture mode reference` | string | Set picture mode. |
|      | `http//ip:port` | `SoundMode` | `sound mode reference` | string | Set sound mode. |
|      | `http//ip:port` | `SoundOutput` | `sound output reference` | string | Set sound output. |
|      | `http//ip:port` | `PlayState` | `play`, `pause` | string | Set media play state. |
|      | `http//ip:port` | `RcControl` | `REWIND` | string | Send RC command. |

### MQTT Integration

* Subscribe data as a JSON Object `{Power: true}`
* References:
  * Picture Mode - `cinema`, `eco`, `expert1`, `expert2`, `game`, `normal`, `photo`, `sports`, `technicolor`, `vivid`, `hdrEffect`, `hdrFilmMaker`, `hdrCinema`, `hdrCinemaBright`, `hdrStandard`, `hdrEffect`, `hdrGame`, `hdrVivid`, `hdrTechnicolor`, `hdrExternal`, `dolbyHdrCinema`, `dolbyHdrCinemaBright`, `dolbyHdrDarkAmazon`, `dolbyHdrStandard`, `dolbyHdrGame`, `dolbyHdrVivid`.
  * Sound Mode - `aiSoundPlus`, `standard`, `movie`, `clearVoice`, `news`, `sport`, `music`, `game`.
  * Sound Output - `tv_speaker`, `external_speaker`, `external_optical`, `external_arc`, `lineout`, `headphone`, `tv_external_speaker`, `tv_external_headphone`, `bt_soundbar`, `soundbar`.

| Method | Topic | Message | Type |
| --- | --- | --- | --- |
| Publish | `System Info`, `Software Info`, `Channels`, `Apps`, `Power`, `Audio`, `Current App`, `Current Channel`, `Picture Settings`, `Sound Mode`, `Sound Output`, `External Input List`, `Media Info` | `{"state": Active}` | JSON object. |

| Method | Topic | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Subscribe | `Set` | `Power` | `true`, `false` | boolean | Power state. |
|           | `Set` | `Input` | `input reference` | string | Set input. |
|           | `Set` | `Channel` | `channel reference` | string | Set channel. |
|           | `Set` | `Volume` | `100` | integer | Set volume. |
|           | `Set` | `Mute` | `true`, `false` | boolean | Set mute. |
|           | `Set` | `Brightness` | `100` | integer | Set brightness. |
|           | `Set` | `Backlight` | `100` | integer | Set backlight. |
|           | `Set` | `Contrast` | `100` | integer | Set contrast. |
|           | `Set` | `Color` | `100` | integer | Set color. |
|           | `Set` | `PictureMode` | `picture mode reference` | string | Set picture mode. |
|           | `Set` | `SoundMode` | `sound mode reference` | string | Set sound mode. |
|           | `Set` | `SoundOutput` | `sound output reference` | string | Set sound output. |
|           | `Set` | `PlayState` | `play`, `pause` | string | Set media play state. |
|           | `Set` | `RcControl` | `REWIND` | string | Send RC command. |
