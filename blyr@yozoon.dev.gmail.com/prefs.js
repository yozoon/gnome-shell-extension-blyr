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
const Clutter = imports.gi.Clutter;
const GtkClutter = imports.gi.GtkClutter;
const ExtensionUtils = imports.misc.extensionUtils;

const Extension = ExtensionUtils.getCurrentExtension();
const Shared = Extension.imports.shared;

const settings = Shared.getSettings(Shared.SCHEMA_NAME, 
    Extension.dir.get_child('schemas').get_path());

const Effect = Extension.imports.effect;

let animation;
let radius;
let brightness;
let shaderEffect;

let blurred = true;

function init(){
}

function buildPrefsWidget(){
    shaderEffect = new Effect.ShaderEffect();
    animation = new Clutter.Animation();

    radius = settings.get_double("radius");
    brightness = settings.get_double("brightness");

    // Init GtkClutter and Clutter
    GtkClutter.init(null, 0);
    Clutter.init(null, 0);

    var eventbox = new Gtk.EventBox();

    // Create Clutter GTK Widget
    var embed = new GtkClutter.Embed();
    embed.set_size_request(600, 150);

    eventbox.add(embed);

    // Create grid which contains the UI
    var grid = new Gtk.Grid({ 
        margin: 15, 
        row_spacing : 15,
        vexpand : false 
    });

    //------------------------------------------------------------------------//
    // Blur label
    var blur_label = new Gtk.Label({
        halign : Gtk.Align.START
    });
    blur_label.set_markup("<b>Blur Radius</b>");

    // Blur slider
    var blur_slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL,
        1.0,30.0,0.1);
    blur_slider.set_value(radius);

    //------------------------------------------------------------------------//
    // Vignette label
    var vignette_label = new Gtk.Label({
        halign : Gtk.Align.START
    });
    vignette_label.set_markup("<b>Disable Overview Vignette Effect</b>");

    // Vignette switch
    var vignette_sw = new Gtk.Switch({
        active : settings.get_boolean("vignette"),
        halign : Gtk.Align.END,
        valign : Gtk.Align.START
    });
    vignette_sw.name = "Disable Overview Vignette Effect";

    //------------------------------------------------------------------------//
    // Dim label
    var dim_label = new Gtk.Label({
        halign : Gtk.Align.START
    });
    dim_label.set_markup("<b>Dim Overview background</b>");

    // Dim switch
    var dim_sw = new Gtk.Switch({
        active : settings.get_boolean("dim"),
        halign : Gtk.Align.END,
        valign : Gtk.Align.START
    });
    dim_sw.name = "Dim Overview Background";

    // Brightness label
    var brightness_label = new Gtk.Label({
        halign : Gtk.Align.START
    });
    brightness_label.set_markup("<b>Overview background brightness</b>");
    
    // Brightness slider
    var brightness_slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL,
        0.0,1.0,0.01);
    brightness_slider.set_value(brightness);

    //------------------------------------------------------------------------//

    // Animation label
    var animate_label = new Gtk.Label({
        halign : Gtk.Align.START
    });
    animate_label.set_markup(
        "<b>Animate Overview transition (experimental)</b>");

    // Animation switch
    var animate_sw = new Gtk.Switch({
        active : settings.get_boolean("animate"),
        halign : Gtk.Align.END,
        valign : Gtk.Align.START
    });
    animate_sw.name = "Animate Overview transition";

    //------------------------------------------------------------------------//
    // Attach UI elements to Grid
    // attach(actor, column, row, width(colums), height(rows))
    grid.attach(blur_label, 0, 0, 1, 1);
    grid.attach(blur_slider, 1, 0, 2, 1);
    grid.attach(eventbox, 0, 1, 3, 1);
    grid.attach(vignette_label, 0, 2, 2, 1);
    grid.attach(vignette_sw, 2, 2, 1, 1);
    grid.attach(dim_label, 0, 3, 2, 1);
    grid.attach(dim_sw, 2, 3, 1, 1);
    grid.attach(brightness_label, 0, 4, 2, 1);
    grid.attach(brightness_slider, 1, 4, 2, 1);
    grid.attach(animate_label, 0, 5, 2, 1);
    grid.attach(animate_sw, 2, 5    , 1, 1);

    // Get extension path
    let path = Extension.dir.get_child('assets').get_path();

    // Create Clutter.Texture from image
    var texture = new Clutter.Texture({
        filename: path + '/kingscanyon.png',
        width : 600
    });

    // Apply blur
    shaderEffect.applyShader(texture);
    var stage = embed.get_stage();
    stage.add_child(texture);

    //shaderEffect.brightness = 1.0;

    grid.show_all();

    //------------------------------------------------------------------------//
    // Value changed callback
    blur_slider.connect('value-changed', function(widget) {
        // Get radius from scale
        radius = blur_slider.get_value();
        // Remove filter
        //shaderEffect.removeShader(texture);
        // Update filter with new value
        shaderEffect.applyShader(texture);
        // Save current radius
        settings.set_double("radius", radius);
    });

    eventbox.connect("button_press_event", function(widget) {
        log("clicked");
        shaderEffect.animateShader(texture);
    });

    vignette_sw.connect("notify::active", function(widget) {
        settings.set_boolean("vignette", widget.active);
    });

    dim_sw.connect("notify::active", function(widget) {
        settings.set_boolean("dim", widget.active);
        // Get brightness from scale
        brightness = brightness_slider.get_value();
        // Update filter with new value
        shaderEffect.applyShader(texture);
    });

    brightness_slider.connect('value-changed', function(widget) {
        // Get brightness from scale
        brightness = brightness_slider.get_value();
        // Save current radius
        settings.set_double("brightness", brightness);
        // Update filter with new value
        shaderEffect.applyShader(texture);
    });

    animate_sw.connect("notify::active", function(widget) {
        settings.set_boolean("animate", widget.active);
    });

    return grid;
}