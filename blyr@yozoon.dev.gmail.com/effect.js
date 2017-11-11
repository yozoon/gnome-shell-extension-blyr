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
const Tweener = imports.tweener.tweener;


const ExtensionUtils = imports.misc.extensionUtils;

const Extension = ExtensionUtils.getCurrentExtension();
const Shared = Extension.imports.shared;

const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

const ANIMATION_TIME_MS = 200;
const ANIMATION_STEPS = 10;

var BlurEffect = new Lang.Class({
    Name : 'BlurEffect',
    Extends: Clutter.ShaderEffect,

    _init: function(width, height, direction, intensity, brightness) {
        // Initialize the parent instance
        this.parent({shader_type: Clutter.ShaderType.FRAGMENT_SHADER});

        // Read shader and set it as source
        this.SHADER = this._readShaderFile(Extension.dir.get_path() 
            + "/shader.glsl");
        this.set_shader_source(this.SHADER);

        this.direction = direction;
        this.width = width;
        this.height = height;
        // Set shader values
        this.set_uniform_value('dir', this.direction);
        this.set_uniform_value('width', this.width);
        this.set_uniform_value('height', this.height);
        this.set_uniform_value('radius', intensity + 0.0001);
        this.set_uniform_value('brightness', brightness + 0.0001);

        return this;
    },

    updateUniforms: function(intensity, brightness) {
        this.set_uniform_value('dir', this.direction);
        this.set_uniform_value('width', this.width);
        this.set_uniform_value('height', this.height);
        this.set_uniform_value('radius', intensity + 0.0001);
        this.set_uniform_value('brightness', brightness + 0.0001);
    },

    // Source: https://stackoverflow.com/a/21146281
    _readShaderFile : function(filename) {
        let input_file = Gio.file_new_for_path(filename);
        let size = input_file.query_info(
            "standard::size",
            Gio.FileQueryInfoFlags.NONE,
            null).get_size();
        let stream = input_file.read(null);
        let data = stream.read_bytes(size, null).get_data();
        stream.close(null);
        return data.toString();
    },
});