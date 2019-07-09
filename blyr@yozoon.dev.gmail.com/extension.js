/**
 * Blyr@yozoon.dev.gmail.com
 * Adds a Blur Effect to GNOME Shell UI Elements
 * 
 * Copyright © 2017 Julius Piso, All rights reserved
 *
 * This file is part of Blyr.
 * 
 * Blyr is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * Blyr is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with Blyr.  If not, see <http://www.gnu.org/licenses/>.
 * 
 * AUTHOR: Julius Piso (yozoon.dev@gmail.com)
 * PROJECT SITE: https://github.com/yozoon/gnome-shell-extension-blyr
 * 
 * CREDITS: Additional credits go to Luca Viggiani and Florian Mounier aka 
 * paradoxxxzero. The extension windows-blur-effect written by Luca Viggiani 
 * gave me lots of useful information about the general structure of GNOME Shell 
 * extensions and connection callbacks. gnome-shell-shader-extension by Florian 
 * Mounier showed me how to implement custom GLSL Shaders as Clutter Effects.
 * windows-blur-effect: 
 * https://github.com/lviggiani/gnome-shell-extension-wbe/
 * gnome-shell-shader-extension:
 * https://github.com/paradoxxxzero/gnome-shell-shader-extension/
 * Credit also goes to GitHub user Optimisme, who made some great GJS examples 
 * available, which helped me to get the general idea of how to use a GTK Embed. 
 * https://github.com/optimisme/gjs-examples
 */

const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;
const ExtensionUtils = imports.misc.extensionUtils;
const LoginManager = imports.misc.loginManager;

const Extension = ExtensionUtils.getCurrentExtension();
const Effect = Extension.imports.effect;
const Shared = Extension.imports.shared;
const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

const eligibleForPanelBlur = Shared.isEligibleForPanelBlur();

// Make a "backup" copy of the gnome-shell functions we are going to overwrite
const _shadeBackgrounds = Main.overview._shadeBackgrounds;
const _unshadeBackgrounds = Main.overview._unshadeBackgrounds;

function log(msg) {
    if(settings.get_boolean('debug-logging')) {
        print("blyr.yozoon.dev.gmail.com: " + msg);
    }
}

const Blyr = new Lang.Class({
    Name: 'Blyr',

    _init: function(params) {
        log("Starting Blyr extension...");

        // Get current mode
        this.mode = settings.get_int("mode");

        // Wallpaper settings
        this.gsettings = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});

        // Create variables
        this.modifiedOverviewBackgroundGroup = null;
        this.pMonitor = Main.layoutManager.primaryMonitor;
        this.pIndex = Main.layoutManager.primaryIndex;
        this.bgManager = Main.layoutManager._bgManagers[this.pIndex];

        this.settings_connection = null;
        this.gsettings_connection = null;
        this.bg_connection = null;
        this.session_mode_connection = null;
        this.monitor_changed_connection = null;
        this.overview_showing_connection = null;
        this.overview_hiding_connection = null;


        // Override mode if we can't blur the panel background
        // Default to activities_only
        if(!eligibleForPanelBlur)
            this.mode = 2;

        // Get current settings
        this.intensity = settings.get_double("intensity");
        this.activities_brightness = settings.get_double("activitiesbrightness");
        this.panel_brightness = settings.get_double("panelbrightness");

        // Modify shell using current parameters and settings.
        this._startup();

        // Connect the listeners
        this._connectListeners();
    },

    _startup: function() {
        switch(this.mode) {
            case 1: // panel_only
                // Apply panel blur
                this._applyPanelBlur();
                // Dim activities screen with brightness set from preferences
                this._overrideVignetteEffect();
                break;
            case 2: // activities_only
                // Disable vignette effect
                this._disableVignetteEffect();
                // Create overview background actors
                this._createOverviewBackgrounds();
                // Connect overview listeners
                this._connectOverviewListeners();
                break;
            case 3: // blur_both
                // Disable vignette effect
                this._disableVignetteEffect();
                // Apply panel blur
                this._applyPanelBlur();
                // activities_only
                this._createOverviewBackgrounds();
                // Connect overview listeners
                this._connectOverviewListeners();
                break;
        }
    },

    /***************************************************************
     *                       Listeners                             *
     ***************************************************************/
    _connectListeners: function() {
        this._disconnectListeners();

        // Monitor information
        this.pMonitor = Main.layoutManager.primaryMonitor;
        this.pIndex = Main.layoutManager.primaryIndex;
        this.bgManager = Main.layoutManager._bgManagers[this.pIndex];

        // Settings changed listener
        this.settings_connection = settings.connect("changed", 
            Lang.bind(this, function() {
            if(eligibleForPanelBlur)
                this._checkModeChange();

            // Store outdated settings
            let intensity_old = this.intensity;
            let activities_brightness_old = this.activities_brightness;
            let panel_brightness_old = this.panel_brightness;

            // Get current settings
            this.intensity = settings.get_double("intensity");
            this.activities_brightness = settings.get_double("activitiesbrightness");
            this.panel_brightness = settings.get_double("panelbrightness");

            // If either blur intensity, activities brightness or panel 
            // brightness changed
            if(intensity_old != this.intensity || 
                activities_brightness_old != this.activities_brightness ||
                panel_brightness_old != this.panel_brightness ) {
                switch(this.mode) {
                    case 1:
                        // panel_only
                        this._updatePanelBlur();
                        break;
                    case 2:
                        // activities_only
                        this._updateOverviewBackgrounds();
                        break;
                    case 3:
                        // blur_both
                        this._updatePanelBlur();
                        this._updateOverviewBackgrounds();
                        break;
                }
            }
        }));

        // listens to changes of the wallpaper url in gsettings
        this.gsettings_connection = this.gsettings.connect('changed::picture-uri', 
            Lang.bind(this, this._regenerateBlurredActors));

        // listens to changed signal on bg manager (useful if the url of a 
        // wallpaper doesn't change, but the wallpaper itself changed)
        this.bg_connection = this.bgManager.connect('changed', 
            Lang.bind(this, this._regenerateBlurredActors));

        // session mode listener used to recreate listeners in order to 
        // prevent unresponsive "orphan" listeners
        this.session_mode_connection = Main.sessionMode.connect('updated',
            Lang.bind(this, function() {
                this._disconnectListeners();
                this._connectListeners();
            }));

        // Monitors changed listener
        this.monitor_connection = Main.layoutManager.connect('monitors-changed', 
            Lang.bind(this, function() {
                this._disconnectListeners();
                this._connectListeners();
                this._regenerateBlurredActors();
            }));
    },

    _disconnectListeners: function() {
        // Disconnect settings change connection
        if(this.settings_connection)
            settings.disconnect(this.setting_changed_connection);
        // Disconnect gsettings change connection
        if(this.gsettings_connection)
            this.gsettings.disconnect(this.gsetting_changed_connection);
        // Disconnect monitor changed connection
        if(this.monitor_connection)
            Main.layoutManager.disconnect(this.monitor_changed_connection);
        // Disconnect background change listener
        if(this.bg_connection)
            this.bgManager.disconnect(this.bg_changed_connection);
        // Disconnect session mode listener
        if(this.session_mode_connection)
            Main.sessionMode.disconnect(this.session_mode_connection);
    },

    _connectOverviewListeners: function() {
        // Overview showing listener
        this.overview_showing_connection = Main.overview.connect("showing", 
            Lang.bind(this, function() {
            // Fade out the untouched overview background actors to reveal 
            // our copied actors.
            Main.overview._backgroundGroup.get_children().forEach(
                function(actor) {
                    if(actor.is_realized())
                        this._fadeOut(actor);
            }, this);
        }));
        // Overview Hiding listener
        this.overview_hiding_connection = Main.overview.connect("hiding", 
            Lang.bind(this, function() {
            // Fade in the untouched overview background actors to cover 
            // our copied actors.
            Main.overview._backgroundGroup.get_children().forEach(
                function(actor) {
                    if(actor.is_realized())
                        this._fadeIn(actor);
            }, this);
        }));
    },

    _disconnectOverviewListeners: function() {
        if(this.overview_showing_connection)
            Main.overview.disconnect(this.overview_showing_connection);
        if(this.overview_hiding_connection)
            Main.overview.disconnect(this.overview_hiding_connection);
    },

    _checkModeChange: function() {
        // Get mode before the user changed the mode
        let oldmode = this.mode * 10;
        // Get mode after the user changed the mode
        this.mode = settings.get_int("mode");

        switch(oldmode + this.mode) {
            case 12:
                // The user switched from panel_only to activities_only
                // Remove panel blur
                this._removePanelBlur();
                // Disable vignette effect
                this._disableVignetteEffect();
                // Generate overview background actors
                this._createOverviewBackgrounds();
                // Register overview showing/hiding callback
                this._connectOverviewListeners();
                break;
            case 13:
                // The user switched from panel_only to blur_both
                // Disable vignette effect
                this._disableVignetteEffect();
                // Generate overview background actors
                this._createOverviewBackgrounds();
                // Register overview showing/hiding callback
                this._connectOverviewListeners();
                break;
            case 21:
                // The user switched from activities_only to panel_only
                // Remove the blurred backgrounds
                this._removeOverviewBackgrounds();
                // Unregister overview showing/hiding callback
                this._disconnectOverviewListeners();
                // Restore the vignette Effect
                this._overrideVignetteEffect();
                // Apply panel blur
                this._applyPanelBlur();
                break;
            case 23:
                // The user switched from activities_only to blur_both
                // Apply blur to panel
                this._applyPanelBlur();
                break;
            case 31:
                // The user switched from blur_both to panel_only
                // Remove the blurred backgrounds
                this._removeOverviewBackgrounds();
                // Unregister overview showing/hiding callback
                this._disconnectOverviewListeners();
                // Restore the vignette Effect
                this._overrideVignetteEffect();
                break;
            case 32:
                // The user switched from blur_both to activities_only
                // Remove panel blur
                this._removePanelBlur();
                break;
            default:
                break;
        }
    },

    _regenerateBlurredActors: function() {
        log('regenerate actors');
        // Delayed function call to give Tweener some time to fade out the old backgrounds
        GLib.timeout_add(GLib.PRIORITY_LOW, 100, Lang.bind(this, function() {
            switch(this.mode) {
                case 1:
                    // panel_only
                    // Recreate panel background blur actor
                    this._removePanelBlur();
                    this._applyPanelBlur();
                    // Dim activities screen with brightness set from preferences
                    this._overrideVignetteEffect();
                    break;
                case 2:
                    // activities_only
                    // Disable vignette effect
                    this._disableVignetteEffect();
                    // Recreate overview background blur actors
                    this._createOverviewBackgrounds();
                    break;
                case 3:
                    // blur_both
                    // Recreate panel background blur actor
                    this._removePanelBlur();
                    this._applyPanelBlur();
                    // Disable vignette effect
                    this._disableVignetteEffect();
                    // Recreate overview background blur actors
                    this._createOverviewBackgrounds();
                    break;
            }
            return GLib.SOURCE_REMOVE;
        }));
    },

    /***************************************************************
     *            Blur Effect and Animation Utilities              *
     ***************************************************************/
    _applyTwoPassBlur: function(actor, brightness) {
        // Update effect settings
        this.intensity = settings.get_double("intensity");
        
        if(!actor.get_effect("vertical_blur"))
            actor.add_effect_with_name("vertical_blur", new Effect.BlurEffect(
                actor.width, actor.height, 0, this.intensity, brightness));
        if(!actor.get_effect("horizontal_blur"))
            actor.add_effect_with_name("horizontal_blur", new Effect.BlurEffect(
                actor.width, actor.height, 1, this.intensity, brightness));
    },

    _fadeIn: function(actor) {
        // Transition animation: change opacity to 255 (fully opaque)
        Tweener.addTween(actor, 
        {
            opacity: 255,
            time: Overview.SHADE_ANIMATION_TIME,
            transition: 'easeOutQuad'
        });
    },

    _fadeOut: function(actor) {
        // Transition animation: change opacity to 0 (fully transparent)
        Tweener.addTween(actor, 
        {
            opacity: 0,
            time: Overview.SHADE_ANIMATION_TIME,
            transition: 'easeOutQuad'
        });
    },

    /***************************************************************
     *                      Vignette Effect                        *
     ***************************************************************/
    _disableVignetteEffect: function() {
        log("disable vignette effect");
        // Remove the code responsible for the vignette effect
        Main.overview._shadeBackgrounds = function(){};
        Main.overview._unshadeBackgrounds = function(){};

        // Disable the vignette effect for each actor
        Main.overview._backgroundGroup.get_children().forEach(function(actor) {
            actor.vignette = false;
        }, null);
    },

    _overrideVignetteEffect: function() {
        // Inject a new function handling the shading of the activities background
        Main.overview._shadeBackgrounds = function() {
            Main.overview._backgroundGroup.get_children().forEach(function(actor) {
                this.activities_brightness = settings.get_double("activitiesbrightness");
                actor.vignette = true;
                actor.brightness = 1.0;
                actor["vignette_sharpness"] = 0;
                Tweener.addTween(actor,
                                 { brightness: this.activities_brightness,
                                   time: Overview.SHADE_ANIMATION_TIME,
                                   transition: 'easeOutQuad'
                                 });
            }, this)
        };

        // Inject a new function handling the unshading of the activities background
        Main.overview._unshadeBackgrounds = function() {
            Main.overview._backgroundGroup.get_children().forEach(function(actor) {
                this.activities_brightness = settings.get_double("activitiesbrightness");
                actor.vignette = true;
                actor.brightness = this.activities_brightness;
                actor["vignette_sharpness"] = 0;
                Tweener.addTween(actor,
                                 { brightness: 1.0,
                                   time: Overview.SHADE_ANIMATION_TIME,
                                   transition: 'easeOutQuad'
                                 });
            }, this)
        };
    },

    _restoreVignetteEffect: function() {
        // Reassign the code responsible for the vignette effect
        Main.overview._shadeBackgrounds = _shadeBackgrounds;
        Main.overview._unshadeBackgrounds = _unshadeBackgrounds;

        // Re-enable the vignette effect for each actor
        Main.overview._backgroundGroup.get_children().forEach(function(actor) {
            actor.vignette = true;
        }, null);
    },

    /***************************************************************
     *                    Overview Backgrounds                     *
     ***************************************************************/
    _createOverviewBackgrounds: function() {
        this._removeOverviewBackgrounds();
        log("Create overview backgrounds");

        // Update backgrounds to prevent ghost actors
        Main.overview._updateBackgrounds();

        if(this.modifiedOverviewBackgroundGroup != undefined) {
            Main.layoutManager.overviewGroup.remove_child(
                this.modifiedOverviewBackgroundGroup);
        }

        // Background group to contain the blurred overview backgrounds
        this.modifiedOverviewBackgroundGroup = new Meta.BackgroundGroup({ 
            reactive: true, 
            "z-position": -1 
        });

        // Add this background group to the layoutManager's overview Group
        Main.layoutManager.overviewGroup.add_child(
            this.modifiedOverviewBackgroundGroup);

        // Get current activities background brighness value
        this.activities_brightness = settings.get_double("activitiesbrightness");

        // Only create copies of background actors with full opacity
        // This is needed to prevent copying of actors which are currently beeing
        // removed by the background manager. We are reveiving the change signal
        // before the fadeout animation is completed. Adding one of the actors
        // which are beeing phased out later causes issues as they appear as plane
        // white backgrounds instead of the actual image.
        Main.overview._backgroundGroup.get_children().forEach(
            Lang.bind(this, function(bg) {
                if(bg.opacity == 255){
                    bg.vignette = false;
                    bg.brightness = 1.0;

                    // Clone the background actor
                    this.bgActor = new Meta.BackgroundActor({
                        name: "blurred",
                        background: bg.background,
                        width: bg["width"]+2,
                        height: bg["height"]+2,
                        monitor: bg["monitor"],
                        x: bg["x"]-1,
                        y: bg["y"]-1
                    });

                    // Apply blur effect
                    this._applyTwoPassBlur(this.bgActor, this.activities_brightness);

                    // Add child to our modified BG actor
                    this.modifiedOverviewBackgroundGroup.add_child(this.bgActor);
                }
        }));
    },

    _updateOverviewBackgrounds: function() {
        // Get current activities background brighness value
        this.activities_brightness = settings.get_double("activitiesbrightness");
        // Remove and reapply blur effect for each actor
        this.modifiedOverviewBackgroundGroup.get_children().forEach(
            Lang.bind(this, function(actor) {
                actor.clear_effects();
                this._applyTwoPassBlur(actor, this.activities_brightness);
            }));
    },

    _removeOverviewBackgrounds: function() {
        // Remove all children from modified background actor
        if(this.modifiedOverviewBackgroundGroup != null) {
            this.modifiedOverviewBackgroundGroup.remove_all_children();
            this.modifiedOverviewBackgroundGroup.destroy();
            this.modifiedOverviewBackgroundGroup = null;
        }
    },

    /***************************************************************
     *                     Panel Background                        *
     ***************************************************************/
    _applyPanelBlur: function() {
        this._removePanelBlur();
        log("apply panel blur");

        // Update backgrounds to prevent ghost actors
        Main.overview._updateBackgrounds();

        // Create list of backgrounds with full opacity
        let bgs = [];
        Main.overview._backgroundGroup.get_children().forEach(
            Lang.bind(this, function(bg) {
                if(bg.opacity == 255 && bg.visible) {
                    bgs.push(bg);
                }
            }));

        // Calculate index of primary background
        let bgIndex = bgs.length - global.display.get_primary_monitor() - 1;

        // Select primary background
        this.primaryBackground = bgs[bgIndex];

        // Clutter Actor with height 0 which will contain the actual blurred background
        this.panelContainer = new Clutter.Actor({
            width: this.pMonitor.width,
            height: 0,
            /* Needed to ensure proper positioning behind the panel */
            "z-position": -1
        });

        // Clone primary background instance (we need to clone it, not just 
        // assign it, so we can modify it without influencing the main 
        // desktop background)
        this.panel_bg = new Meta.BackgroundActor ({
            name: "panel_bg",
            background: this.primaryBackground["background"],
            monitor: this.primaryBackground["monitor"],
            width: this.pMonitor.width+2,
            /* Needed to reduce edge darkening caused by high blur intensities */
            height: Main.layoutManager.panelBox.height*2,
            x: -1,
            y: -1
        });

        // Only show one part of the panel background actor as large as the 
        // panel itself
        this.panel_bg.set_clip(0, 0, this.pMonitor.width+2, Main.layoutManager.panelBox.height);

        // Get current panel brightness value
        this.panel_brightness = settings.get_double("panelbrightness");

        // Apply the blur effect to the panel background
        this._applyTwoPassBlur(this.panel_bg, this.panel_brightness);

        // Add the background texture to the background container
        this.panelContainer.add_actor(this.panel_bg);

        // Add the background container to the system panel box
        Main.layoutManager.panelBox.add_actor(this.panelContainer);
    },

    _updatePanelBlur: function() {
        this.panel_bg.clear_effects();
        this.panel_brightness = settings.get_double("panelbrightness");
        this._applyTwoPassBlur(this.panel_bg, this.panel_brightness);
    },

    _removePanelBlur: function() {
        // Remove blurred panel background
        if(this.panelContainer != undefined) {
            Main.layoutManager.panelBox.remove_child(this.panelContainer);
            this.panelContainer.remove_all_children();
            this.panelContainer.destroy();
            this.panelContainer = undefined;
            if(this.panel_bg != undefined) {
                this.panel_bg.destroy();
                this.panel_bg = undefined;
            }
        }
    },

    /***************************************************************
     *                   Restore Shell State                       *
     ***************************************************************/
    _restoreUI: function() {
        switch(this.mode) {
            case 1:
                // Remove panel blur
                this._removePanelBlur();
                break;
            case 2:
                // Remove the modified background actor from the 
                // layoutManager's overview Group
                Main.layoutManager.overviewGroup.remove_child(
                    this.modifiedOverviewBackgroundGroup);
                // Disconnect overview listeners
                this._disconnectOverviewListeners();
                break;
            case 3:
                // Remove panel blur
                this._removePanelBlur();
                // Remove the modified background actor from the 
                // layoutManager's overview Group
                Main.layoutManager.overviewGroup.remove_child(
                    this.modifiedOverviewBackgroundGroup);
                // Disconnect overview listeners
                this._disconnectOverviewListeners();
                break;
        }
        // Restore vignette effect
        this._restoreVignetteEffect();
    },

    disable: function() {
        // Disconnect Listeners
        this._disconnectListeners();
        // Restore user interface
        this._restoreUI();
    }
});

var blyr;

function init() {}

function enable() {
    blyr = new Blyr();
}

function disable() {
    blyr.disable();
};
