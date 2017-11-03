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

const Extension = ExtensionUtils.getCurrentExtension();
const Effect = Extension.imports.effect;
const Shared = Extension.imports.shared;
const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

// Blyr instance
let blyr;

// Make a "backup" copy of the gnome-shell function
const _shadeBackgrounds = Main.overview._shadeBackgrounds;

const Blyr = new Lang.Class({
    Name: 'Blyr',

    _init: function(params) {
        this.shaderEffect = new Effect.ShaderEffect();
        this.view = Main.overview;
        this.layoutManager = Main.layoutManager;
        this.primaryMonitor = this.layoutManager.primaryMonitor;

        this._fetchSettings();
        this._injectJS(this.vignette);
        this._connectCallbacks();
        this._panelMagic();
    },

    _fetchSettings: function() {
        this.animate = settings.get_boolean("animate");
        this.vignette = settings.get_boolean("vignette");
        this.radius = settings.get_double("radius");

        this.primaryIndex = this.layoutManager.primaryIndex;
    },

    _connectCallbacks: function() {
        // Settings changed listener
        this.setting_changed_connection = settings.connect("changed", Lang.bind(this, function(){
            let vignette_old = this.vignette;
            let animate_old = this.animate;
            let radius_old = this.radius;

            this._fetchSettings();

            // If vignette settings changed
            if(vignette_old != this.vignette) {
                this._injectJS(this.vignette);
            }

            if(!(radius_old == this.radius)) {
                this.panelEffect.remove_effect([this.panel_bg]);
                this.panelEffect.apply_effect([this.panel_bg]);
            }
            // If animation settings changed
            if(animate_old != this.animate) {
                // reset effect
                this._removeEffect(true);
                // disconnect callbacks
                this.view.disconnect(this.overview_hiding_connection);
                this.view.disconnect(this.overview_showing_connection);
                if(this.animate) {
                    // Overview showing listener
                    this.overview_showing_connection = this.view.connect("showing", Lang.bind(this, function(){
                        this._applyEffect();
                    }));
                    // Overview Hiding listener
                    this.overview_hiding_connection = this.view.connect("hiding", Lang.bind(this, function(){
                        this._removeEffect(false);
                    }));
                } else {
                    // Blur Overview in advance
                    this._applyEffect();
                    // Overview showing listener
                    this.overview_showing_connection = this.view.connect("showing", function(){});
                    // Overview Hidden listener
                    this.overview_hiding_connection = this.view.connect("hidden", function(){});
                }
            }
        }));

        Main.layoutManager.connect('monitors-changed', Lang.bind(this, function() {
            // TODO: Handle change in monitor setup
        }));

        // Regenerate blurred panel background when background on primary monitor is changed
        Main.layoutManager._bgManagers[this.primaryIndex].connect('changed', Lang.bind(this, function() {
            this._panelMagic();
        }));
        
        if(this.animate) {
            // Overview showing listener
            this.overview_showing_connection = this.view.connect("showing", Lang.bind(this, function(){
                this._applyEffect();
            }));
            // Overview Hiding listener
            this.overview_hiding_connection = this.view.connect("hiding", Lang.bind(this, function(){
                this._removeEffect(false);
            }));
        } else {
            // Blur Overview in advance
            this._applyEffect();
            // Overview showing listener
            this.overview_showing_connection = this.view.connect("showing", function(){});
            // Overview Hidden listener
            this.overview_hiding_connection = this.view.connect("hidden", function(){});
        }
    },

    _injectJS: function(flag) {
        if (flag) {
            this.view._shadeBackgrounds = function(){};
        } else {
            this.view._shadeBackgrounds = _shadeBackgrounds;
        }
    },

    _panelMagic: function() {
        this.panelEffect = new Effect.ShaderEffect();

        this.panelBox = Main.layoutManager.panelBox;
        this.backgrounds = this.layoutManager._backgroundGroup.get_children();
        this.primaryIndex = this.layoutManager.primaryIndex;

        this.primaryBackground = this.backgrounds[this.primaryIndex];

        this.bgContainer = new Clutter.Actor({
            width: this.primaryMonitor.width,
            height: 0,
            "z-position": -1 /* Needed to ensure proper positioning behind the panel */
        });

        // Clone primary background instance
        this.panel_bg = new Meta.BackgroundActor ({
            name: "panel_bg",
            background: this.primaryBackground["background"],
            "meta-screen": this.primaryBackground["meta-screen"],
            width: this.primaryMonitor.width,
            height: this.panelBox.height*4, /* Needed to reduce edge darkening caused by high blur radii */
            y: -1
        });

        this.panel_bg.set_clip(0, 0, this.primaryMonitor.width, this.panelBox.height)

        //this.panel_bg.set_size(this.primaryMonitor.width, this.panelBox.height);    
        this.panelEffect.apply_effect([this.panel_bg]);

        // Add the background texture to the background container
        this.bgContainer.add_actor(this.panel_bg);

        // Add the background container to the system panel box
        this.panelBox.add_actor(this.bgContainer);
    },

    _applyEffect: function() {
        this._fetchSettings();
        this.backgrounds = this.view._backgroundGroup.get_children();
        if(this.animate) {
            this.shaderEffect.animate_effect(this.backgrounds);
        } else {
            this.shaderEffect.apply_effect(this.backgrounds);
        }
    },

    _removeEffect: function(reset) {
        this._fetchSettings();
        this.backgrounds = this.view._backgroundGroup.get_children();
        if(reset) {
            this.shaderEffect.remove_effect(this.backgrounds);
        } else {
            if(this.animate) {
                this.shaderEffect.animate_effect(this.backgrounds);
            } else {
                this.shaderEffect.remove_effect(this.backgrounds);
            }
        }
    },

    _disable: function() {
        // Disconnect Callbacks
        this.view.disconnect(this.overview_showing_connection);
        this.view.disconnect(this.overview_hiding_connection);
        settings.disconnect(this.setting_changed_connection);

        // Reset UI to its original state
        this._removeEffect(true);
        this._injectJS(false);
        this.panelEffect.remove_effect([this.panel_bg]);
        this.panelBox.remove_child(this.bgContainer);
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