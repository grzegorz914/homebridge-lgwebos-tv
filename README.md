<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/lgwebos.png" height="140"></a>
</p>

<span align="center">

# Homebridge LG webOS TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![npm](https://badgen.net/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Homebridge plugin to control LG webOS TV in HomeKit as TV service. Tested with LGOLED65G6V, 32LM6300PLA, LG49SK8500.

</span>

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-lgwebos-tv using: `npm install -g homebridge-lgwebos-tv` or search for `Lgwebos TV` in Config UI X.

## Know issues
1. If use with Hoobs possible config incompatibilty.

## HomeKit pairing
1. Each accessories needs to be manually paired. 
2. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
3. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
4. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Info
1. Power ON/OFF short press tile in HomeKit app.
2. RC/Media control is possible after you go to the RC app on iPhone/iPad.
3. Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
4. Legacy volume and mute control is possible throught extra `lightbulb` (slider) or using Siri `Volume Service`.
5. Inputs can be changed after loong press tile in HomeKit app and select from the list.
6. Siri control.


<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/homekit.png" height="300"></a> 
  </p>
  <p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/inputs.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/RC.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/rc1.png" height="300"></a>
</p>

## Configuration TV
1. [Please configure LG Connect Apps](https://www.lg.com/ca_en/support/product-help/CT20098005-1437129879355-others)

## Configuration plugin
1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
2. All inputs reference and name can be found in: `homebridge_directory/lgwebosTv/apps_19216818` where `name == title` and `reference == id`
3. In `refreshInterval` set the data refresh time in seconds, default 5sec.
4. If `disableLogInfo` is enabled, disable log info, all values and state will not be displayed in Homebridge log console.
5. In `volumeControl` You can select what a additional volume control type You want to use (None, Slider, Fan). This not working with HDMI ARC control.
6. If `switchInfoMenu` is enabled, `I` button change its behaviour in RC app between Menu and INFO.
7. In `type` select source input type.
8. In `mode` select what a input mode You defined, select `Apps` if You defined some input reference, select `Live TV` if You defined channel reference.
9. `manufacturer`, `model`, `serialNumber`, `firmwareRevision` - optional branding data displayed in Home.app

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/ustawienia.png" height="150"></a>
</p>

```json
{
    "platform": "LgWebOsTv",
    "devices": [
        {
            "name": "LG TV",
            "host": "192.168.1.8",
            "mac": "ab:cd:ef:fe:dc:ba",
            "refreshInterval": 5,
            "disableLogInfo": false,
            "volumeControl": 0,
            "switchInfoMenu": false,
            "inputs": [
                   {
                      "name": "Live TV",
                      "reference": "com.webos.app.livetv",
                      "type": "TUNER",
                      "mode": 0
                  },
                  {
                      "name": "HDMI 1",
                      "reference": "com.webos.app.hdmi1",
                      "type": "HDMI",
                      "mode": 0
                 },
                 {
                      "name": "HDMI 2",
                      "reference": "com.webos.app.hdmi2",
                      "type": "HDMI",
                      "mode": 0
                },
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
                    "name": "YouTube",
                    "reference": "youtube.leanback.v4",
                    "type": "APPLICATION",
                    "mode": 0
                },
                {
                    "name": "LG Store",
                    "reference": "com.webos.app.discovery",
                    "type": "APPLICATION",
                    "mode": 0
                },
                {
                    "name": "HotBird 4K1",
                    "reference": "7_30_585_0_700_17_318",
                    "type": "TUNER",
                    "mode": 1
                }
            ],
          "manufacturer": "Manufacturer",
          "modelName": "Model",
          "serialNumber": "Serial Number",
          "firmwareRevision": "Firmware Revision"
        }
    ]
}
```

## Limitations
1. Due to HomeKit app limitation max. services for 1 accessory is 100. Over this value HomeKit app will no response. As services in this accessory are, (1.information service, 2.speaker service, 3.lightbulb service, 4.television service and inputs service 5-100(where every input = 1 service)). If all services are enabled possible inputs to use is 96.

## Whats new:
https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/CHANGELOG.md

## Development
- Pull request and help in development highly appreciated.
