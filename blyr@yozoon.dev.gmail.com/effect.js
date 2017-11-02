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
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;


const ExtensionUtils = imports.misc.extensionUtils;

const Extension = ExtensionUtils.getCurrentExtension();
const Shared = Extension.imports.shared;

const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

const ANIMATION_TIME_MS = 200;
const ANIMATION_STEPS = 10;

const ShaderEffect = new Lang.Class({
    Name : 'ShaderEffect',

    _init : function() {
        this.SHADER = this._read_shader_file(Extension.dir.get_path() 
            + "/shader.glsl").toString();
        this.shader_effect = {};
        this._fetch_settings();
    },

    // Source: https://stackoverflow.com/a/21146281
    _read_shader_file : function(filename) {
        let input_file = Gio.file_new_for_path(filename);
        let size = input_file.query_info(
            "standard::size",
            Gio.FileQueryInfoFlags.NONE,
            null).get_size();
        let stream = input_file.read(null);
        let data = stream.read_bytes(size, null).get_data();
        stream.close(null);
        return data;
    },

    _fetch_settings : function() {
        // Hacky trick to ensure radius is a float
        this.radius = settings.get_double('radius') + 0.0001;
        this.dim = settings.get_boolean('dim');
        if(this.dim) {
            this.brightness = settings.get_double('brightness') + 0.0001;
        } else {
            this.brightness = 0.9999;
        }
    },

    _create_shaders : function(actors) {
        let effect;
        for(let i = 0; i < actors.length; i++) {
            // Create new Shader Effect if it doesn't already exists
            if(typeof this.shader_effect[i] == 'undefined') {
                // Create Shader
                this.shader_effect[i] = [
                    new Clutter.ShaderEffect({
                        shader_type: Clutter.ShaderType.FRAGMENT_SHADER
                    }),
                    new Clutter.ShaderEffect({
                        shader_type: Clutter.ShaderType.FRAGMENT_SHADER
                    })
                ];
                effect = this.shader_effect[i];
                // Horizontal Shader
                effect[0].set_shader_source(this.SHADER);
                effect[0].set_uniform_value('dir', 0.0);
                effect[0].set_uniform_value('width', actors[i].get_width());
                effect[0].set_uniform_value('height', actors[i].get_height());
                effect[0].set_uniform_value('radius', this.radius);
                effect[0].set_uniform_value('brightness', 0.9999); // Do not dim horizontal pass
                // Vertical Shader
                effect[1].set_shader_source(this.SHADER);
                effect[1].set_uniform_value('dir', 1.0);
                effect[1].set_uniform_value('width', actors[i].get_width());
                effect[1].set_uniform_value('height', actors[i].get_height());
                effect[1].set_uniform_value('radius', this.radius);
                if(actors[i].name == "panel_bg") { // Don't dim Panel background, because it already has a semi-transparent overlay
                    effect[1].set_uniform_value('brightness', 0.9999);
                } else {
                    effect[1].set_uniform_value('brightness', this.brightness);
                }
            } else {
                effect = this.shader_effect[i];
                // Horizontal Shader
                effect[0].set_uniform_value('width', actors[i].get_width());
                effect[0].set_uniform_value('height', actors[i].get_height());
                effect[0].set_uniform_value('radius', this.radius);
                // Vertical Shader
                effect[1].set_uniform_value('width', actors[i].get_width());
                effect[1].set_uniform_value('height', actors[i].get_height());
                effect[1].set_uniform_value('radius', this.radius);
                effect[1].set_uniform_value('brightness', this.brightness);
            }
        }
    },

    _apply_shaders : function(actors) {
        for(let i = 0; i < actors.length; i++) {
            // Apply Shader Effect
            if(!actors[i].get_effect("horizontal_blur"))
                actors[i].add_effect_with_name("horizontal_blur",this.shader_effect[i][0]);
            if(!actors[i].get_effect("vertical_blur"))
                actors[i].add_effect_with_name("vertical_blur", this.shader_effect[i][1]);
        }
    },

    _animate_shaders : function(actors) {
        let t_radius, t_brightness, flag, effect;
        let r_inc = this.radius / ANIMATION_STEPS;
        let b_inc = (1.0 - this.brightness) / ANIMATION_STEPS;

        // Test if the effect is applied on the primary display
        let effect_active = actors[0].get_effect('horizontal_blur') && actors[0].get_effect('vertical_blur');
        if(effect_active) {
            t_radius = this.radius;
            t_brightness = this.brightness;
            flag = false;
        } else {
            t_radius = 0.0;
            t_brightness = 0.9999;
            flag = true;
        }

        let shader_effect = this.shader_effect;
        let count = 0;

        for(let i = 0; i < actors.length; i++) {
            // Clear Effect
            if(actors[i].get_effect("horizontal_blur"))
                actors[i].remove_effect_by_name("horizontal_blur");
            if(actors[i].get_effect("vertical_blur"))
                actors[i].remove_effect_by_name("vertical_blur");
            // Update Shader Values
            shader_effect[i][0].set_uniform_value('radius', t_radius + 0.0001);
            shader_effect[i][0].set_uniform_value('brightness', 0.9999);
            shader_effect[i][1].set_uniform_value('radius', t_radius + 0.0001);
            shader_effect[i][1].set_uniform_value('brightness', t_brightness + 0.0001);
            // Add Effect
            if(!actors[i].get_effect("horizontal_blur"))
                actors[i].add_effect_with_name("horizontal_blur", shader_effect[i][0]);
            if(!actors[i].get_effect("vertical_blur"))
                actors[i].add_effect_with_name("vertical_blur", shader_effect[i][1]);
        }

        GLib.timeout_add(GLib.PRIORITY_HIGH, ANIMATION_TIME_MS / ANIMATION_STEPS, function() {
            if(flag) {
                if(count < ANIMATION_STEPS) {
                    for(let i = 0; i < actors.length; i++) {
                        // Update Shader Values
                        shader_effect[i][0].set_uniform_value('radius', t_radius + 0.0001);
                        shader_effect[i][0].set_uniform_value('brightness', 0.9999);
                        shader_effect[i][1].set_uniform_value('radius', t_radius + 0.0001);
                        shader_effect[i][1].set_uniform_value('brightness', t_brightness + 0.0001);
                    }

                    t_radius += r_inc;
                    t_brightness -= b_inc;
                    count++;
                    return true; // Repeat
                }
            } else {
                if(count < ANIMATION_STEPS) {
                    for(let i = 0; i < actors.length; i++) {
                        // Update Shader Values
                        shader_effect[i][0].set_uniform_value('radius', t_radius + 0.0001);
                        shader_effect[i][0].set_uniform_value('brightness', 0.9999);
                        shader_effect[i][1].set_uniform_value('radius', t_radius + 0.0001);
                        shader_effect[i][1].set_uniform_value('brightness', t_brightness + 0.0001);
                    }

                    t_radius -= r_inc;
                    t_brightness += b_inc;
                    count++;
                    return true; // Repeat
                }
                // Remove Effect when finished
                for(let i = 0; i < actors.length; i++) {
                    if(actors[i].get_effect("horizontal_blur"))
                        actors[i].remove_effect_by_name("horizontal_blur");
                    if(actors[i].get_effect("vertical_blur"))
                        actors[i].remove_effect_by_name("vertical_blur");
                }
            }
            return false; // Don't repeat
        });
    },

    apply_effect : function(actors) {
        this._fetch_settings();
        this._create_shaders(actors, false);
        this._apply_shaders(actors);
    },

    animate_effect : function(actors) {
        this._fetch_settings();
        this._create_shaders(actors);
        this._animate_shaders(actors);
    },

    remove_effect : function(actors) {
        for(let i = 0; i < actors.length; i++) {
            if(actors[i].get_effect("horizontal_blur"))
                actors[i].remove_effect_by_name("horizontal_blur");
            if(actors[i].get_effect("vertical_blur"))
                actors[i].remove_effect_by_name("vertical_blur");
        }
    }
});