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

const Extension = ExtensionUtils.getCurrentExtension();
const Effect = Extension.imports.effect;
const Shared = Extension.imports.shared;

const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

// BlyrExtension instance
let blyrExtension;

// Make a "backup" copy of gnome-shell functions
const _shadeBackgrounds = Main.overview._shadeBackgrounds;

const Blyr = new Lang.Class({
    Name: 'Blyr',

    _init: function(params) {
        this.shaderEffect = new Effect.ShaderEffect();
        this.view = Main.overview;

        this._fetchSettings();
        this._injectJS(this.vignette);
        this._connectCallbacks();
    },

    _fetchSettings: function() {
        this.animate = settings.get_boolean("animate");
        this.vignette = settings.get_boolean("vignette");
    },

    _connectCallbacks: function() {
        // Settings changed listener
        this.setting_changed_connection = settings.connect("changed", Lang.bind(this, function(){
            let vignette_old = this.vignette;
            let animate_old = this.animate;
            this._fetchSettings();

            // If vignette settings changed
            if(vignette_old != this.vignette) {
                this._injectJS(this.vignette);
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

//Main.layoutManager.disconnect(monitor_changed_connection);
//this._removeFromPanel();

//this.panel = Main.panel;
        //this.panelActor = Panel.actor;
        //this.leftBox = Panel._leftBox;
        //this.panelBox = Main.layoutManager.panelBox;

//let color = Clutter.color_from_string("#ff0000");

// Get extension path
/*
path = Extension.dir.get_child('assets').get_path();
bg = new Clutter.Texture({
    filename: path + '/kingscanyon.png',
    width: 1920,
    height: 24
});

bg_actor = new Shell.GenericContainer({
    name: 'panel-bg',
    reactive: true,
    width: 1920,
    "z-position": -99
});
bg_actor = new Clutter.Actor({
    reactive: true,
    width: 1920,
    height: 32,
    "margin-left": 0,
    "margin-top": 0,
    "margin-right": 0,
    "z-position": -99.9
});

bg_actor.add_actor(bg);

panelBox.add_actor(bg_actor);
//panelActor.add_actor(bg_actor);
//Panel._updatePanel();

bg_actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
*/

/*
        monitor_changed_connection = Main.layoutManager.connect('monitors-changed', function(){
            this._overviewInject(vignette);
            // TODO: reset Effects to delete effect array?
        });
        */
/*
        _applyToPanel: function() {
        this.panelActor.add_effect_with_name("BLUR", new Clutter.BlurEffect());
    },

    _removeFromPanel: function() {
        this.panelActor.remove_effect_by_name("BLUR");
    },


    _getPreferredWidth: function(actor, forHeight, alloc) {
        let primaryMonitor = Main.layoutManager.primaryMonitor;

        alloc.min_size = -1;

        if (primaryMonitor)
            alloc.natural_size = primaryMonitor.width;
        else
            alloc.natural_size = -1;
    },

    */