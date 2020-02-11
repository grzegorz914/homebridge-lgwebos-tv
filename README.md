# homebridge-lgwebos-tv
[![npm](https://img.shields.io/npm/dt/homebridge-lgwebos-tv.svg)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![npm](https://img.shields.io/npm/v/homebridge-lgwebos-tv.svg)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Plugin to control LG WebOs TV in HomeKit as a TV service.
Tested with LGOLED65G6V.
Present as TV service, schange inputs, volume/mute control, power control.

HomeBridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install homebridge-lgwebos-tv using: npm install -g homebridge-lgwebos-tv
3. Update your configuration file. See sample-config.json in this repository for a sample. 

# Configuration

 <pre>
{
    "platform": "LgWebOsTv",
    "devices": [
        {
            "name": "LG TV",
            "host": "192.168.1.8",
            "mac": "ab:cd:ef:fe:dc:ba",
            "switchInfoMenu": true,
            "inputs": [
                {
                    "name": "Live TV",
                    "reference": "com.webos.app.livetv"
                },
                {
                    "name": "HDMI 1",
                    "reference": "com.webos.app.hdmi1"
                },
                {
                    "name": "HDMI 2",
                    "reference": "com.webos.app.hdmi2"
                },
                {
                    "name": "HDMI 3",
                    "reference": "com.webos.app.hdmi3"
                },
                {
                    "name": "HDMI 4",
                    "reference": "com.webos.app.hdmi4"
                },
                {
                    "name": "Netflix",
                    "reference": "netflix",
                },
                {
                    "name": "YouTube",
                    "reference": "youtube.leanback.v4"
                },
                {
                    "name": "LG Store",
                    "reference": "com.webos.app.discovery"
                }
            ]
        }
    ]
}
</pre>

# Limitations:

# Whats new:
https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/CHANGELOG.md
