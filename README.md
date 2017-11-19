# GNOME Shell Extension - Blyr

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](http://www.gnu.org/licenses/gpl-3.0) [![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/jpiso/)

Apply a Blur Effect to GNOME Shell UI elements

## Screenshots
### Activities Background Blur:
Overview with a blur intensity of 10:

![](https://raw.githubusercontent.com/yozoon/gnome-shell-extension-blyr/master/img/Overview_10.png "Overview 10")

Overview with a blur intensity of 30:

![](https://raw.githubusercontent.com/yozoon/gnome-shell-extension-blyr/master/img/Overview_30.png "Overview 30")

### Panel Blur:
GNOME Shell 3.26 only:

![](https://raw.githubusercontent.com/yozoon/gnome-shell-extension-blyr/master/img/Panel_Blur.png "Panel Blur")

### Extension Preferences:
![](https://raw.githubusercontent.com/yozoon/gnome-shell-extension-blyr/master/img/Prefs_30.png "Prefs 30")

## Installation
### Official
Install *blyr* using the official repository:
[extensions.gnome.org](https://extensions.gnome.org/extension/1251/blyr/)

### Manual

```bash
git clone git@github.com:yozoon/gnome-shell-extension-blyr.git
cd gnome-shell-extension-blyr/
make local-install
```
Now just restart the Shell and enable the extension.

To remove the extension just run:

```bash
make local-uninstall
```

## Troubleshooting
On some Ubuntu installs the preferences dialog won't open. To fix the issue install the gtkclutter bindings as follows: 

```bash
sudo apt install gir1.2-gtkclutter-1.0
```

## Donations
If you like this extension, maybe consider donating to support its continuing development. :)

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/jpiso/)