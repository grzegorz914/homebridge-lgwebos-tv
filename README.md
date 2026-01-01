<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/lgwebos.png" width="540"></a>
</p>

<span align="center">

# Homebridge LG webOS TV

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://shields.io/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![npm](https://shields.io/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![npm](https://img.shields.io/npm/v/homebridge-lgwebos-tv/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Homebridge plugin for LG webOS.
Tested with OLED65G6V, 32LM6300PLA, 49SK8500, OLED65C7T, 55SK800PLB, OLED48CX, OLED48C2, OLED48C3.

</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) | [Homebridge UI Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge User Interface | Recommended |
| [LG webOS TV](https://www.npmjs.com/package/homebridge-lgwebos-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-lgwebos-tv/wiki) | Homebridge Plug-In | Required |

## Warning

* For plugin < v4.1.0 use Homebridge UI <= v5.5.0.
* For plugin >= v4.1.0 use Homebridge UI >= v5.13.0.

## Abut The Plugin

* Support SSL Web Socket for newer TV, plugin config `Advanced Settings >> Device >> SSL WebSocket`
* Power and Screen ON/OFF short press tile in HomeKit app.
* Media control is possible after you go to the RC app (iPhone/iPad).
* Speaker control with hardware buttons after you go to RC app (iPhone/iPad).
* Legacy Volume and Mute control is possible throught extra `Lightbulb / Fan` (slider).
* Inputs can be changed using Inputs selector in Home app, additionally with extra buttons.
* Channels can be changed using Channels selector in Home app, additionally with extra buttons.
* Brightness, Contrast, Backlight, Color, Picture Mode, Sound Mode and Sound Output can be changed using extra buttons.
* Siri can be used for all functions, some times need to create legacy buttons/switches/sensors.
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
* Install and use [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory `Name` to be displayed in `Homebridge/HomeKit`. |
| `host` | Here set the `Hsostname or Address IP` of TV. |
| `mac` | Here set the `Mac Address` of TV. |
| `displayType` | Accessory type to be displayed in Home app: `0 - None / Disabled`, `1 - Television` , `2 - TV Set Top Box`, `3 - TV Streaming Stick`, `4 - Audio Receiver`. |
| `inputs{}` | Inputs object. |
| `inputs.getFromDevice` | This enable load inputs and apps direct from device. |
| `inputs.filterSystemApps` | This enable filter sysem apps, only if `getFromDevice` is `true`. |
| `inputs.displayOrder` | Here select display order of the inputs list, `0 - None`, `1 - Ascending by Name`, `2 - Descending by Name`, `3 - Ascending by Reference`, `4 - Ascending by Reference`. |
| `inputs.data[].name` | Here set `Name` which You want expose to the `Homebridge/HomeKit`. |
| `inputs.data[].reference` | Here set `Reference`. `Live TV`, `HDMI 1`, `HDMI 2` are created by default. |
| `inputs.data[].mode` | Here select input mode, `0 - Input/App`, `1 - Live TV Channel`. |
| `buttons[]` | Buttons array. |
| `buttons[].displayType` | Here select display type in HomeKit app, possible `0 - None / Disabled`, `1 - Outlet`, `2 - Switch`.|
| `buttons[].name` | Here set `Name` which You want expose to the `Homebridge/HomeKit`. |
| `buttons[].mode` | Here select button mode, `0 - Input/App`, `1 - Live TV Channel`, `2 - Remote Control`. |
| `buttons[].reference` | Here set `Reference`, only for `Input/App` or `Live TV Channel` mode, in other case leave empty. |
| `buttons[].command` | Here select `Remote Control` command which will be assigned to the button. |
| `buttons[].namePrefix` | Here enable the accessory name as a prefix for button name.|
| `sensors[]` | Sensors array. |
| `sensors[].displayType` | Here choose the sensor type to be exposed in HomeKit app, possible `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `sensors[].mode` | Here choose the sensor mode, possible `0 - Input`, `1 - Power`, `2 - Volume`, `3 - Mute`, `4 - Sound Mode`, `5 - Sound Output`, `6 - Picture Mode`, `7 - Screen Off`, `8 - Screen Saver`, `9 - Pixel Refresh`, `10 - Play State`, `11 - Channel`. |
| `sensors[].name` | Here set own sensor `Name` which You want expose to the `Homebridge/HomeKit`. |
| `sensors[].reference` | Here set mode `Reference`, sensor fired on switch to this reference. |
| `sensors[].pulse` | Here enable sensor pulse, sensor send pulse and fired on every value change of selected mode. |
| `sensors[].namePrefix` | Here enable the accessory name as a prefix for sensor name. |
| `sensors[].level` | Here set `Level` between `0-100`, sensor fired on this level. |
| `picture{}` | Picture object. |
| `picture.brightnessControl` | This enable possibility adjust the Brightness. |
| `picture.backlightControl` | This enable possibility adjust the Backlight. |
| `picture.contrastControl` | This enable possibility adjust the Contrast. |
| `picture.colorControl` | This enable possibility adjust the Color. |
| `picture.modes[]`| Picture modes array, webOS >= 4.0. |
| `picture.modes[].displayType` | Here select display type in HomeKit app, possible `0 - None / Disabled`, `1 - Outlet`, `2 - Switch`.|
| `picture.modes[].name` | Here set own `Name` which You want expose to the `Homebridge/HomeKit` for this sensor. |
| `picture.modes[].reference` | Here select mode to be exposed in `Homebridge/HomeKit`. |
| `picture.modes[].namePrefix` | Here enable the accessory name as a prefix for picture mode.|
| `sound{}` | Sound object. |
| `sound.modes{}` | Sound mode object. |
| `sound.modes.data[]`| Sound modes array, webOS >= 6.0. |
| `sound.modes.data[].displayType` | Here select display type in HomeKit app, possible `0 - None / Disabled`, `1 - Outlet`, `2 - Switch`.|
| `sound.modes.data[].name` | Here set own `Name` which You want expose to the `Homebridge/HomeKit` for this sensor. |
| `sound.modes.data[].reference` | Here select mode to be exposed in `Homebridge/HomeKit`. |
| `sound.modes.data[].namePrefix` | Here enable the accessory name as a prefix for sound mode.|
| `sound.outputs{}` | Sound output object. |
| `sound.outputs.data[]`| Sound outputs array. |
| `sound.outputs.data[].displayType` | Here select display type in HomeKit app, possible `0 - None / Disabled`, `1 - Outlet`, `2 - Switch`.|
| `sound.outputs.data[].name` | Here set own `Name` which You want expose to the `Homebridge/HomeKit` for this sensor. |
| `sound.outputs.data[].reference` | Here select output to be exposed in `Homebridge/HomeKit`. |
| `sound.outputs.data[].namePrefix` | Here enable the accessory name as a prefix for sound output.|
| `screen{}` | Screen object. |
| `screen.turnOnOff` | This enable possibility turn the screen ON/OFF, webOS >= 4.0. |
| `screen.saverOnOff` | This enable possibility turn the screen saver ON/OFF, webOS >= 4.0. |
| `power{}` | Power object. |
| `power.broadcastAddress` | Her set network `Broadcast Address`, only if You use VLANS in Your network configuration and Your router/switch support IP Directed Broadcast, default is `255.255.255.255`. |
| `power.startInput` | This enable possibilty to set default Input/App after Power ON TV. |
| `power.startInputReference` | Here set the default Input/App reference. |
| `volume{}` | Volume object. |
| `volume.displayType` | Here choice what a additional volume control mode You want to use `0 - None / Disabled`, `1 - Lightbulb`, `2 - Fan`, `3 - TV Speaker (only hardware buttons on R.C. app)`, `4 - TV Speaker / Lightbulb`, `5 - TV Speaker / Fan`. |
| `volume.name` | Here set Your own volume control name or leave empty. |
| `volume.namePrefix` | Here enable the accessory name as a prefix for volume control name. |
| `sslWebSocket` | If enabled, SSL WebSocket will support TV with new firmware. |
| `disableTvService` | This disable TV service and prevent display double services if TV already support HomeKit native. |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `log{}` | Log object. |
| `log.deviceInfo` | If enabled, log device info will be displayed by every connections device to the network. |
| `log.success` | If enabled, success log will be displayed in console. |
| `log.info` | If enabled, info log will be displayed in console. |
| `log.warn` | If enabled, warn log will be displayed in console. |
| `log.error` | If enabled, error log will be displayed in console. |
| `log.debug` | If enabled, debug log will be displayed in console. |
| `restFul{}` | RESTFul object. |
| `restFul.enable` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFul.port` | Here set the listening `Port` for RESTful server. |
| `mqtt{}` | MQTT object. |
| `mqtt.enable` | If enabled, MQTT Broker will start automatically and publish all awailable PV data. |
| `mqtt.host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqtt.port` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqtt.clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqtt.prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqtt.auth{}` | MQTT authorization object. |
| `mqtt.auth.enable` | Here enable authorization for MQTT Broker. |
| `mqtt.auth.user` | Here set the MQTT Broker user. |
| `mqtt.auth.passwd` | Here set the MQTT Broker password. |
| `reference` | All can be found in `homebridge_directory/lgwebosTv`, `inputs_xxx` file, where `reference == id`, or `channels_xxx` file, where `reference == channelId`. |

### RESTFul Integration

* POST data as a JSON Object `{Power: true}`, content type must be `application/json`
* Path `status` response all available paths.
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
