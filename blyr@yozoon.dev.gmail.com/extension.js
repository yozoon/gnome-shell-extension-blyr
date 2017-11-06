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

const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const Lang = imports.lang;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Tweener = imports.ui.tweener;

const Extension = ExtensionUtils.getCurrentExtension();
const Effect = Extension.imports.effect;
const Shared = Extension.imports.shared;
const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

const eligibleForPanelBlur = Shared.isEligibleForPanelBlur();

// Blyr instance
let blyr;

// Make a "backup" copy of the gnome-shell function we are going to overwrite
const _shadeBackgrounds = Main.overview._shadeBackgrounds;

const AdvancedBackground = new Lang.Class({
    Name: 'AdvancedBackground',
    Extends: Meta.BackgroundActor,

    _init: function(params) {
        this.parent(params);
        return this;
    }
});

const Blyr = new Lang.Class({
    Name: 'Blyr',

    _init: function(params) {
        // Create instance of the shader effect
        this.shaderEffect = new Effect.ShaderEffect();

        this._fetchSettings();

        if(eligibleForPanelBlur)
            this._panelMagic();

        if(this.applyto != Shared.PANEL_ONLY)
            this._injectJS(this.vignette);

        this._connectCallbacks();
    },

    _fetchSettings: function() {
        this.animate = settings.get_boolean("animate");
        this.vignette = settings.get_boolean("vignette");
        this.radius = settings.get_double("radius");
        this.brightness = settings.get_double("brightness");
        this.applyto = settings.get_string("applyto");
    },

    _connectCallbacks: function() {
        // Settings changed listener
        this.setting_changed_connection = settings.connect("changed", Lang.bind(this, this._settingsChanged));

        // Monitors changed callback
        this.monitor_changed_connection = Main.layoutManager.connect('monitors-changed', Lang.bind(this, function() {
            // Update the monitor information we track and regenerate blurred panel background
            this.primaryMonitor = Main.layoutManager.primaryMonitor;
            this.primaryIndex = Main.layoutManager.primaryIndex;

            if(eligibleForPanelBlur) {
                // Reconnect the background changed listener, because it was disconnected during the monitor setup change 
                this.bg_changed_connection = Main.layoutManager._bgManagers[this.primaryIndex].connect('changed', Lang.bind(this, this._panelMagic));

                // Regenerate blurred panel background
                this._panelMagic();
            }

            // TODO: The overview blur instances should also be updated when there is a change in the monitor setup
        }));
        
        if(eligibleForPanelBlur) {
            // Regenerate blurred panel background when background on primary monitor is changed
            this.primaryIndex = Main.layoutManager.primaryIndex;
            this.bg_changed_connection = Main.layoutManager._bgManagers[this.primaryIndex].connect('changed', Lang.bind(this, this._panelMagic));
        }

        // Start appropriate overview listener depending on animation state
        this._selectOverviewListener();
    },

    _settingsChanged: function() {
        // Backup settings state to register differences
        let animate_old = this.animate;

        // Get updated settings
        this._fetchSettings();
        
        this._injectJS(this.vignette);

        // Update blurred panel background
        if(eligibleForPanelBlur) {
            if(this.applyto == Shared.ACTIVITIES_ONLY && this.bgContainer != undefined) {
                this.panelBox.remove_child(this.bgContainer);
            }
            this._panelMagic();
        }

        if(this.applyto == Shared.PANEL_ONLY)
            this._injectJS(false);

        // If animation settings changed
        if(animate_old != this.animate) {
            // reset effect
            this._removeEffect(true);
            // disconnect callbacks
            Main.overview.disconnect(this.overview_hiding_connection);
            Main.overview.disconnect(this.overview_showing_connection);
            // Start appropriate overview listener depending on animation state
            this._selectOverviewListener();
        }
    },

    _selectOverviewListener: function() {
        if(this.animate) {
            // Overview showing listener
            this.overview_showing_connection = Main.overview.connect("showing", Lang.bind(this, function(){
                this._applyEffect();
            }));
            // Overview Hiding listener
            this.overview_hiding_connection = Main.overview.connect("hiding", Lang.bind(this, function(){
                this._removeEffect();
            }));
        } else {
            // Blur Overview in advance
            this._applyEffect();
            // Remove overview showing/hiding listener, because we already blurred the overview background actor in advance
            // and are now just uning the default mechanisms of the shell to show and hide the overview background.
            this.overview_showing_connection = Main.overview.connect("showing", function(){});
            this.overview_hiding_connection = Main.overview.connect("hidden", function(){});
        }
    },

    _injectJS: function(flag) {
        if (flag) {
            // Remove the code responsible for the vignette effect
            Main.overview._shadeBackgrounds = function(){};
        } else {
            // Reassign the code responsible for the vignette effect
            Main.overview._shadeBackgrounds = _shadeBackgrounds;
        }
    },

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
            "z-position": -1 /* Needed to ensure proper positioning behind the panel */
        });

        // Clone primary background instance (we need to clone it, not just assign it, so we can modify 
        // it without influencing the main desktop background)
        this.panel_bg = new Meta.BackgroundActor ({
            name: "panel_bg",
            background: this.primaryBackground["background"],
            "meta-screen": this.primaryBackground["meta-screen"],
            width: this.primaryMonitor.width,
            height: this.panelBox.height*2, /* Needed to reduce edge darkening caused by high blur radii */
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

    _applyTwoPassBlur: function(actor) {
        // Only fade the 
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
                time: 0.5,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                    log("complete shade");
                })
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
                time: 0.5,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                    log("complete unshade");
                })
            });
        }
    },

    _applyEffect: function() {
        this._fetchSettings();

        if(this.applyto == Shared.PANEL_ONLY)
            return;

        let advancedBackground;

        if(advancedBackground == undefined) {
            let bg = Main.overview._backgroundGroup.get_children()[0];

            advancedBackground = new AdvancedBackground({
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

        if(Main.overview._backgroundGroup.get_children().length == 1)
            Main.overview._backgroundGroup.add_child(advancedBackground);

        // Get the overview background actors
        Main.overview._backgroundGroup.get_children().forEach(function(actor) {
            this._applyTwoPassBlur(actor);
        }, this);

        log(Main.overview._backgroundGroup.get_children().length);
        /*
        if(this.animate) {
            this.shaderEffect.apply_effect(this.backgrounds);
        } else {
            this.shaderEffect.apply_effect(this.backgrounds);
        }*/
    },

    _removeEffect: function(reset) {
        this._fetchSettings();

        if(this.applyto == Shared.PANEL_ONLY)
            return;

        // Get the overview background actors
        Main.overview._backgroundGroup.get_children().forEach(function(actor) {
            this._removeTwoPassBlur(actor);
        }, this);

        /*
        if(reset) {
            this.shaderEffect.remove_effect(this.backgrounds);
        } else {
            if(this.animate) {
                this.shaderEffect.apply_effect(this.backgrounds);
            } else {
                this.shaderEffect.remove_effect(this.backgrounds);
            }
        }
        */
    },

    _disable: function() {
        // Disconnect Callbacks
        settings.disconnect(this.setting_changed_connection);
        Main.overview.disconnect(this.overview_showing_connection);
        Main.overview.disconnect(this.overview_hiding_connection);
        Main.layoutManager.disconnect(this.monitor_changed_connection);

        // Reset UI to its original state
        this._removeEffect(true);
        this._injectJS(false);

        if(eligibleForPanelBlur) {
            // Disconnect the background change listener
            Main.layoutManager._bgManagers[this.primaryIndex].disconnect(this.bg_changed_connection);
            // Remove blurred panel background
            this.panelEffect.remove_effect([this.panel_bg]);
            this.panelBox.remove_child(this.bgContainer);
        }
    }
});

function init() {}

function enable() {
    blyr = new Blyr();
}

function disable() {
    blyr._disable();
    blyr = null;
};

/*
Tweener.addTween(texture, 
{
    time: 0.4,
    transition: 'easeInOutExpo',
    opacity: 255,
    onComplete: Lang.bind(this, function() {
        log("complete");
    })
});
*/