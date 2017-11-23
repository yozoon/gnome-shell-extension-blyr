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
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;
const ExtensionUtils = imports.misc.extensionUtils;

const Extension = ExtensionUtils.getCurrentExtension();
const Effect = Extension.imports.effect;
const Shared = Extension.imports.shared;
const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

const eligibleForPanelBlur = Shared.isEligibleForPanelBlur();

// Make a "backup" copy of the gnome-shell functions we are going to overwrite
const _shadeBackgrounds = Main.overview._shadeBackgrounds;
const _unshadeBackgrounds = Main.overview._unshadeBackgrounds;

const Blyr = new Lang.Class({
    Name: 'Blyr',

    _init: function(params) {
        // Monitor information
        this.pMonitor = Main.layoutManager.primaryMonitor;
        this.pIndex = Main.layoutManager.primaryIndex;

        // Background group to contain the blurred overview backgrounds
        this.modifiedOverviewBackgroundGroup = new Meta.BackgroundGroup({ 
            reactive: true, 
            "z-position": -1 
        });

        // Add this background group to the layoutManager's overview Group
        Main.layoutManager.overviewGroup.add_child(
            this.modifiedOverviewBackgroundGroup);

        // Get current mode
        this.mode = settings.get_int("mode");

        // Override mode if we can't blur the panel background
        if(!eligibleForPanelBlur) {
            // Default to activities_only
            this.mode = 2;
        }

        // Get current settings
        this.intensity = settings.get_double("intensity");
        this.brightness = settings.get_double("brightness");

        // Modify shell using current parameters and settings.
        this._startup();

        // Connect the signal listeners
        this._connectCallbacks();
    },

    _startup: function() {
        switch(this.mode) {
            case 1:
                // panel_only
                // Apply panel blur
                this._applyPanelBlur();
                break;
            case 2:
                // activities_only
                // Disable vignette effect
                this._disableVignetteEffect();
                // Create overview background actors
                this._createOverviewBackgrounds();
                // Connect overview listeners
                this._connectOverviewListeners();
                break;
            case 3:
                // blur_both
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

    _connectCallbacks: function() {
        // Settings changed listener
        this.setting_changed_connection = settings.connect("changed", 
            Lang.bind(this, function() {
            if(eligibleForPanelBlur)
                this._checkModeChange();

            // Store outdated settings
            let intensity_old = this.intensity;
            let brightness_old = this.brightness;

            // Get current settings
            this.intensity = settings.get_double("intensity");
            this.brightness = settings.get_double("brightness");

            // If either blur intensity or brightness changed
            if(intensity_old != this.intensity || 
                brightness_old != this.brightness) {
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

        // Background change listener 
        this.bg_changed_connection = Main.layoutManager._bgManagers[this.pIndex].connect(
            'changed', Lang.bind(this, function() {
            this._regenerateBlurredActors();
        }));

        // Monitors changed callback
        this.monitor_changed_connection = Main.layoutManager.connect(
            'monitors-changed', Lang.bind(this, function() {
            let pIndex_old = this.pIndex;
            // Monitor information
            this.pMonitor = Main.layoutManager.primaryMonitor;
            this.pIndex = Main.layoutManager.primaryIndex;
            this._connectCallbacks();
            this._regenerateBlurredActors();
        }));

        // To fix unresponsive callbacks after hibernation, regenerate the 
        // callbacks after the session mode changed to 'user' again
        this.session_mode_connection = Main.sessionMode.connect('updated', 
            Lang.bind(this, function() {
            if(Main.sessionMode.currentMode == 'user') {
                this._connectCallbacks();
                // Disable vignette effect if overview blur is enabled
                if(this.mode == 2 || this.mode == 3) {
                    this._disableVignetteEffect();
                }
            }
        }));
    },

    _regenerateBlurredActors: function() {
        switch(this.mode) {
            case 1:
                // panel_only
                // Recreate panel background blur actor
                this._removePanelBlur();
                this._applyPanelBlur();
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
    },

    _disconnectListeners: function() {
        // Get primary monitor index
        this.pIndex = Main.layoutManager.primaryIndex;
        // Disconnect settings change connection
        if(this.setting_changed_connection != undefined)
            settings.disconnect(this.setting_changed_connection);
        // Disconnect monitor changed connection
        if(this.monitor_changed_connection != undefined)
            Main.layoutManager.disconnect(this.monitor_changed_connection);
        // Disconnect background change listener
        if(this.bg_changed_connection != undefined)
            Main.layoutManager._bgManagers[this.pIndex].disconnect(
                this.bg_changed_connection);
        // Disconnect session mode listener
        if(this.session_mode_connection != undefined)
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
                this._fadeIn(actor);
            }, this);
        }));
    },

    _disconnectOverviewListeners: function() {
        if(this.overview_showing_connection != undefined) {
            Main.overview.disconnect(this.overview_showing_connection);
            this.overview_showing_connection = 0;
        }
        if(this.overview_hiding_connection != undefined) {
            Main.overview.disconnect(this.overview_hiding_connection);
            this.overview_hiding_connection = 0;
        }
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
                this._restoreVignetteEffect();
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
                this._restoreVignetteEffect();
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

    _applyTwoPassBlur: function(actor) {
        // Update effect settings
        this.intensity = settings.get_double("intensity");
        this.brightness = settings.get_double("brightness");
        
        if(!actor.get_effect("vertical_blur"))
            actor.add_effect_with_name("vertical_blur", new Effect.BlurEffect(
                actor.width, actor.height, 0, this.intensity, this.brightness));
        if(!actor.get_effect("horizontal_blur"))
            actor.add_effect_with_name("horizontal_blur", new Effect.BlurEffect(
                actor.width, actor.height, 1, this.intensity, this.brightness));
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

    _disableVignetteEffect: function() {
        // Remove the code responsible for the vignette effect
        Main.overview._shadeBackgrounds = function(){};
        Main.overview._unshadeBackgrounds = function(){};

        // Disable the vignette effect for each actor
        Main.overview._backgroundGroup.get_children().forEach(function(actor) {
            actor.vignette = false;
        }, null);
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

    _createOverviewBackgrounds: function() {
        // Remove all children from modified background actor
        this.modifiedOverviewBackgroundGroup.remove_all_children();

        // Update backgrounds to prevent ghost actors
        Main.overview._updateBackgrounds();
        
        // Create copies of background actors
        Main.overview._backgroundGroup.get_children().forEach(
            Lang.bind(this, function(bg) {
                bg.vignette = false;
                bg.brightness = 1.0;
                // Clone the background actor
                this.bgActor = new Meta.BackgroundActor({
                    name: "blurred",
                    background: bg.background,
                    "meta-screen": bg["meta-screen"],
                    width: bg["width"],
                    height: bg["height"],
                    monitor: bg["monitor"],
                    x: bg["x"],
                    y: bg["y"]
                });

                // Apply blur effect
                this._applyTwoPassBlur(this.bgActor);

                // Add child to our modified BG actor
                this.modifiedOverviewBackgroundGroup.add_child(this.bgActor);

                this.bgActor = null;
        }));
    },

    _updateOverviewBackgrounds: function() {
        // Remove and reapply blur effect for each actor
        this.modifiedOverviewBackgroundGroup.get_children().forEach(
            Lang.bind(this, function(actor) {
                actor.clear_effects();
                this._applyTwoPassBlur(actor);
            }));
    },

    _removeOverviewBackgrounds: function() {
        // Remove all children from modified background actor
        this.modifiedOverviewBackgroundGroup.remove_all_children();
    },

    _applyPanelBlur: function() {
        // Get main panel box
        this.panelBox = Main.layoutManager.panelBox;

        // Get current wallpaper (backgroundGroup seems to use a different 
        // indexing than monitors. It seems as if the primary background 
        // is always the first one)
        this.primaryBackground = Main.layoutManager._backgroundGroup.get_children()[0];

        // Remove panel background if it's already attached
        if(this.panelBox.get_n_children() > 1 && 
            this.bgContainer != undefined) {
            this.panelBox.remove_child(this.bgContainer);
        }

        // Clutter Actor with height 0 which will contain the actual blurred 
        // background
        this.bgContainer = new Clutter.Actor({
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
            "meta-screen": this.primaryBackground["meta-screen"],
            monitor: this.primaryBackground["monitor"],
            width: this.pMonitor.width+2,
            /* Needed to reduce edge darkening caused by high blur intensities */
            height: this.panelBox.height*2,
            x: -1,
            y: -1
        });

        // Only show one part of the panel background actor as large as the 
        // panel itself
        this.panel_bg.set_clip(0, 0, this.pMonitor.width+2, this.panelBox.height);

        // Apply the blur effect to the panel background
        this._applyTwoPassBlur(this.panel_bg);

        // Add the background texture to the background container
        this.bgContainer.add_actor(this.panel_bg);

        // Add the background container to the system panel box
        this.panelBox.add_actor(this.bgContainer);
    },

    _updatePanelBlur: function() {
        this.panel_bg.clear_effects();
        this._applyTwoPassBlur(this.panel_bg);
    },

    _removePanelBlur: function() {
        // Remove blurred panel background
        if(this.bgContainer != null) {
            this.panelBox.remove_child(this.bgContainer);
            this.bgContainer = null;
            this.panel_bg = null;
        }
    },

    disable: function() {
        // Disconnect Listeners
        this._disconnectListeners();

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
                // Restore vignette effect
                this._restoreVignetteEffect();
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
                // Restore vignette effect
                this._restoreVignetteEffect();
                break;
        }
    }
});

let blyr;

function init() {}

function enable() {
    blyr = new Blyr();
}

function disable() {
    blyr.disable();
    blyr = null;
};