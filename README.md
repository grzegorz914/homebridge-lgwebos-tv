<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/lgwebos.png" width="540"></a>
</p>

<span align="center">

# Homebridge LG webOS TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![npm](https://badgen.net/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Homebridge plugin for LG webOS. 
Tested with OLED65G6V, 32LM6300PLA, 49SK8500, OLED65C7T, 55SK800PLB, OLED48CX.

</span>

## Package Requirements
| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Web User Interface | Recommended |
| [LG webOS TV](https://www.npmjs.com/package/homebridge-lgwebos-tv) | `npm install -g homebridge-lgwebos-tv` | Plug-In | Required |

## Note
* Versin 1.7.0 and above need to be used with Homebridge min. v1.3.x.

## Know issues
* If use with Hoobs possible config incompatibilty.

# Troubleshoot
* If for some reason the device will not be displayed in Home app try this procedure:
   * Go to `./homebridge/persist`
   * Open the file `AccessoryInfo.xxx` one by one and remove only this one which contain Your device data, something like this: `{"displayName":"LG","category":34}`
   * Also remove the file `IdentifierCashe.xxx` with same name as `AccessoryInfo.xxx`
   * Restart Homebridge and try add it to the Home app again.

## Features and How To Use Them
* Power and Screen ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app.
* Speaker control is possible after you go to RC app and use hardware buttons.
* Legacy Volume and Mute control is possible throught extra `lightbulb`/`fan` (slider).
* Inputs can be changed after long press tile and select from the list.
* Channels can be changed after long press tile and select from the list.
* Siri can be used for all functions through created extra buttons.
* Home automations and shortcuts can be used for all functions.


<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/homekit.png" width="382"></a> 
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/inputs.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/RC.png" width="135"></a>
</p>

## Configuration
[First please configure LG Connect Apps](https://www.lg.com/ca_en/support/product-help/CT20098005-1437129879355-others)

Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) plugin to configure this plugin (Highly Recommended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of TV. |
| `mac` | Here set the *Mac Address* of TV. |
| `disableLogInfo` | This disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `enableDebugMode` | This enable deep log in homebridge console. |
| `volumeControl` | Here select volume control mode `None`, `Slider`, `Fan`. |
| `switchInfoMenu` | This switch the behaviour of `I` button in RC app between Menu and Home. |
| `getInputsFromDevice` | This enable load inputs and apps direct from device. |
| `filterSystemApps` | This enable filter sysem apps, only if `getInputsFromDevice` is `true`. |
| `turnScreenOnOff` | This enable possibility turn the screen ON/OFF, only for webOS >= 4.0. |
| `inputs.name` | Here set *Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Here set *Reference*. `Live TV`, `HDMI 1`, `HDMI 2` are created by default. | 
| `inputs.type` | Here select source input type. |
| `inputs.mode` | Here select input mode, `Input/App`, `Live TV Channel`. |
| `buttons.name` | Here set *Name* which You want expose to the *Homebridge/HomeKit*. | 
| `buttons.mode` | Here select button mode, `Input/App`, `Live TV Channel` or `Remote Control`. |
| `buttons.reference` | Here set *Reference*, only for `Input/App` or `Live TV Channel` mode, in other case leave empty. | 
| `buttons.command` | Here select `Remote Control` command which will be assigned to the button. |
| `buttons.displayType` | Here select display type in Home app, possible `Switch`, `Button` - selectable in Home app as Light, Fan, Outlet.|
| `manufacturer`, `modelName`, `serialNumber`, `firmwareRevision` | Free-form informational data that will be displayed in the Home.app. |
| `reference` | All can be found in `homebridge_directory/lgwebosTv`, `inputs_xxx` file, where `reference == id`, or `channels_xxx` file, where `reference == channelId`. | Info |

```json
{
    "platform": "LgWebOsTv",
    "devices": [
        {
            "name": "LG TV",
            "host": "192.168.1.8",
            "mac": "ab:cd:ef:fe:dc:ba",
            "disableLogInfo": false,
            "disableLogDeviceInfo": false,
            "enableDebugMode": false,
            "volumeControl": 0,
            "switchInfoMenu": false,
            "getInputsFromDevice": false,
            "filterSystemApps": false,
            "turnScreenOnOff": false,
            "inputs": [
                {
                    "name": "HDMI 3",
                    "reference": "com.webos.app.hdmi3",
                    "type": "HDMI",
                    "mode": 0
                },
                {
                    "name": "HDMI 4",
                    "reference": "com.webos.app.hdmi4",
                    "type": "HDMI",
                    "mode": 0
                },
                {
                    "name": "Netflix",
                    "reference": "netflix",
                    "type": "APPLICATION",
                    "mode": 0
                },
                {
                    "name": "BBC ONE HD",
                    "reference": "1_45_101_101_16521_17540_9018",
                    "mode": 1
                }
           ],
           "buttons": [{
                    "name": "HDMI 3",
                    "reference": "com.webos.app.hdmi3",
                    "mode": 0,
                    "displayType": 0
               },
               {
                    "name": "BBC ONE HD",
                    "reference": "1_45_101_101_16521_17540_9018",
                    "mode": 1,
                    "displayType": 0
               },
               {
                    "name": "Menu Up",
                    "mode": 2,
                    "command": "UP",
                    "displayType": 0
               }
          ]
        }
    ]
}
```

## Adding to HomeKit
Each accessory needs to be manually paired. 
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' width='16.42px'> app on your device. 
2. Tap the <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' width='16.42px'>. 
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan* or *More Options*. 
4. Select Your accessory. 
5. Enter the Homebridge PIN or scan the QR code, this can be found in Homebridge UI or Homebridge logs.
6. Complete the accessory setup.

## Limitations
* That maximum Services for 1 accessory is 100. If Services > 100, accessory stop responding.
* To solved this problem the plugin couts the number of Services and not allow add more as 100.
* If You have configured more as 100 Services some inputs or button will not be available in the Home app.
* The Services in this accessory are:
  * Information.
  * Speaker.
  * Lightbulb.
  * Fan.
  * Television.
  * Inputs, which may range from 6 to 100 as each input is 1 service.
  * Buttons, which may range from 6 to 100 as each button is 1 service.

## [What's New](https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/CHANGELOG.md)

## Development
* Pull request and help in development highly appreciated.
