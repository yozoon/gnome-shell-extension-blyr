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
 
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const GtkClutter = imports.gi.GtkClutter;
const ExtensionUtils = imports.misc.extensionUtils;

const Lang = imports.lang;

const Extension = ExtensionUtils.getCurrentExtension();
const Shared = Extension.imports.shared;
const Effect = Extension.imports.effect;
const Mainloop = imports.mainloop;

const Convenience = Extension.imports.convenience;
const Gettext = imports.gettext.domain('blyr');
const _ = Gettext.gettext;

const UPDATE_TIMEOUT = 500;

const BlyrPrefsWidget = new Lang.Class ({
    Name: 'BlyrPrefsWidget',
    Extends: Gtk.Grid,
    _init: function() {
        this.parent({
            margin: 15, 
            row_spacing : 15,
            vexpand : false
        });
        this._settings = Shared.getSettings(Shared.SCHEMA_NAME, 
            Extension.dir.get_child('schemas').get_path());
        this.shaderEffect = new Effect.ShaderEffect();
        this._get_settings();
        this._buildUI();
        this._init_callbacks();
    },
    _get_settings: function() {
        this.radius = this._settings.get_double("radius");
        this.brightness = this._settings.get_double("brightness");
        this.vignette = this._settings.get_boolean("vignette");
        this.dim = this._settings.get_boolean("dim");
        this.animate = this._settings.get_boolean("animate");
    },
    _buildUI: function() {
        //------------------------------------------------------------------------//
        // Blur label
        let blur_label = new Gtk.Label({
            halign : Gtk.Align.START
        });
        blur_label.set_markup("<b>"+_("Blur Radius")+"</b>");

        // Blur slider
        this.blur_slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL,
            1.0,29.9,0.1);
        this.blur_slider.set_value(this.radius);

        //------------------------------------------------------------------------//
        // Effect Preview
        this.eventbox = new Gtk.EventBox();
        let embed = new GtkClutter.Embed();
        embed.set_size_request(600, 150);
        this.eventbox.add(embed);

        // Get extension path
        let path = Extension.dir.get_child('assets').get_path();

        // Create Clutter.Texture from image
        this.texture = [];
        this.texture[0] = new Clutter.Texture({
            filename: path + '/kingscanyon.png',
            width : 600
        });

        // Apply blur
        this.shaderEffect.apply_effect(this.texture);
        let stage = embed.get_stage();
        stage.add_child(this.texture[0]);

        //------------------------------------------------------------------------//
        // Vignette label
        let vignette_label = new Gtk.Label({
            halign : Gtk.Align.START
        });
        vignette_label.set_markup("<b>"+_("Disable Overview Vignette Effect")+"</b>");

        // Vignette switch
        this.vignette_sw = new Gtk.Switch({
            name : "Disable Overview Vignette Effect",
            active : this._settings.get_boolean("vignette"),
            halign : Gtk.Align.END,
            valign : Gtk.Align.START
        });

        //------------------------------------------------------------------------//
        // Dim label
        let dim_label = new Gtk.Label({
            halign : Gtk.Align.START
        });
        dim_label.set_markup("<b>"+_("Dim Overview background")+"</b>");

        // Dim switch
        this.dim_sw = new Gtk.Switch({
            name : "Dim Overview Background",
            active : this._settings.get_boolean("dim"),
            halign : Gtk.Align.END,
            valign : Gtk.Align.START
        });

        // Brightness label
        let brightness_label = new Gtk.Label({
            halign : Gtk.Align.START
        });
        brightness_label.set_markup("<b>"+_("Overview background brightness")+"</b>");
        
        // Brightness slider
        this.brightness_slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL,
            0.0,1.0,0.01);
        this.brightness_slider.set_value(this.brightness);

        //------------------------------------------------------------------------//

        // Animation label
        var animate_label = new Gtk.Label({
            halign : Gtk.Align.START
        });
        animate_label.set_markup(
            "<b>"+_("Animate Overview transition (experimental)")+"</b>");

        // Animation switch
        this.animate_sw = new Gtk.Switch({
            name : "Animate Overview transition",
            active : this._settings.get_boolean("animate"),
            halign : Gtk.Align.END,
            valign : Gtk.Align.START
        });

        //------------------------------------------------------------------------//
        // Attach UI elements to Grid
        // attach(actor, column, row, width(colums), height(rows))
        this.attach(blur_label, 0, 0, 1, 1);
        this.attach(this.blur_slider, 1, 0, 2, 1);
        this.attach(this.eventbox, 0, 1, 3, 1);
        this.attach(vignette_label, 0, 2, 2, 1);
        this.attach(this.vignette_sw, 2, 2, 1, 1);
        this.attach(dim_label, 0, 3, 2, 1);
        this.attach(this.dim_sw, 2, 3, 1, 1);
        this.attach(brightness_label, 0, 4, 2, 1);
        this.attach(this.brightness_slider, 1, 4, 2, 1);
        this.attach(animate_label, 0, 5, 2, 1);
        this.attach(this.animate_sw, 2, 5    , 1, 1);
    },
    _interaction: function(state) {
        switch(state) {
            case 0:
                // Get radius from scale
                this.radius = this.blur_slider.get_value();
                // Save current radius
                this._settings.set_double("radius", this.radius);
                break;
            case 1:
                this._settings.set_boolean("vignette", this.vignette_sw.active);
                break;
            case 2:
                this._settings.set_boolean("dim", this.dim_sw.active);
                break;
            case 3:
                // Get brightness from scale
                this.brightness = this.brightness_slider.get_value();
                // Save current radius
                this._settings.set_double("brightness", this.brightness);
                break;
            case 4:
                this._settings.set_boolean("animate", this.animate_sw.active);
                break;
            case 5:
                this.shaderEffect.animate_effect(this.texture);
                return;
        }

        // Update effect with new values
        this.shaderEffect.apply_effect(this.texture);
    },
    _init_callbacks: function() {
        this.blur_slider.connect('value-changed', Lang.bind(this, 
            function() {
                if (this.blur_timeout > 0)
                    Mainloop.source_remove(this.blur_timeout);

                // Delay updating so we don't get overrun by effect updates
                this.blur_timeout = Mainloop.timeout_add(UPDATE_TIMEOUT, Lang.bind(this, 
                    function() {
                        this._interaction(0);
                        return GLib.SOURCE_REMOVE;
                    }));
            }));
        this.vignette_sw.connect('notify::active', Lang.bind(this, 
            function() {
                this._interaction(1);
            }));
        this.dim_sw.connect('notify::active', Lang.bind(this, 
            function() {
                this._interaction(2);
            }));
        this.brightness_slider.connect('value-changed', Lang.bind(this, 
            function() {
                if (this.brightness_timeout > 0)
                    Mainloop.source_remove(this.brightness_timeout);
                // Delay updating so we don't get overrun by effect updates
                this.brightness_timeout = Mainloop.timeout_add(UPDATE_TIMEOUT, Lang.bind(this, 
                    function() {
                        this._interaction(3);
                        return GLib.SOURCE_REMOVE;
                    }));
            }));
        this.animate_sw.connect('notify::active', Lang.bind(this, 
            function() {
                this._interaction(4);
            }));
        this.eventbox.connect('button_press_event', Lang.bind(this, 
            function() {
                this._interaction(5);
            }));
    }
});

function init(){
    Convenience.initTranslations("blyr");
}

function buildPrefsWidget() {
    // Init GtkClutter and Clutter
    GtkClutter.init(null);
    Clutter.init(null);

    let PrefsWidget = new BlyrPrefsWidget();
    PrefsWidget.show_all();

    return PrefsWidget;
}