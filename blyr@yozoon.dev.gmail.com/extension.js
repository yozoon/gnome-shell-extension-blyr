/**
 * Blyr main extension class
 * Copyright © 2017-2020 Julius Piso, All rights reserved
 * This file is distributed under the same license as Blyr.
 **/

const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;
const ExtensionUtils = imports.misc.extensionUtils;
const LoginManager = imports.misc.loginManager;

const Extension = ExtensionUtils.getCurrentExtension();
const Effect = Extension.imports.effect;
const Shared = Extension.imports.shared;
const settings = Shared.getSettings(Shared.SCHEMA_NAME,
    Extension.dir.get_child('schemas').get_path());

const eligibleForPanelBlur = Shared.isEligibleForPanelBlur();
const supportsNativeBlur = Shared.supportsNativeBlur();

// Make a "backup" copy of the gnome-shell functions we are going to overwrite
const _shadeBackgrounds = Main.overview._shadeBackgrounds;
const _unshadeBackgrounds = Main.overview._unshadeBackgrounds;

const OVERVIEW_CONTAINER_NAME = "blyr_overview_container";
const OVERVIEW_BACKGROUND_NAME = "blyr_overview_background";
const PANEL_CONTAINER_NAME = "blyr_panel_container";
const SHELL_BLUR_MODE_ACTOR = 0;

function log(msg) {
    if (settings.get_boolean('debug-logging')) {
        print("[Blyr] " + msg);
    }
}

class Blyr {
    constructor(params) {
        log("Starting Blyr extension...");

        // Get current mode
        this.mode = settings.get_int("mode");

        // Wallpaper settings
        this.gsettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });

        // Create variables
        this.pMonitor = Main.layoutManager.primaryMonitor;
        this.pIndex = Main.layoutManager.primaryIndex;
        this.bgManager = Main.layoutManager._bgManagers[this.pIndex];

        this.settings_connection = null;
        this.gsettings_connection = null;
        this.bg_connection = null;
        this.session_mode_connection = null;
        this.monitor_changed_connection = null;
        this.overview_showing_connection = null;
        this.overview_hiding_connection = null;


        // Override mode if we can't blur the panel background
        // Default to activities_only
        if (!eligibleForPanelBlur)
            this.mode = 2;

        // Modify shell using current parameters and settings.
        this._startup();

        // Connect the listeners
        this._connectListeners();
    }

    _startup() {
        switch (this.mode) {
            case 1: // panel_only
                // Apply panel blur
                this._createBlurredPanelActor();
                // Dim activities screen with brightness set from preferences
                this._overrideVignetteEffect();
                break;
            case 2: // activities_only
                // Disable vignette effect
                this._disableVignetteEffect();
                // Create overview background actors
                this._createBlurredOverviewActors();
                // Connect overview listeners
                this._connectOverviewListeners();
                break;
            case 3: // blur_both
                // Disable vignette effect
                this._disableVignetteEffect();
                // Apply panel blur
                this._createBlurredPanelActor();
                // activities_only
                this._createBlurredOverviewActors();
                // Connect overview listeners
                this._connectOverviewListeners();
                break;
        }
    }

    /***************************************************************
     *                       Listeners                             *
     ***************************************************************/
    _connectListeners() {
        this._disconnectListeners();

        log("_connectListeners");

        // Monitor information
        this.pMonitor = Main.layoutManager.primaryMonitor;
        this.pIndex = Main.layoutManager.primaryIndex;
        this.bgManager = Main.layoutManager._bgManagers[this.pIndex];

        // Settings changed listener
        this.settings_connection = settings.connect("changed",
            function () {
                if (eligibleForPanelBlur)
                    this._checkModeChange();

                // Store outdated settings
                let intensity_old = this.intensity;
                let activities_brightness_old = this.activities_brightness;
                let panel_brightness_old = this.panel_brightness;

                // Get current settings
                this.intensity = settings.get_double("intensity");
                this.activities_brightness = settings.get_double("activitiesbrightness");
                this.panel_brightness = settings.get_double("panelbrightness");

                // If either blur intensity, activities brightness or panel
                // brightness changed
                if (intensity_old != this.intensity ||
                    activities_brightness_old != this.activities_brightness ||
                    panel_brightness_old != this.panel_brightness) {
                    switch (this.mode) {
                        case 1:
                            // panel_only
                            this._updateBlurredPanelActor();
                            break;
                        case 2:
                            // activities_only
                            this._updateBlurredOverviewActors();
                            break;
                        case 3:
                            // blur_both
                            this._updateBlurredPanelActor();
                            this._updateBlurredOverviewActors();
                            break;
                    }
                }
            }.bind(this)
        );

        // listens to changes of the wallpaper url in gsettings
        this.gsettings_connection = this.gsettings.connect('changed::picture-uri',
            this._regenerateBlurredActors.bind(this));

        // listens to changed signal on bg manager (useful if the url of a 
        // wallpaper doesn't change, but the wallpaper itself changed)
        this.bg_connection = this.bgManager.connect('changed',
            this._regenerateBlurredActors.bind(this));

        // session mode listener used to recreate listeners in order to 
        // prevent unresponsive "orphan" listeners
        this.session_mode_connection = Main.sessionMode.connect('updated',
            this._connectListeners.bind(this));

        log("Session Mode: " + Main.sessionMode.currentMode);

        // Monitors changed listener
        this.monitor_connection = Main.layoutManager.connect('monitors-changed',
            function () {
                log("monitors changed");
                this._regenerateBlurredActors();
                this._connectListeners();
            }.bind(this));
    }

    _disconnectListeners() {
        log("_disconnectListeners");
        // Disconnect settings change connection
        if (this.settings_connection) {
            settings.disconnect(this.settings_connection);
            this.settings_connection = null;
        }
        // Disconnect gsettings change connection
        if (this.gsettings_connection) {
            this.gsettings.disconnect(this.gsettings_connection);
            this.gsettings_connection = null;
        }
        // Disconnect monitor changed connection
        if (this.monitor_connection) {
            Main.layoutManager.disconnect(this.monitor_connection);
            this.monitor_connection = null;
        }
        // Disconnect background change listener
        if (this.bg_connection) {
            this.bgManager.disconnect(this.bg_connection);
            this.bg_connection = null;
        }
        // Disconnect session mode listener
        if (this.session_mode_connection) {
            Main.sessionMode.disconnect(this.session_mode_connection);
            this.session_mode_connection = null;
        }
    }

    _connectOverviewListeners() {
        // Overview showing listener
        this.overview_showing_connection = Main.overview.connect("showing",
            function () {
                // Fade out the untouched overview background actors to reveal 
                // our copied actors.
                Main.overview._backgroundGroup.get_children().forEach(
                    function (actor) {
                        if (actor.is_realized() && actor["name"] != OVERVIEW_BACKGROUND_NAME)
                            this._fadeOut(actor);
                    }.bind(this));
            }.bind(this)
        );
        // Overview Hiding listener
        this.overview_hiding_connection = Main.overview.connect("hiding",
            function () {
                // Fade in the untouched overview background actors to cover 
                // our copied actors.
                Main.overview._backgroundGroup.get_children().forEach(
                    function (actor) {
                        if (actor.is_realized() && actor["name"] != OVERVIEW_BACKGROUND_NAME)
                            this._fadeIn(actor);
                    }.bind(this));
            }.bind(this)
        );
    }

    _disconnectOverviewListeners() {
        if (this.overview_showing_connection) {
            Main.overview.disconnect(this.overview_showing_connection);
            this.overview_showing_connection = null;
        }
        if (this.overview_hiding_connection) {
            Main.overview.disconnect(this.overview_hiding_connection);
            this.overview_hiding_connection = null;
        }
    }

    _checkModeChange() {
        // Get mode before the user changed the mode
        let oldmode = this.mode * 10;
        // Get mode after the user changed the mode
        this.mode = settings.get_int("mode");

        switch (oldmode + this.mode) {
            case 12:
                // The user switched from panel_only to activities_only
                // Remove panel blur
                this._removeBlurredActors(Main.layoutManager.panelBox, PANEL_CONTAINER_NAME);
                // Disable vignette effect
                this._disableVignetteEffect();
                // Generate overview background actors
                this._createBlurredOverviewActors();
                // Register overview showing/hiding callback
                this._connectOverviewListeners();
                break;
            case 13:
                // The user switched from panel_only to blur_both
                // Disable vignette effect
                this._disableVignetteEffect();
                // Generate overview background actors
                this._createBlurredOverviewActors();
                // Register overview showing/hiding callback
                this._connectOverviewListeners();
                break;
            case 21:
                // The user switched from activities_only to panel_only
                // Remove the blurred backgrounds
                this._removeBlurredActors(Main.overview._backgroundGroup, OVERVIEW_BACKGROUND_NAME);
                // Unregister overview showing/hiding callback
                this._disconnectOverviewListeners();
                // Restore the vignette Effect
                this._overrideVignetteEffect();
                // Apply panel blur
                this._createBlurredPanelActor();
                break;
            case 23:
                // The user switched from activities_only to blur_both
                // Apply blur to panel
                this._createBlurredPanelActor();
                break;
            case 31:
                // The user switched from blur_both to panel_only
                // Remove the blurred backgrounds
                this._removeBlurredActors(Main.overview._backgroundGroup, OVERVIEW_BACKGROUND_NAME);
                // Unregister overview showing/hiding callback
                this._disconnectOverviewListeners();
                // Restore the vignette Effect
                this._overrideVignetteEffect();
                break;
            case 32:
                // The user switched from blur_both to activities_only
                // Remove panel blur
                this._removeBlurredActors(Main.layoutManager.panelBox, PANEL_CONTAINER_NAME);
                break;
            default:
                break;
        }
    }

    _regenerateBlurredActors() {
        log('regenerate actors');
        // Delayed function call to let the old backgrounds fade out
        GLib.timeout_add(GLib.PRIORITY_LOW, 100,
            function () {
                switch (this.mode) {
                    case 1: // panel_only
                        // Recreate panel background blur actor
                        this._createBlurredPanelActor();
                        // Dim activities screen with brightness set from preferences
                        this._overrideVignetteEffect();
                        break;
                    case 2: // activities_only
                        // Disable vignette effect
                        this._disableVignetteEffect();
                        // Recreate overview background blur actors
                        this._createBlurredOverviewActors();
                        break;
                    case 3: // blur_both
                        // Recreate panel background blur actor
                        this._createBlurredPanelActor();
                        // Disable vignette effect
                        this._disableVignetteEffect();
                        // Recreate overview background blur actors
                        this._createBlurredOverviewActors();
                        break;
                }
                return GLib.SOURCE_REMOVE;
            }.bind(this)
        );
    }

    /***************************************************************
     *            Blur Effect and Animation Utilities              *
     ***************************************************************/
    _applyTwoPassBlur(actor, intensity, brightness=1.0) {
        if(supportsNativeBlur) {
            if (!actor.get_effect("blur")) {
                actor.add_effect_with_name("blur", new Shell.BlurEffect({
                    mode: SHELL_BLUR_MODE_ACTOR,
                    brightness: parseFloat(brightness),
                    sigma: parseFloat(intensity),
                }));
            }
        } else {
            if (!actor.get_effect("vertical_blur"))
                actor.add_effect_with_name("vertical_blur", new Effect.BlurEffect(
                    actor.width, actor.height, 0, intensity, brightness));
            if (!actor.get_effect("horizontal_blur"))
                actor.add_effect_with_name("horizontal_blur", new Effect.BlurEffect(
                    actor.width, actor.height, 1, intensity, brightness));
        }
    }

    _fadeIn(actor) {
        // Transition animation: change opacity to 255 (fully opaque)
        if (actor.ease_property == undefined) {
            Tweener.addTween(actor,
                {
                    opacity: 255,
                    time: Overview.SHADE_ANIMATION_TIME,
                    transition: 'easeOutQuad'
                });
        } else {
            actor.ease_property('opacity', 255, {
                duration: Overview.SHADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        }
    }

    _fadeOut(actor) {
        // Transition animation: change opacity to 0 (fully transparent)
        if (actor.ease_property == undefined) {
            Tweener.addTween(actor,
                {
                    opacity: 0,
                    time: Overview.SHADE_ANIMATION_TIME,
                    transition: 'easeOutQuad'
                });
        } else {
            actor.ease_property('opacity', 0, {
                duration: Overview.SHADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        }
    }

    /***************************************************************
     *                      Vignette Effect                        *
     ***************************************************************/
    _disableVignetteEffect() {
        log("disable vignette effect");
        // Remove the code responsible for the vignette effect
        Main.overview._shadeBackgrounds = function () { };
        Main.overview._unshadeBackgrounds = function () { };

        // Disable the vignette effect for each actor
        Main.overview._backgroundGroup.get_children().forEach(function (actor) {
            actor.vignette = false;
        }, null);
    }

    _overrideVignetteEffect() {
        // Inject a new function handling the shading of the activities background
        Main.overview._shadeBackgrounds = function () {
            Main.overview._backgroundGroup.get_children().forEach(function (actor) {
                this.activities_brightness = settings.get_double("activitiesbrightness");
                actor.vignette = true;
                actor.brightness = 1.0;
                actor["vignette_sharpness"] = 0;
                if (actor.ease_property == undefined) {
                    Tweener.addTween(actor,
                        {
                            brightness: this.activities_brightness,
                            time: Overview.SHADE_ANIMATION_TIME,
                            transition: 'easeOutQuad'
                        });
                } else {
                    actor.ease_property('brightness', this.activities_brightness, {
                        duration: Overview.SHADE_ANIMATION_TIME,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD
                    });
                }
            }, this)
        };

        // Inject a new function handling the unshading of the activities background
        Main.overview._unshadeBackgrounds = function () {
            Main.overview._backgroundGroup.get_children().forEach(function (actor) {
                this.activities_brightness = settings.get_double("activitiesbrightness");
                actor.vignette = true;
                actor.brightness = this.activities_brightness;
                actor["vignette_sharpness"] = 0;
                if (actor.ease_property == undefined) {
                    Tweener.addTween(actor,
                        {
                            brightness: 1.0,
                            time: Overview.SHADE_ANIMATION_TIME,
                            transition: 'easeOutQuad'
                        });
                } else {
                    actor.ease_property('brightness', 1.0, {
                        duration: Overview.SHADE_ANIMATION_TIME,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD
                    });
                }
            }, this)
        };
    }

    _restoreVignetteEffect() {
        // Reassign the code responsible for the vignette effect
        Main.overview._shadeBackgrounds = _shadeBackgrounds;
        Main.overview._unshadeBackgrounds = _unshadeBackgrounds;

        // Re-enable the vignette effect for each actor
        Main.overview._backgroundGroup.get_children().forEach(function (actor) {
            actor.vignette = true;
        }, null);
    }

    /***************************************************************
     *                    Overview Backgrounds                     *
     ***************************************************************/
    _createBlurredOverviewActors() {
        // Remove current blurred background actors
        this._removeBlurredActors(Main.overview._backgroundGroup, OVERVIEW_BACKGROUND_NAME);
        log("Creating blurred overview actors");

        // Update backgrounds to prevent ghost actors
        Main.overview._updateBackgrounds();

        // Get current activities background brighness and blur intensity value
        let activities_brightness = settings.get_double("activitiesbrightness");
        let intensity = settings.get_double("intensity");

        // Only create copies of background actors with full opacity
        // This is needed to prevent copying of actors which are currently beeing
        // removed by the background manager. We are receiving the change signal
        // before the fadeout animation is completed. Adding one of the actors
        // which are beeing phased out later causes issues as they appear as plane
        // white backgrounds instead of the actual image.
        Main.overview._backgroundGroup.get_children().forEach(
            function (bg) {
                if (bg.opacity == 255) {
                    bg.vignette = false;
                    bg.brightness = 1.0;

                    // Clone the background actor
                    let blurred_bg = new Meta.BackgroundActor({
                        name: OVERVIEW_BACKGROUND_NAME,
                        background: bg.background,
                        width: bg["width"],
                        height: bg["height"],
                        monitor: bg["monitor"],
                        x: bg["x"],
                        y: bg["y"],
                        reactive: true
                    });

                    // Apply blur effect
                    this._applyTwoPassBlur(blurred_bg, intensity, activities_brightness);
                    
                    // Add child to our modified BG actor
                    Main.overview._backgroundGroup.add_child(blurred_bg);
                    Main.overview._backgroundGroup.set_child_below_sibling(blurred_bg, bg);
                }
            }.bind(this)
        );
    }

    _updateBlurredOverviewActors() {
        // Get current activities background brighness and blur intensity value
        let activities_brightness = settings.get_double("activitiesbrightness");
        let intensity = settings.get_double("intensity");
        // Remove and reapply blur effect for each actor
        Main.overview._backgroundGroup.get_children().forEach(
                function (bg) {
                    if (bg["name"] == OVERVIEW_BACKGROUND_NAME) {
                        bg.clear_effects();
                        this._applyTwoPassBlur(bg, intensity, activities_brightness);
                    }
                }.bind(this)
        );
    }

    /***************************************************************
     *                     Panel Background                        *
     ***************************************************************/
    _createBlurredPanelActor() {
        // Remove current blurred panel bgs
        this._removeBlurredActors(Main.layoutManager.panelBox, PANEL_CONTAINER_NAME);
        log("Creating blurred panel actor");

        // Update backgrounds to prevent ghost actors
        Main.overview._updateBackgrounds();

        // Create list of backgrounds with full opacity
        let bgs = [];
        Main.overview._backgroundGroup.get_children().forEach(
            function (bg) {
                if (bg.opacity == 255 && bg.visible) {
                    bgs.push(bg);
                }
            }.bind(this));

        // Calculate index of primary background
        // Check wheter the global display object has a get_primary_display method
        if (global.display.get_primary_monitor == undefined) {
            var bgIndex = bgs.length - global.screen.get_primary_monitor() - 1;
        } else {
            var bgIndex = bgs.length - global.display.get_primary_monitor() - 1;
        }

        // Select primary background
        this.primaryBackground = bgs[bgIndex];

        // Clutter Actor with height 0 which will contain the actual blurred background
        this.panelContainer = new Clutter.Actor({
            name: PANEL_CONTAINER_NAME,
            width: this.pMonitor.width,
            height: 0
        });

        // Clone primary background instance (we need to clone it, not just 
        // assign it, so we can modify it without influencing the main 
        // desktop background)
        this.panel_bg = new Meta.BackgroundActor({
            background: this.primaryBackground["background"],
            monitor: this.primaryBackground["monitor"],
            width: Main.layoutManager.panelBox.width,
            /* Needed to reduce edge darkening caused by high blur intensities */
            height: Main.layoutManager.panelBox.height*2,
            x: 0,
            y: 0
        });

        // Only show one part of the panel background actor as large as the 
        // panel itself
        this.panel_bg.set_clip(0, 0, Main.layoutManager.panelBox.width,
            Main.layoutManager.panelBox.height);

        // Get current panel brightness and blur intensity value
        let panel_brightness = settings.get_double("panelbrightness");
        let intensity = settings.get_double("intensity");

        // Apply the blur effect to the panel background
        this._applyTwoPassBlur(this.panel_bg, intensity, panel_brightness);

        // Add the background texture to the background container
        this.panelContainer.add_actor(this.panel_bg);

        // Add the background container to the system panel box
        Main.layoutManager.panelBox.add_actor(this.panelContainer);
        Main.layoutManager.panelBox.set_child_at_index(this.panelContainer, 0);
    }

    _updateBlurredPanelActor() {
        this.panel_bg.clear_effects();
        let panel_brightness = settings.get_double("panelbrightness");
        let intensity = settings.get_double("intensity");
        this._applyTwoPassBlur(this.panel_bg, intensity, panel_brightness);
    }

    /***************************************************************
     *                   Restore Shell State                       *
     ***************************************************************/
    // TODO: Remove code duplication of _removePanelBlur and _removeOverviewBlur
    _removeBlurredActors(parent, name) {
        log("removing blurred actors with the name: " + name);
        parent.get_children().forEach(
            function (child) {
                if(child.name == name) {
                    parent.remove_child(child);
                    child.destroy();
                }
            }
        )
    }

    disable() {
        // Disconnect Listeners
        this._disconnectListeners();
        this._disconnectOverviewListeners();

        // Remove modified backgrounds
        this._removeBlurredActors(Main.layoutManager.panelBox, PANEL_CONTAINER_NAME);
        this._removeBlurredActors(Main.overview._backgroundGroup, OVERVIEW_BACKGROUND_NAME);

        // Restore vignette effect
        this._restoreVignetteEffect();
    }
}

var blyr;

function init() { }

function enable() {
    blyr = new Blyr();
}

function disable() {
    blyr.disable();
};
