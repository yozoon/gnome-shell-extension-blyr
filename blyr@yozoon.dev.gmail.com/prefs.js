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
const GObject = imports.gi.GObject;
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

const eligibleForPanelBlur = Shared.isEligibleForPanelBlur();

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
        this._get_settings();
        this._buildUI();
        this._init_callbacks();
    },

    _get_settings: function() {
        this.mode = this._settings.get_int("mode");
        this.intensity = this._settings.get_double("intensity");
        this.brightness = this._settings.get_double("brightness");
        this.dim = this._settings.get_boolean("dim");
    },

    _buildUI: function() {
        if(eligibleForPanelBlur) {
            //------------------------------------------------------------------------//
            // Select label
            this.select_label = new Gtk.Label({
                halign : Gtk.Align.START
            });
            this.select_label.set_markup("<b>"+_("Apply Effect to")+"</b>");

            // Dropdown menu
            this.listitems = ['activities', 'panel', 'both'];
            let model = new Gtk.ListStore();
            model.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);

            this.combobox = new Gtk.ComboBox({model: model});
            let renderer = new Gtk.CellRendererText();
            this.combobox.pack_start(renderer, true);
            this.combobox.add_attribute(renderer, 'text', 1);

            model.set(model.append(), [0, 1], [this.listitems[0],_("Panel")]);
            model.set(model.append(), [0, 1], [this.listitems[1],_("Activities Screen")]);
            model.set(model.append(), [0, 1], [this.listitems[2],_("Activities + Panel")]);

            this.combobox.set_active(this.mode - 1); // I know... the problems of starting the index with 1
            
            this.combobox.connect('changed', Lang.bind(this, function(entry) {
                let [success, iter] = this.combobox.get_active_iter();
                if (!success)
                    return;
                this.mode = this.listitems.indexOf(model.get_value(iter, 0)) + 1;
                log(this.mode);
                this._settings.set_int('mode', this.mode);
            }));
        }

        //------------------------------------------------------------------------//
        // Blur label
        let blur_label = new Gtk.Label({
            halign : Gtk.Align.START
        });
        blur_label.set_markup("<b>"+_("Blur intensity")+"</b>");

        // Blur slider
        this.blur_slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL,
            1.0,29.9,0.1);
        this.blur_slider.set_value(this.intensity);

        //------------------------------------------------------------------------//
        // Effect Preview
        this.eventbox = new Gtk.EventBox();
        let embed = new GtkClutter.Embed();
        embed.set_size_request(600, 150);
        this.eventbox.add(embed);

        // Get extension path
        let path = Extension.dir.get_child('assets').get_path();

        // Create Clutter.Texture from image
        this.texture = new Clutter.Texture({
            filename: path + '/kingscanyon.png',
            width : 600
        });

        // Apply blur
        this.vertical_blur = new Effect.BlurEffect(this.texture.width, this.texture.height, 0, this.intensity, this.brightness);
        this.horizontal_blur = new Effect.BlurEffect(this.texture.width, this.texture.height, 1, this.intensity, this.brightness);
        this.texture.add_effect_with_name('vertical_blur', this.vertical_blur);
        this.texture.add_effect_with_name('vertical_blur', this.horizontal_blur);
        let stage = embed.get_stage();
        stage.add_child(this.texture);

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
        // Attach UI elements to Grid
        // attach(actor, column, row, width(colums), height(rows))
        if(eligibleForPanelBlur) {
            this.attach(this.select_label, 0, 0, 1, 1);
            this.attach(this.combobox, 1, 0, 2, 1);
        }
        this.attach(blur_label, 0, 1, 1, 1);
        this.attach(this.blur_slider, 1, 1, 2, 1);
        this.attach(this.eventbox, 0, 2, 3, 1);
        this.attach(dim_label, 0, 4, 2, 1);
        this.attach(this.dim_sw, 2, 4, 1, 1);
        this.attach(brightness_label, 0, 5, 2, 1);
        this.attach(this.brightness_slider, 1, 5, 2, 1);
    },

    _interaction: function(state) {
        switch(state) {
            case 0:
                // Get intensity from scale
                this.intensity = this.blur_slider.get_value();
                // Save current intensity
                this._settings.set_double("intensity", this.intensity);
                break;
            case 2:
                this._settings.set_boolean("dim", this.dim_sw.active);
                if(this.dim_sw.active) {
                    this._settings.set_double("brightness", this.brightness);
                } else {
                    this._settings.set_double("brightness", 1.0);
                }
                break;
            case 3:
                // Get brightness from scale
                this.brightness = this.brightness_slider.get_value();
                // Save current brightness
                this._settings.set_double("brightness", this.brightness);
                break;
            case 5:
                if(this.texture.has_effects()) {
                    this.texture.clear_effects();
                } else {
                    this.texture.add_effect_with_name('vertical_blur', this.vertical_blur);
                    this.texture.add_effect_with_name('vertical_blur', this.horizontal_blur);
                }
                return;
        }

        // Update effects with new values
        this.vertical_blur.updateUniforms(this.intensity, this.brightness);
        this.horizontal_blur.updateUniforms(this.intensity, this.brightness);
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