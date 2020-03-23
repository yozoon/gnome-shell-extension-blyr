/*
  This file is part of Blyr.
  Copyright © 2017-2020 Julius Piso

  Blyr is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 2 of the License, or
  (at your option) any later version.

  Blyr is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with Blyr.  If not, see <https://www.gnu.org/licenses/>.
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

const supportsNativeBlur = Shared.supportsNativeBlur();

const UPDATE_TIMEOUT = 500;

const BlyrPrefsWidget = new Lang.Class ({
    Name: 'BlyrPrefsWidget',
    Extends: Gtk.VBox,

    _init: function(showPreview) {
        this.parent();

        this.settings = Shared.getSettings(Shared.SCHEMA_NAME, 
            Extension.dir.get_child('schemas').get_path());

        this.showPreview = showPreview;
        this.intensity_timeout = 0;
        this.activities_brightness_timeout = 0;
        this.mode = this.settings.get_int("mode");
        this.intensity = this.settings.get_double("intensity");
        this.activities_brightness = this.settings.get_double("activitiesbrightness");
        this.panel_brightness = this.settings.get_double("panelbrightness");
        this.panel_brightness_timeout = null;

        this._buildUI();
    },

    _buildUI: function() {
        /*
        ** EFFECT PREVIEW
        */
        if(this.showPreview) {
            // Effect Preview
            this.previewBox = new Gtk.Box({ expand: false });
            let embed = new GtkClutter.Embed({ expand: false });
            embed.set_size_request(600, 150);

            // Get extension path
            let path = Extension.dir.get_child('assets').get_path();

            // Create Clutter.Texture from image
            this.texture = new Clutter.Texture({
                filename: path + '/kingscanyon.png',
                width : 600
            });

            // Apply blur
            this.vertical_blur = new Effect.BlurEffect(this.texture.width, this.texture.height, 0, this.intensity, this.activities_brightness);
            this.texture.add_effect_with_name('vertical_blur', this.vertical_blur);
            this.horizontal_blur = new Effect.BlurEffect(this.texture.width, this.texture.height, 1, this.intensity, this.activities_brightness);
            this.texture.add_effect_with_name('vertical_blur', this.horizontal_blur);

            // Add the clutter texture to the gtk embed
            embed.get_stage().add_child(this.texture);

            // Connect button press callback
            this.previewBox.connect('button_press_event', Lang.bind(this, this._previewClicked));

            this.previewBox.pack_start(embed, false, false, 0);
        }

        /*
        ** MODE SELECTOR
        */
        this.selectBox = new Gtk.HBox({ spacing: 8, margin: 8, homogeneous: true });

        // Select label
        this.select_label = new Gtk.Label({ halign : Gtk.Align.START });
        this.select_label.set_markup("<b>"+_("Apply Effect to")+"</b>");

        // Dropdown menu
        this.model = new Gtk.ListStore();
        this.model.set_column_types([GObject.TYPE_INT, GObject.TYPE_STRING]);

        this.combobox = new Gtk.ComboBox({model: this.model });
        let renderer = new Gtk.CellRendererText();
        this.combobox.pack_start(renderer, true);
        this.combobox.add_attribute(renderer, 'text', 1);

        this.model.set(this.model.append(), [0, 1], [1,_("Panel")]);
        this.model.set(this.model.append(), [0, 1], [2,_("Activities Screen")]);
        this.model.set(this.model.append(), [0, 1], [3,_("Activities + Panel")]);

        this.combobox.set_active(this.mode - 1); // I know... the problems of starting the index with 1
        
        // Connect changed callback
        this.combobox.connect('changed', Lang.bind(this, this._modeChanged));

        this.selectBox.pack_start(this.select_label, true, true, 0);
        this.selectBox.pack_start(this.combobox, true, true, 0);

        /*
        ** BLUR INTENSITY
        **/
        this.intensityBox = new Gtk.HBox({ spacing: 8, margin: 8, homogeneous: true });
        // Blur label
        let intensity_label = new Gtk.Label({ halign : Gtk.Align.START });
        intensity_label.set_markup("<b>"+_("Blur Intensity")+"</b>");

        // Blur slider
        this.intensity_slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 1.0, 29.9, 0.1);
        this.intensity_slider.set_value(this.intensity);

        // Connect value-changed callback
        this.intensity_slider.connect('value-changed', Lang.bind(this, this._intensityChanged));

        this.intensityBox.pack_start(intensity_label, true, true, 0);
        this.intensityBox.pack_start(this.intensity_slider, true, true, 0);

        /*
        ** ACTIVITIES BRIGHTNESS
        */
        this.activities_brightnessBox = new Gtk.HBox({ spacing: 8, margin: 8, homogeneous: true });

        // Brightness label
        let brightness_label = new Gtk.Label({ halign : Gtk.Align.START });
        brightness_label.set_markup("<b>"+_("Activities Background Brightness")+"</b>");
        
        // Brightness slider
        this.activities_brightness_slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.0, 1.0,0.01);
        this.activities_brightness_slider.set_value(this.activities_brightness);

        // Connect value-changed callback
        this.activities_brightness_slider.connect('value-changed', Lang.bind(this, this._activitiesBrightnessChanged));

        this.activities_brightnessBox.pack_start(brightness_label, true, true, 0);
        this.activities_brightnessBox.pack_start(this.activities_brightness_slider, true, true, 0);

        /*
        ** PANEL BRIGHTNESS
        */
        this.panelBrightnessBox = new Gtk.HBox({ spacing: 8, margin: 8, homogeneous: true });

        // Brightness label
        let panel_brightness_label = new Gtk.Label({ halign : Gtk.Align.START });
        panel_brightness_label.set_markup("<b>"+_("Panel Background Brightness")+"</b>");
        
        // Brightness slider
        this.panel_brightness_slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.0, 1.0,0.01);
        this.panel_brightness_slider.set_value(this.panel_brightness);

        // Connect value-changed callback
        this.panel_brightness_slider.connect('value-changed', Lang.bind(this, this._panelBrightnessChanged));

        this.panelBrightnessBox.pack_start(panel_brightness_label, true, true, 0);
        this.panelBrightnessBox.pack_start(this.panel_brightness_slider, true, true, 0);

        /*
        ** ATTACH WIDGETS TO PARENT
        */
        // Preview box
        if(this.showPreview)
            this.pack_start(this.previewBox, false, false, 0);

        // Mode selector
        this.pack_start(this.selectBox, false, false, 0);

        // Intensity slider
        this.pack_start(this.intensityBox, false, false, 0);

        // Brightness slider
        this.pack_start(this.activities_brightnessBox, false, false, 0);

        // Panel brightness slider
        this.pack_start(this.panelBrightnessBox, false, false, 0);
    },

    _previewClicked: function() {
        if(this.texture.has_effects()) {
            this.texture.clear_effects();
        } else {
            this.texture.add_effect_with_name('vertical_blur', this.vertical_blur);
            this.texture.add_effect_with_name('vertical_blur', this.horizontal_blur);
        }
    },

    _modeChanged: function() {
        let [success, iter] = this.combobox.get_active_iter();
        if (!success)
            return;
        this.mode = this.model.get_value(iter, 0);
        this.settings.set_int('mode', this.mode);
    },

    _intensityChanged: function() {
        if (this.intensity_timeout > 0)
            Mainloop.source_remove(this.intensity_timeout);

        // Delay updating so we don't get overrun by effect updates
        this.intensity_timeout = Mainloop.timeout_add(UPDATE_TIMEOUT, Lang.bind(this, 
            function() {
                // Get intensity from scale
                this.intensity = this.intensity_slider.get_value();
                // Save current intensity
                this.settings.set_double("intensity", this.intensity);
                // Apply effect if not applied
                if(!this.texture.has_effects())
                    this._previewClicked();
                // Update preview
                this._updatePreview();
                return GLib.SOURCE_REMOVE;
            }));
    },

    _activitiesBrightnessChanged: function() {
        if (this.activities_brightness_timeout > 0)
            Mainloop.source_remove(this.activities_brightness_timeout);
        // Delay updating so we don't get overrun by effect updates
        this.activities_brightness_timeout = Mainloop.timeout_add(UPDATE_TIMEOUT, Lang.bind(this, 
            function() {
                // Get brightness from scale
                this.activities_brightness = this.activities_brightness_slider.get_value();
                // Save current brightness
                this.settings.set_double("activitiesbrightness", this.activities_brightness);
                // Apply effect if not applied
                if(!this.texture.has_effects())
                    this._previewClicked();
                // Update preview
                this._updatePreview();
                return GLib.SOURCE_REMOVE;
            }));
    },

    _panelBrightnessChanged: function() {
        if (this.panel_brightness_timeout > 0)
            Mainloop.source_remove(this.panel_brightness_timeout);
        // Delay updating so we don't get overrun by effect updates
        this.panel_brightness_timeout = Mainloop.timeout_add(UPDATE_TIMEOUT, Lang.bind(this, 
            function() {
                // Get brightness from scale
                this.panel_brightness = this.panel_brightness_slider.get_value();
                // Save current brightness
                this.settings.set_double("panelbrightness", this.panel_brightness);
                return GLib.SOURCE_REMOVE;
            }));
    },

    _updatePreview: function() {
        if(this.showPreview) {
            // Update effects with new values
            this.vertical_blur.updateUniforms(this.intensity, this.activities_brightness);
            this.horizontal_blur.updateUniforms(this.intensity, this.activities_brightness);
        }
    }
});

function init(){
    Convenience.initTranslations("blyr");
}

function buildPrefsWidget() {
    var showPreview = false;

    // Try to initialise GtkClutter and Clutter which are required to show the blur preview. 
    // If this fails we will not generate the preview actor to keep all the main functionality 
    // of the preferences dialog accessible. 
    try {
        // Init GtkClutter and Clutter
        GtkClutter.init(null);
        Clutter.init(null);
        showPreview = true;
    } catch(err) {
        log("Clutter or GtkClutter init failed with the following " + err);
    }

    let PrefsWidget = new BlyrPrefsWidget(showPreview);
    PrefsWidget.show_all();

    return PrefsWidget;
}