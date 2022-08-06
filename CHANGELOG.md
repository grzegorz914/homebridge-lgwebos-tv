# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

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
-  rebuild device info read and write

## [1.10.11] - (03.01.2022)
### Added
-  ability to disable log device info by every connections device to the network (Advanced Section)

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
### [Default inputs:
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
