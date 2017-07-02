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
const animation_steps = 10;

const ShaderEffect = new Lang.Class({
    Name : 'ShaderEffect',

    _init : function() {
        this.SHADER = this._readFile(Extension.dir.get_path() 
            + "/shader.glsl").toString();
        this.radius = 10.0001;
        this.brightness = 0.999;
        this.dim = false;
        this.vfx = new Clutter.ShaderEffect({
            shader_type: Clutter.ShaderType.FRAGMENT_SHADER
        });
        this.hfx = new Clutter.ShaderEffect({
            shader_type: Clutter.ShaderType.FRAGMENT_SHADER
        });
        this.vfx.set_shader_source(this.SHADER);
        this.vfx.set_uniform_value('dir', 1.0);
        this.hfx.set_shader_source(this.SHADER);
        this.hfx.set_uniform_value('dir', 0.0);
        this.hpass_active = false;
        this.vpass_active = false;
    },

    applyShader : function(actor) {
        // Hacky trick to ensure radius is a float
        this.radius = settings.get_double('radius') + 0.0001;
        this.dim = settings.get_boolean('dim');
        if(this.dim) {
            this.brightness = settings.get_double('brightness') + 0.0001;
        } else {
            this.brightness = 0.999;
        }
        this.hpass_active = actor.get_effect('hpass');
        this.vpass_active = actor.get_effect('vpass');

        // Vertical Blur
        this.vfx.set_uniform_value('width', actor.get_width());
        this.vfx.set_uniform_value('height', actor.get_height());
        this.vfx.set_uniform_value('radius', this.radius);
        this.vfx.set_uniform_value('brightness', 0.999); // Do not dim first pass
        if(!this.vpass_active) {
            actor.add_effect_with_name('vpass', this.vfx);
        }
        // Horizontal Blur
        this.hfx.set_uniform_value('width', actor.get_width());
        this.hfx.set_uniform_value('height', actor.get_height());
        this.hfx.set_uniform_value('radius', this.radius);
        this.hfx.set_uniform_value('brightness', this.brightness);
        if(!this.hpass_active) {
            actor.add_effect_with_name('hpass', this.hfx);
        }
    },

    animateShader : function(actor) {
        this.hpass_active = actor.get_effect('hpass');
        this.vpass_active = actor.get_effect('vpass');

        this.radius = settings.get_double('radius') + 0.0001;
        this.dim = settings.get_boolean('dim');
        if(this.dim) {
            this.brightness = settings.get_double('brightness') + 0.0001;
        } else {
            this.brightness = 0.999;
        }

        let r, b, r_inc, b_inc, flag;

        r_inc = this.radius / animation_steps;
        b_inc = (1.0 - this.brightness) / animation_steps;

        if(this.hpass_active && this.vpass_active) {
            r = this.radius;
            b = this.brightness;
            flag = false;
        } else {
            r = 0.0;
            b = 0.9999;
            flag = true;
        }

        this.hfx.set_uniform_value('width', actor.get_width());
        this.hfx.set_uniform_value('height', actor.get_height());
        this.vfx.set_uniform_value('width', actor.get_width());
        this.vfx.set_uniform_value('height', actor.get_height());

        let hfx = this.hfx;
        let vfx = this.vfx;
        let count = 0;

        GLib.timeout_add(GLib.PRIORITY_HIGH, ANIMATION_TIME_MS / animation_steps, function() {
            if(flag) {
                if(count < animation_steps) {
                    if(actor.get_effect('vpass'))
                        actor.remove_effect_by_name('vpass');
                    if(actor.get_effect('hpass'))
                        actor.remove_effect_by_name('hpass');
                    hfx.set_uniform_value('radius', r + 0.0001);
                    // Do not dim first pass
                    hfx.set_uniform_value('brightness', 0.9999);
                    vfx.set_uniform_value('radius', r + 0.0001);
                    vfx.set_uniform_value('brightness', b + 0.0001);
                    if(!this.vpass_active) {
                        actor.add_effect_with_name('vpass', vfx);
                    }
                    if(!this.hpass_active) {
                        actor.add_effect_with_name('hpass', hfx);
                    }
                    r += r_inc;
                    b -= b_inc;
                    count++;
                    return true; // Repeat
                }
            } else {
                if(count < animation_steps) {
                    if(actor.get_effect('vpass'))
                        actor.remove_effect_by_name('vpass');
                    if(actor.get_effect('hpass'))
                        actor.remove_effect_by_name('hpass');
                    hfx.set_uniform_value('radius', r + 0.0001);
                    // Do not dim first pass
                    hfx.set_uniform_value('brightness', 0.9999);
                    vfx.set_uniform_value('radius', r + 0.0001);
                    vfx.set_uniform_value('brightness', b + 0.0001);
                    if(!this.vpass_active) {
                        actor.add_effect_with_name('vpass', vfx);
                    }
                    if(!this.hpass_active) {
                        actor.add_effect_with_name('hpass', hfx);
                    }
                    r -= r_inc;
                    b += b_inc;
                    count++;
                    return true; // Repeat
                }
                // Remove Effect when finished
                if(actor.get_effect('vpass'))
                    actor.remove_effect_by_name('vpass');
                if(actor.get_effect('hpass'))
                    actor.remove_effect_by_name('hpass');
            }
            return false; // Don't repeat
        }, null);
    },

    removeShader : function(actor) {
        this.hpass_active = actor.get_effect('hpass');
        this.vpass_active = actor.get_effect('vpass');
        // Remove Effects
        if(this.vpass_active)
            actor.remove_effect_by_name('vpass');
        if(this.hpass_active)
            actor.remove_effect_by_name('hpass');
    },

    // Source: https://stackoverflow.com/a/21146281
    _readFile : function(filename) {
        let input_file = Gio.file_new_for_path(filename);
        let size = input_file.query_info(
            "standard::size",
            Gio.FileQueryInfoFlags.NONE,
            null).get_size();
        let stream = input_file.open_readwrite(null).get_input_stream();
        let data = stream.read_bytes(size, null).get_data();
        stream.close(null);
        return data;
    }
});