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

const Extension = ExtensionUtils.getCurrentExtension();
const Effect = Extension.imports.effect;
const Shared = Extension.imports.shared;
const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

const _shadeBackgrounds = Main.overview._shadeBackgrounds;

let shaderEffect = new Effect.ShaderEffect();
let view = Main.overview;

let overview_showing_connection, overview_hiding_connection;
let setting_changed_connection;
let animate, vignette, backgrounds;

function init() {}

function enable() {
    // Fetch current settings
    animate = settings.get_boolean("animate");
    vignette = settings.get_boolean("vignette");

    overviewInject(vignette);

    // Settings changed listener
    setting_changed_connection = settings.connect("changed", function(){
        if(settings.get_boolean("vignette")) {
            overviewInject(true);
        } else {
            overviewInject(false);
        }

        // If vignette settings changed
        if(vignette != settings.get_boolean("vignette")) {
            vignette = settings.get_boolean("vignette");
            overviewInject(vignette);
        }

        // If animation settings changed
        if(animate != settings.get_boolean("animate")) {
            Main.overview.disconnect(overview_hiding_connection);
            animate = settings.get_boolean("animate");
            if(animate) {
                // Overview Hiding listener
                overview_hiding_connection = Main.overview.connect("hiding", 
                    function(){
                    removeEffect();
                });
            } else {
                // Overview Hidden listener
                overview_hiding_connection = Main.overview.connect("hidden", 
                    function(){
                    removeEffect();
                });
            }
        }
    });

    // Overview showing listener
    overview_showing_connection = Main.overview.connect("showing", function(){
        applyEffect();
    });
    
    if(animate) {
        // Overview Hiding listener
        overview_hiding_connection = Main.overview.connect("hiding", function(){
            removeEffect();
        });
    } else {
        // Overview Hidden listener
        overview_hiding_connection = Main.overview.connect("hidden", function(){
            removeEffect();
        });
    }
};

function disable () {
    Main.overview.disconnect(overview_showing_connection);
    Main.overview.disconnect(overview_hiding_connection);
    settings.disconnect(setting_changed_connection);
    removeEffect();
    overviewInject(false);
};

function overviewInject(flag){
    if (flag) {
        Main.overview._shadeBackgrounds = function(){};
    } else {
        Main.overview._shadeBackgrounds = _shadeBackgrounds;
    }
}

function applyEffect(){
    backgrounds = view._backgroundGroup.get_children();
    animate = settings.get_boolean("animate");

    if(animate) {
        for (let co=0; co<backgrounds.length; co++) {// Cycle through displays
            shaderEffect.animateShader(backgrounds[co]);
        }
    } else {
        for (let co=0; co<backgrounds.length; co++) {// Cycle through displays
            shaderEffect.applyShader(backgrounds[co]);
        }
    }
}

function removeEffect(){
    backgrounds = view._backgroundGroup.get_children();
    animate = settings.get_boolean("animate");

    if(animate) {
        for (let co=0; co<backgrounds.length; co++) {// Cycle through displays
            shaderEffect.animateShader(backgrounds[co]);
        }
    } else {
        for (let co=0; co<backgrounds.length; co++) {// Cycle through displays
            shaderEffect.removeShader(backgrounds[co]);
        }
    }
}
