#!/bin/bash
# removes blyr from the enabled-extensions list
gsettings set org.gnome.shell enabled-extensions "$(gsettings get org.gnome.shell enabled-extensions | { read test; echo "${test//blyr\@yozoon.dev.gmail.com}"; })"
