> :warning: UNMAINTAINED :warning:
>
> I highly recommend you to check out [Blur my Shell](https://github.com/aunetx/blur-my-shell) (GNOME 3.36+)

# GNOME Shell Extension - Blyr

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)

Apply a Blur Effect to GNOME Shell UI elements

## Screenshots
### Activities Background Blur:
Overview with a blur intensity of 10:

![](https://raw.githubusercontent.com/yozoon/gnome-shell-extension-blyr/master/img/Overview_10.png "Overview 10")

Overview with a blur intensity of 30:

![](https://raw.githubusercontent.com/yozoon/gnome-shell-extension-blyr/master/img/Overview_30.png "Overview 30")

### Panel Blur:
GNOME Shell 3.26+:

![](https://raw.githubusercontent.com/yozoon/gnome-shell-extension-blyr/master/img/Panel_Blur.png "Panel Blur")

With GNOME Shell version 3.32 the panel transparency was removed. In order to use the blurred panel feature, you can install the Dynamic Panel Transparency [extension](https://extensions.gnome.org/extension/1011/dynamic-panel-transparency/).

### Extension Preferences:
![](https://raw.githubusercontent.com/yozoon/gnome-shell-extension-blyr/master/img/Prefs_30.png "Prefs 30")

## Installation
### Official
Install *blyr* using the official repository:
[extensions.gnome.org](https://extensions.gnome.org/extension/1251/blyr/)

### Manual

```bash
git clone https://github.com/yozoon/gnome-shell-extension-blyr.git
cd gnome-shell-extension-blyr/
make local-install
```
Now just restart the Shell and enable the extension.

To remove the extension just run:

```bash
make local-uninstall
```

## Troubleshooting
Some Ubuntu users reported that the preferences dialog didn't appear after opening it from the GNOME Tweaks application. To fix the issue install the gtkclutter bindings as follows:

```bash
sudo apt install gir1.2-gtkclutter-1.0
```

## Donations
If you like this extension, maybe consider donating to support its continuing development. :)

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/jpiso/)
