# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

### After update to v3.0.0 RESTFull and MQTT config settings need to be updated

## [3.6.4] - (07.02.2025)

## Changes

- stability and improvements

## [3.6.3] - (02.06.2025)

## Changes

- fix HAP-NodeJS WARNING: The accessory has an invalid 'Name' characteristic 'configuredName'
- Please use only alphanumeric, space, and apostrophe characters
- Ensure it starts and ends with an alphabetic or numeric character, and avoid emojis

## [3.6.2] - (04.02.2025)

## Changes

- update RESTFul

## [3.6.0] - (18.01.2025)

## Changes

- added media play state sensor
- added media info to MQTT and RESTFul

## [3.5.6] - (16.01.2025)

## Changes

- functions reorder

## [3.5.4] - (15.01.2025)

## Changes

- prevent publish accessory if required data not found
- cleanup

## [3.5.0] - (15.01.2025)

## Changes

- added possibility to disable/enable log success, info, warn, error
- bump dependencies
- config schema updated
- redme updated
- cleanup

## [3.4.11] - (09.01.2025)

## Changes

- some minor fixes

## [3.4.10] - (08.01.2025)

## Changes

- fix update data on first run

## [3.4.9] - (08.01.2025)

## Changes

- connect code refactor
- cleanup

## [3.4.8] - (06.01.2025)

## Changes

- fix [#237](7https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/237)
- bump dependencies
- redme update
- config schema updated
- cleanup

## [3.4.0] - (01.12.2024)

## Changes

- move from commonJS to esm module
- moved constants.json to constants.js
- cleanup

## [3.3.0] - (18.11.2024)

## Changes

- fix/enhancement [#223](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/223)
- config schema updated
- cleanup

## [3.2.0] - (26.10.2024)

## Changes

- add config validation
- add reconnect if fail on first run
- fix start external integrations
- config schema updated
- cleanup

## [3.1.1] - (25.08.2024)

## Changes

- fix [#220](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/220)
- cleanup

## [3.1.0] - (23.08.2024)

## Changes

- add control over RESTFul POST JSON Object
- bump dependencies
- cleanup

## [3.0.4] - (18.08.2024)

## Changes

- fix correct catch error

## [3.0.0] - (14.08.2024)

## Changes

- hide passwords by typing and display in Config UI
- remove return duplicate promises from whole code
- bump dependencies
- cleanup

## [2.20.0] - (04.08.2024)

## Changes

- added possiblity to set own volume control name and enable/disable prefix
- config schema updated
- bump dependencies
- cleanup

## [2.19.0] - (19.05.2024)

## Changes

- added support for service menu access from the input list
- added support for ez adjust menu access from the input list
- config schema updated
- cleanup

## [2.18.0] - (18.05.2024)

## Changes

- added support to control brightness, backlight, contrast, color, picture mode, sound mode, sound output over MQTT
- added support to anable/disable/display type for indyvidual sound and picture mode
- added sound output sensor
- added sound output control
- fixed screen off button state
- updated MQTT and RESTFul
- config schema updated
- cleanup

## [2.17.0] - (04.03.2024)

## Changes

- added support to subscribe MQTT and control device
- config schema updated
- cleanup

## [2.16.0] - (01.01.2023)

## Changes

- added possibility to disable prefix name for buttons, sensors, picture meodes and sound modes
- config schema updated
- cleanup

## [2.15.0] - (29.12.2023)

## Changes

- added possibility to select display inputs order, possible by `None`, `Alphabetically Name`, `Alphabetically Reference`
- config schema updated
- cleanup

## [2.14.0] - (05.11.2023)

## Changes

- added possibility to disable load defaults inputs
- fix screen on/off [#177](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/177)
- fix plugin stopped responding after some times [#170](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/170)
- config schema updated
- cleanup

## [2.12.0] - (05.09.2023)

## Changes

- added pixel refresh sensor
- added picture mode sensor
- fix sound mode sensor

## [2.11.0] - (29.07.2023)

## Changes

- added RESTFul server
- fixed MQTT prefix
- code refactor and cleanup
- config.schema updated
- fixed some minor issues

## [2.10.0] - (12.06.2023)

## Changes

- decrease heartbeat time [#172](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/172)
- added possibilty to disable TV services [#169](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/169)
- config.schema updated
- cleanup

## [2.9.1] - (27.03.2023)

## Changes

- fixed [#165](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/165)
- added Sound Mode Contact Sensor, only for webOS >= 6.0
- config.schema updated
- cleanup

## [2.9.0] - (26.03.2023)

## Changes

- added sound mode control, only for webOS >= 6.0
- config.schema updated
- cleanup

## [2.8.0] - (14.02.2023)

## Changes

- rbuild code of specjal socket client to better RC performance
- config.schema updated
- stability and performance improvements
- cleanup

## [2.7.0] - (13.02.2023)

## Changes

- standarize function of display type and volume control, now volume control -1 None/Disabled, 0 Slider, 1 Fan, please see in readme
- removed inputs.type, not used anymore
- config.schema updated
- fix expose extra input tile in homekit app
- other small fixes and improvements
- cleanup

## [2.6.0] - (09.02.2023)

## Changes

- added heartbeat to keep alive sockets
- logging message updated
- cleanup

## [2.5.0] - (24.01.2023)

## Changes

- enchancement [#156](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/156)
- config.schema updated
- cleanup

## [2.4.5] - (14.01.2023)

## Changes

- fix sensor volume

## [2.4.4] - (14.01.2023)

## Changes

- correct some debug info and mqtt topics
- fix create ssl client

## [2.4.3] - (14.01.2023)

## Changes

- added Channel Motion Sensor for use with automations (every Channel change report motion)
- config.schema updated

## [2.4.2] - (14.01.2023)

## Changes

- fix state update after restart
- code cleanup

## [2.4.1] - (14.01.2023)

## Changes

- added Input Motion Sensor for use with automations (every Input change report motion)
- config.schema updated

## [2.4.0] - (14.01.2023)

## Changes

- change websocket library to ws
- added SSL for WebSocket, TV with new firmware
- fix [#151](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/151)
- config schema updated
- code refactor

## [2.3.6] - (04.01.2023)

## Changes

- fix save target visibility
- fix save custom names

## [2.3.3] - (31.12.2022)

## Changes

- dynamic update accessory information

## [2.3.1] - (18.12.2022)

## Changes

- fix [#146](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/146)

## [2.3.0] - (18.12.2022)

## Changes

- enhancement [#145](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/145)
- added Power Motion Sensor for use with automations
- added Volume Motion Sensor for use with automations (every volume change report motion)
- added Mute Motion Sensor for use with automations
- added Screen On/Off Motion Sensor for use with automations
- added Screen Saver Motion Sensor for use with automations
- config.schema updated
- other small fixes

 [2.2.7] - (20.10.2022)

## Changes

- fix client.close

 [2.2.6] - (27.09.2022)

## Changes

- fix [#139](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/139)

 [2.2.5] - (14.09.2022)

## Changes

- bump dependencies
- fix read device model in some specific situations

 [2.2.4] - (10.09.2022)

## Changes

- cleanup

 [2.2.3] - (04.09.2022)

## Changes

- fix turn screen on/off for webOs <= 5

## [2.2.2] - (03.09.2022)

## Changes

- cleanup
- fix [#138](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/138)

## [2.2.0] - (28.08.2022)

## Changes

- cleanup
- added picture control (backlight, brightness, contrast, color)
- fix [#136](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/136)
- fix [#109](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/109)

## [2.1.5] - (22.08.2022)

## Changes

- fix error if apps list unknown
- fix error if channels list unknown
- fix screen on/off for webOs >= 5

## [2.1.4] - (18.08.2022)

## Changes

- fix special soccket reconnect

## [2.1.3] - (18.08.2022)

## Changes

- fix reconnect error

## [2.1.2] - (18.08.2022)

## Changes

- fix update device state after first pairing
- performance and stability improvement
- log corrections

## [2.1.1] - (14.08.2022)

## Changes

- performance and stability improvement
- rebuild debug log
- prevent publish accessory if payring key not exist or removed

## [2.1.0] - (13.08.2022)

## Changes

- rebuild power state and screen state identify
- rebuild debug log

## [2.0.4] - (10.08.2022)

## Changes

- remove outdated code
- performance and stability improvements

## [2.0.3] - (10.08.2022)

## Changes

- fix data update

## [2.0.2] - (09.08.2022)

## Changes

- fix data update

## [2.0.0] - (08.08.2022)

## Changes

- full code refactor
- stability improvements
- response improvemets

## [1.11.9] - (06.08.2022)

## Changes

- fix [#124](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/124)

## [1.11.8] - (23.07.2022)

## Changes

- refactor information service

## [1.11.7] - (13.06.2022)

## Changes

- fix [#130](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/130)

## [1.11.6] - (05.05.2022)

## Changes

- fix [#127](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues/127)
- more debug logging

## [1.11.5] - (25.04.2022)

## Changes

- refactor debug and info log
- refactor mqtt message

## [1.11.4] - (24.04.2022)

## Changes

- fix PowerModeSelection
- update config.schema.json

## [1.11.2] - (27.02.2022)

## Changes

- fix Info button in RC

## [1.11.1] - (22.02.2022)

## Added

- possibility to set custom command for Info button in RC

## [1.11.0] - (18.02.2022)

## Added

- MQTT Client, publish all device data

## Changes

- update dependencies
- code refactor

## [1.10.14] - (16.01.2022)

### Fixed

- wrog power state report if disconnected from net

## [1.10.14] - (16.01.2022)

### Changs

- code cleanup
- update config.schema

### Fixed

- services calculation count
- start input with automations/scenes

## [1.10.12/13] - (08.01.2022)

### Changed

- rebuild device info read and write

## [1.10.11] - (03.01.2022)

### Added

- ability to disable log device info by every connections device to the network (Advanced Section)

## [1.10.10] - (29.12.2021)

- prevent load plugin if host or mac not set
- prepare directory and files synchronously

## [1.10.9] - (28.12.2021)

- update node minimum requirements

## [1.10.8] - (28.12.2021)

### Added

- Selectable display type of buttons in HomeKit app

## [1.10.7] - (27.12.2021)

## Changes

- remove branding
- fixed characteristic warning volume

## [1.10.6] - (23.12.2021)

## Changes

- fixed RC Socket reconnect

## [1.10.5] - (19.12.2021)

## Changes

- added possibility turn ON/OFF the screen for webOS >= 4.0
- fixed power mode selection
- fixed set mute

## [1.10.0] - (18.12.2021)

## Changes

- added RC and Volume control as a button
- added correct power state report if screen is Off
- stability and performance improvements

## [1.9.41] - (14.12.2021)

## Changes

- removed refreshInterval

## [1.9.39] - (13.12.2021)

## Changes

- fixed wrong power state if tv lose connection to net
- added debug mode

## [1.9.37] - (10.12.2021)

## Changes

- code rebuild
- stability and performance improvements

## [1.9.36] - (28.11.2021)

## Changes

- code rebuild
- stability and performance improvements
- prepare for extends new functionality in next release

## [1.9.35] - (28.11.2021)

## Changes

- stability improvement

## [1.9.30] - (31.10.2021)

## Changes

- stability improvement

## [1.9.23] - (19.10.2021)

## Changes

- code cleanup and rebuild
- performance improvements
- prepare for new functionality

## [1.9.19] - (05.10.2021)

## Changes

- code cleanup

## [1.9.16] - (01.10.2021)

## Changes

- fixed SIGBUS crash and other improvements

## [1.9.15] - (26.09.2021)

## Changes

- config.schema update

## [1.9.14] - (24.09.2021)

## Changes

- code cleanup
- updated ES5 to ES6
- updated config.schema

## [1.9.13] - (24.09.2021)

## Changes

- code cleanup

## [1.9.11] - (14.09.2021)

## Changes

- code cleanup

## [1.9.10] - (06.09.2021)

## Changes

- extend filters
- updated config.schema

## [1.9.9] - (05.09.2021)

## Changes

- extend filter possibility
- updated config.schema
- code cleanup

## [1.9.3] - (02.09.2021)

## Changes

- add more filter for unnecesared inputs from inputs list if load inputs list from device

## [1.9.2] - (02.09.2021)

## Changes

- filter unnecesared inputs from inputs list if load inputs list from device

## [1.9.0] - (31.08.2021)

## Changes

- code refactorin
- removed not nedded library
- added load inputs list from device
- added default inputs Live TV, HDMI1, HDMI2, no need to create it in config
- many small changes and stability improvements

## [1.7.0] - (22.02.2021)

## Changes

- code rebuild, use Characteristic.onSet/onGet
- require Homebridge 1.3.x or above

## [1.6.6] - (06.01.2021)

## Changs

- remove unused dependencies

## [1.6.3] - (20.11.2020)

## Changs

- fixed slow response on RC control

## [1.6.0] - (29.09.2020)

## Changs

- always check installed app
- code refactoring
- update config.schema

## [1.4.0] - (14.09.2020)

## Changs

- changes in updateDeviceState

## [1.3.0] - (14.09.2020)

## Changs

- added refreshInterval, default 5sec

## [1.1.0] - (06.09.2020)

## Changs

- completely reconfigured layout of config schema

## [1.0.0] - (28.06.2020)

### Added

- release version.

## [0.12.0] - (08.06.2020)

### Added

- added possibility to switch LiveTV channels from the inputs list

### Fixed

- other fixes

## [0.11.0] - (23.05.2020)

### Added

- added possibility to select what a type of extra volume control You want to use (None, Slider, Fan)

## [0.10.40] - (22.05.2020)

### Fixed

- fixed RC control
- other improvements

## [0.10.0] - (20.05.2020)

### Added

- added mute ON/OFF to the slider volume

## [0.9.101] - (18.05.2020)

### Fixed

- fixed bug in RC control
- fixed power state

## [0.9.75] - (17.05.2020)

### Fixed

- fixed switch input if start with scene or automation

## [0.9.65] - (16.05.2020)

### Fixed

- fixed power state

## [0.9.10] - (14.05.2020)

### Added

- added descriptions in config.schema.json

## [0.9.8] - (14.05.2020)

- revert back with defaults inputs
- added input type to inputs
- added other fixes in code to prevent app crash without configured inputs

## [0.9.0] - (14.05.2020)

- added Types to the inputs references (please update Yours config.json)
- do not add or remove if exist from the config.json default inputs which are now contain in the code

### [Default inputs

                {
                    "name": "Live TV",
                    "reference": "com.webos.app.livetv",
                    "type": "TUNER"
                },
                {
                    "name": "HDMI 1",
                    "reference": "com.webos.app.hdmi1",
                    "type": "HDMI"
                },
                {
                    "name": "HDMI 2",
                    "reference": "com.webos.app.hdmi2",
                    "type": "HDMI"
                }

## [0.8.0] - (10.05.2020)

- code cleanup

## [0.7.0] - (06.05.2020)

- adapted to HAP-Node JS lib

## [0.5.57] - (06.05.2020)

- code cleanup

## [0.5.50] - (05.05.2020)

- fixes and performance inprovements
- correted logging state

## [0.5.16] - (05.05.2020)

- added real time read and write data for (lightbulb slider volume cont

## [0.5.0] - (01.05.2020)

- added support for webOS < 2.5.0 (please update Your config.json)

## [0.4.4] - (01.05.2020)

- fixes in real time data read and write

## [0.4.0] - (30.04.2020)

- added realtime data read and write

## [0.3.4] - (27.04.2020)

- added switch ON/OFF volume control (please update config.json)

## [0.3.0] - (26.04.2020)

- add Siri volume control
- add Slider] - (Brightness) volume control

## [0.2.112] - (21.04.2020)

- different fixes.

## [0.2.97] - (07.04.2020)

- fixed store of positin in HomeKit fav.

## [0.2.96] - (06.04.2020)

- name corrections in TV information files

## [0.2.95] - (05.04.2020)

- read and store appListFile from TV

## [0.2.93] - (05.04.2020)

- read and store serListFile from TV
- update README.md
- update sample-config.json

## [0.2.91] - (29.03.2020)

- fixes crash if no device name defined
- fixed config.schema.json
- fixed store file inside the Homebridge directory

## [0.2.90] - (29.03.2020)

- some small fixes

## [0.2.77] - (21.03.2020)

- corrections for homebridge git
- performance improvement

## [0.2.1] - (16.02.2020)

- fixed most bugs
- performance improvements
- code cleanup

## [0.0.1] - (10.02.2020)

- initial release
