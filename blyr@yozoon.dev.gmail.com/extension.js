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
const Shell = imports.gi.Shell;
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

// Note: do this using expension utils
const UUID = "blyr@yozoon.dev.gmail.com";

const eligibleForPanelBlur = false; //Shared.isEligibleForPanelBlur();

// Make a "backup" copy of the gnome-shell functions we are going to overwrite
const _shadeBackgrounds = Main.overview._shadeBackgrounds;
const _unshadeBackgrounds = Main.overview._unshadeBackgrounds;

const Blyr = new Lang.Class({
    Name: 'Blyr',

    _init: function(params) {
        // Clutter actor which contains the overview backgrounds as children
        this.bgGroup = Main.overview._backgroundGroup;

        // List made up of the cloned overview backgrounds with z-position -1 and blur filter applied 
        this.bgList = [];

        // Monitor information
        this.pMonitor = Main.layoutManager.primaryMonitor;
        this.pIndex = Main.layoutManager.primaryIndex;

        // Get current settings
        this.disable_vignette = settings.get_boolean("vignette");
        this.mode = settings.get_string("mode");
        this.radius = settings.get_double("radius");
        this.brightness = settings.get_double("brightness");

        // Blur panel if GNOME version matches and the user selected a mode to enable panel blur
        if(eligibleForPanelBlur && mode != Shared.ACTIVITIES_ONLY)
            this._panelMagic();

        // Disable vignette effect if user decided to do so
        if(disable_vignette)
            this._disableVignetteEffect();

        if(this.mode = Shared.ACTIVITIES_ONLY || this.mode = Shared.BLUR_BOTH)
            this._regenerateOverviewBackgrounds();

        this._connectCallbacks();
    },

    _disableVignetteEffect: function() {
        // Remove the code responsible for the vignette effect
        Main.overview._shadeBackgrounds = function(){};
        Main.overview._unshadeBackgrounds = function(){};
        // Disable vignette Effect on all overview backgrounds
        this.bgGroup.get_children().forEach(function(actor) {
            actor.vignette = false;
        }, null);
    },

    _restoreVignetteEffect: function() {
        // Reassign the code responsible for the vignette effect
        Main.overview._shadeBackgrounds = _shadeBackgrounds;
        Main.overview._unshadeBackgrounds = _unshadeBackgrounds;
        // Enable vignette Effect on all overview backgrounds
        this.bgGroup.get_children().forEach(function(actor) {
            actor.vignette = true;
        }, null);
    },

    _updateOverviewBackgrounds: function() {
        if(this.bgList.length > 0) {
            for(let i = 0; i < this.bgGroup.get_children().length; i++) {
                let vblur = this.bgList[i].get_effect("vertical_blur");
                let hblur = this.bgList[i].get_effect("horizontal_blur");
                if(vblur > 0 && hblur > 0) {
                    vblur.updateUniforms(this.intensity, this.brightness);
                    hblur.updateUniforms(this.intensity, this.brightness);
                }
            }
        }
    },

    _regenerateOverviewBackgrounds: function() {
        //this.vertical_blur = new Effect.BlurEffect(0);
        //this.horizontal_blur = new Effect.BlurEffect(1);

        this._removeOverviewBackgrounds();

        // Create Initial copy
        for(let i = 0; i < this.bgGroup.get_children().length; i++) {
            let bg = this.bgGroup.get_children()[i];
            // Clone the background actor and modify z-position
            this.bgList[i] = new Meta.BackgroundActor({
                name: bg["name"],
                background: bg["background"],
                "meta-screen": bg["meta-screen"],
                width: bg["width"],
                height: bg["height"],
                monitor: bg["monitor"],
                x: bg["x"],
                y: bg["y"],
                "z-position": -1
            });
        }
    },

    _removeOverviewBackgrounds: function() {
        // Reset the bg list instance
        this.bgList = [];
        let bgCildren = this.bgGroup.get_children();
        // Update our list of injected background actors
        for(let i = 0; i < bgCildren.length; i++) {
            if(bgChildren[i]["z-position"] == -1) {
                this.bgList.push(bgChildren[i]);
            }
        }
        if(bgList.length > 0) {
            // Remove all injected background actors
            for(let i = 0; i < this.bgList.length; i++) {
                this.bgGroup.remove_child(bgList[i]);
            }
        }
        // Reset the bg list instance again
        this.bgList = [];
    },

    _connectCallbacks: function() {
        this.updated_connection = Main.sessionMode.connect('updated', Lang.bind(this, Lang.bind(this, function() {
            log("session updated");
        })));
        // Settings changed listener
        this.setting_changed_connection = settings.connect("changed", Lang.bind(this, Lang.bind(this, function() {
            log("settings changed"); //this._settingsChanged));
        }));

        // Background change listener 
        this.bg_changed_connection = Main.layoutManager._bgManagers[this.primaryIndex].connect('changed', Lang.bind(this, this._panelMagic));

        // Monitors changed callback
        this.monitor_changed_connection = Main.layoutManager.connect('monitors-changed', Lang.bind(this, function() {
            log("monitor setup changed");
            /*
            // Update the monitor information we track and regenerate blurred panel background
            this.primaryMonitor = Main.layoutManager.primaryMonitor;
            this.primaryIndex = Main.layoutManager.primaryIndex;

            if(eligibleForPanelBlur) {
                // Reconnect the background changed listener, because it was disconnected during the monitor setup change 
                this.bg_changed_connection = Main.layoutManager._bgManagers[this.primaryIndex].connect('changed', Lang.bind(this, this._panelMagic));

                // Regenerate blurred panel background
                this._panelMagic();
            }
            */

            // TODO: The overview blur instances should also be updated when there is a change in the monitor setup
        }));
        
        if(eligibleForPanelBlur) {
            // Regenerate blurred panel background when background on primary monitor is changed
            this.primaryIndex = Main.layoutManager.primaryIndex;
            this.bg_changed_connection = Main.layoutManager._bgManagers[this.primaryIndex].connect('changed', Lang.bind(this, this._panelMagic));
        }

        // Start appropriate overview listener depending on animation state
        this._createOverviewListeners();
    },

    _modeChanged: function() {
        // Before the change happened
        let oldmode = this.mode * 10;
        // After the user changed the mode
        this.mode = settings.get_double("mode");

        switch(oldmode + this.mode) {
            case 12:
                // The user switched from panel_only to activities_only
                // Remove the blurred backgrounds
                this._removeOverviewBackgrounds();
                // Restore the vignette Effect
                this._restoreVignetteEffect();
                // Unregister overview showing/hiding callback
                this._removeOverviewListeners();
                // Apply panel blur
                this._panelMagic();
                break;
            case 13:
                // The user switched from panel_only to blur_both
                break;
            case 21:
                // The user switched from activities_only to panel_only
                break;
            case 23:
                // The user switched from activities_only to blur_both
                break;
            case 31:
                // The user switched from blur_both to panel_only
                break;
            case 32:
                // The user switched from blur_both to activities_only
                break;
        }

    },

    _settingsChanged: function() {
        // Get updated settings
        this._fetchSettings();

        // Update blurred panel background
        /*
        if(eligibleForPanelBlur) {
            if(this.applyto == Shared.ACTIVITIES_ONLY && this.bgContainer != undefined) {
                this.panelBox.remove_child(this.bgContainer);
            }
            this._panelMagic();
        }
        */

        if(this.applyto == Shared.PANEL_ONLY)
            this._injectJS();
    },

    _createOverviewListeners: function() {
        // Overview showing listener
        this.overview_showing_connection = Main.overview.connect("showing", Lang.bind(this, function(){
            this._applyEffect();
        }));
        // Overview Hiding listener
        this.overview_hiding_connection = Main.overview.connect("hiding", Lang.bind(this, function(){
            this._removeEffect();
        }));
    },

    _removeOverviewListeners: function() {
        if(this.overview_showing_connection > 0)
            Main.overview.disconnect(this.overview_showing_connection);
        if(this.overview_hiding_connection > 0)
            Main.overview.disconnect(this.overview_hiding_connection);
    },

    /*
    _panelMagic: function() {

        if(this.applyto == Shared.ACTIVITIES_ONLY)
            return;

        // Get primary monitor and its index
        this.primaryMonitor = Main.layoutManager.primaryMonitor;
        this.primaryIndex = Main.layoutManager.primaryIndex;
        // Get main panel box
        this.panelBox = Main.layoutManager.panelBox;
        // Get current wallpaper (backgroundGroup seems to use a different indexing than monitors. It seems as if the primary background is always the first one)
        this.backgroundGroup = Main.layoutManager._backgroundGroup.get_children();
        this.primaryBackground = this.backgroundGroup[0];

        let image = new Clutter.Image();

        // Create a seperate instance of the shader effect to decouple the effect used by the panel from the overview 
        // showing/hiding actions of the shaderEffect instance
        this.panelEffect = new Effect.ShaderEffect();

        // Remove panel background if it's already attached
        if(this.panelBox.get_n_children() > 1 && this.bgContainer != undefined) {
            this.panelBox.remove_child(this.bgContainer);
        }

        this.bgContainer = new Clutter.Actor({
            width: this.primaryMonitor.width,
            height: 0,
            "z-position": -1 /* Needed to ensure proper positioning behind the panel *
        });

        // Clone primary background instance (we need to clone it, not just assign it, so we can modify 
        // it without influencing the main desktop background)
        this.panel_bg = new Meta.BackgroundActor ({
            name: "panel_bg",
            background: this.primaryBackground["background"],
            "meta-screen": this.primaryBackground["meta-screen"],
            width: this.primaryMonitor.width,
            height: this.panelBox.height*2, /* Needed to reduce edge darkening caused by high blur radii *
            y: -1
        });

        // Only show one part of the panel background actor as large as the panel itself
        this.panel_bg.set_clip(0, 0, this.primaryMonitor.width, this.panelBox.height)

        // Apply the blur effect to the panel background   
        this.panelEffect.apply_effect([this.panel_bg]);

        // Add the background texture to the background container
        this.bgContainer.add_actor(this.panel_bg);

        // Add the background container to the system panel box
        this.panelBox.add_actor(this.bgContainer);
    },
    */

    _applyTwoPassBlur: function(actor) {
        if(actor["z-position"] == -1) {
            actor.set_opacity(255);
            if(!actor.get_effect("vertical_blur"))
                actor.add_effect_with_name('vertical_blur', new Effect.BlurEffect(actor.width, actor.height, 0, this.radius, this.brightness));
            if(!actor.get_effect("horizontal_blur"))
                actor.add_effect_with_name('horizontal_blur', new Effect.BlurEffect(actor.width, actor.height, 1, this.radius, this.brightness));
        } else {
            actor.set_opacity(255);
            Tweener.addTween(actor, 
            {
                opacity: 0,
                time: Overview.SHADE_ANIMATION_TIME,
                transition: 'easeOutQuad'
            });
        }
    },

    _removeTwoPassBlur: function(actor) {
        if(actor["z-position"] == -1) {
            actor.set_opacity(255);
        } else {
            actor.set_opacity(0);
            Tweener.addTween(actor, 
            {
                opacity: 255,
                time: Overview.SHADE_ANIMATION_TIME,
                transition: 'easeOutQuad'
            });
        }
    },

    _applyEffect: function() {
        this._fetchSettings();

        if(this.applyto == Shared.PANEL_ONLY)
            return;

        let blurredBackground;

        if(blurredBackground == undefined) {
            let bg = Main.overview._backgroundGroup.get_children()[0];

            blurredBackground = new Meta.BackgroundActor({
                name: bg["name"],
                background: bg["background"],
                "meta-screen": bg["meta-screen"],
                width: bg["width"],
                height: bg["height"],
                monitor: bg["monitor"],
                x: bg["x"],
                y: bg["y"],
                "z-position": -1
            });
        }

        // Main.overview._backgroundGroup is just a clutter actor, so we can add children to it!
        if(Main.overview._backgroundGroup.get_children().length == 1)
            Main.overview._backgroundGroup.add_child(blurredBackground);

        // Get the overview background actors
        Main.overview._backgroundGroup.get_children().forEach(function(actor) {
            this._applyTwoPassBlur(actor);
        }, this);

        //log(Main.overview._backgroundGroup.get_children().length);
    },

    _removeEffect: function() {
        this._fetchSettings();

        if(this.applyto == Shared.PANEL_ONLY)
            return;

        // Get the overview background actors
        Main.overview._backgroundGroup.get_children().forEach(function(actor) {
            this._removeTwoPassBlur(actor);
        }, this);
    },

    _disable: function() {
        // Disconnect Callbacks
        settings.disconnect(this.setting_changed_connection);
        Main.overview.disconnect(this.overview_showing_connection);
        Main.overview.disconnect(this.overview_hiding_connection);
        Main.layoutManager.disconnect(this.monitor_changed_connection);
        Main.sessionMode.disconnect(this.updated_connection);

        // Restore original Shell state
        this._removeEffect();
        this._restoreVignetteEffect();

        /*
        if(eligibleForPanelBlur) {
            // Disconnect the background change listener
            Main.layoutManager._bgManagers[this.primaryIndex].disconnect(this.bg_changed_connection);
            // Remove blurred panel background
            this.panelEffect.remove_effect([this.panel_bg]);
            this.panelBox.remove_child(this.bgContainer);
        }
        */
    }
});

let blyr;

function init() {}

function enable() {
    blyr = new Blyr();
}

function disable() {
    blyr._disable();
    blyr = null;
};

/*
const AdvancedBackground = new Lang.Class({
    Name: 'AdvancedBackground',
    Extends: Meta.BackgroundActor,

    _init: function(params) {
        this.parent(params);
        return this;
    }
});

In tweener:
onComplete: Lang.bind(this, function() {
                    log("complete shade");
                })
                */