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
const Connections = Extension.imports.connections;
const Settings = Shared.getSettings(Shared.SCHEMA_NAME,
    Extension.dir.get_child('schemas').get_path());

const GSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });

const supportsNativeBlur = Shared.supportsNativeBlur();

// Make a "backup" copy of the gnome-shell functions we are going to overwrite
const _shadeBackgrounds = Main.overview._shadeBackgrounds;
const _unshadeBackgrounds = Main.overview._unshadeBackgrounds;

const OVERVIEW_CONTAINER_NAME = 'blyr_overview_container';
const OVERVIEW_BACKGROUND_NAME = 'blyr_overview_background';
const PANEL_CONTAINER_NAME = 'blyr_panel_container';
const SHELL_BLUR_MODE_ACTOR = 0;

function log(msg) {
    if (Settings.get_boolean('debug-logging')) {
        print('[Blyr] ' + msg);
    }
}

class Blyr {
    constructor(params) {
        log('Starting extension...');

        // Start in specified mode
        this._enterMode();

        // Connect the listeners
        // Settings changed listeners
        Connections.connectSmart(Settings, 'changed::mode', this, '_enterMode');
        Connections.connectSmart(Settings, 'changed::intensity', () => {
            this._updateBlurredPanelActor();
            this._updateBlurredOverviewActors();
        });
        Connections.connectSmart(Settings, 'changed::panelbrightness', this, '_updateBlurredPanelActor');
        Connections.connectSmart(Settings, 'changed::activitiesbrightness', this, '_updateBlurredOverviewActors');

        // listens to changes of the wallpaper url in gsettings
        Connections.connectSmart(GSettings, 'changed::picture-uri', this, '_regenerateBlurredActors');

        // listens to changed signal on bg manager (useful if the url of a 
        // wallpaper doesn't change, but the wallpaper itself changed)
        Connections.connectSmart(Main.layoutManager._bgManagers[Main.layoutManager.primaryIndex],
            'changed', this, '_regenerateBlurredActors');

        // session mode listener
        //Connections.connectSmart(Main.sessionMode, 'updated', this, '_onSessionModeChange');

        // screensaver listener
        Connections.connectSmart(Main.screenShield, 'locked-changed', () => {
            // let's refresh the effect only if the screensaver is disabled
            if (!Main.screenShield.locked) {
                this._regenerateBlurredActors();
            }
        });

        Connections.connectSmart(Main.layoutManager, 'startup-complete', this, '_regenerateBlurredActors');

        // Monitors changed listener
        Connections.connectSmart(Main.layoutManager, 'monitors-changed', () => {
            if (!Main.screenShield.locked) {
                this._regenerateBlurredActors();
            }
        });
    }

    _enterMode() {
        let mode = Settings.get_int('mode');
        log('Entering mode: ' + mode);
        // Restore UI to initial state
        this.restore();
        if (mode == 1) { // Blur Panel only
            // Apply panel blur
            this._createBlurredPanelActor();
            // Dim activities screen with brightness set from preferences
            this._overrideVignetteEffect();
        } else if (mode == 2) { // Blur Activities only
            // Disable vignette effect
            this._disableVignetteEffect();
            // Create overview background actors
            this._createBlurredOverviewActors();
            // Connect overview listeners
            this._connectOverviewListeners();
        } else if (mode == 3) { // Blur Panel and Activities
            // Disable vignette effect
            this._disableVignetteEffect();
            // Apply panel blur
            this._createBlurredPanelActor();
            // activities_only
            this._createBlurredOverviewActors();
            // Connect overview listeners
            this._connectOverviewListeners();
        } else {
            log('Mode ' + mode + ' not defined');
        }
    }

    _regenerateBlurredActors() {
        if (this.regeneration_timeout)
            return;

        // Delayed function call to let the old backgrounds fade out
        this.regeneration_timeout = GLib.timeout_add(GLib.PRIORITY_LOW, 100,
            () => {
                log('regenerate actors');
                this._enterMode();
                this.regeneration_timeout = null;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    /***************************************************************
     *                       Listeners                             *
     ***************************************************************/
    _connectOverviewListeners() {
        // Overview showing listener
        this.overview_showing_connection = Main.overview.connect('showing',
            () => {
                // Fade out the untouched overview background actors to reveal 
                // our copied actors.
                Main.overview._backgroundGroup.get_children().forEach(
                    (actor) => {
                        if (actor.is_realized() && actor['name'] != OVERVIEW_BACKGROUND_NAME)
                            this._fadeOut(actor);
                    });
            }
        );
        // Overview Hiding listener
        this.overview_hiding_connection = Main.overview.connect('hiding',
            () => {
                // Fade in the untouched overview background actors to cover 
                // our copied actors.
                Main.overview._backgroundGroup.get_children().forEach(
                    (actor) => {
                        if (actor.is_realized() && actor['name'] != OVERVIEW_BACKGROUND_NAME)
                            this._fadeIn(actor);
                    });
            }
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

    /***************************************************************
     *            Blur Effect and Animation Utilities              *
     ***************************************************************/
    _applyTwoPassBlur(actor, intensity, brightness = 1.0) {
        if (supportsNativeBlur) {
            if (!actor.get_effect('blur')) {
                actor.add_effect_with_name('blur', new Shell.BlurEffect({
                    mode: SHELL_BLUR_MODE_ACTOR,
                    brightness: parseFloat(brightness),
                    sigma: parseFloat(intensity),
                }));
            }
        } else {
            if (!actor.get_effect('vertical_blur'))
                actor.add_effect_with_name('vertical_blur', new Effect.BlurEffect(
                    actor.width, actor.height, 0, intensity, brightness));
            if (!actor.get_effect('horizontal_blur'))
                actor.add_effect_with_name('horizontal_blur', new Effect.BlurEffect(
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
        log('disable vignette effect');
        // Remove the code responsible for the vignette effect
        Main.overview._shadeBackgrounds = function () { };
        Main.overview._unshadeBackgrounds = function () { };

        // Disable the vignette effect for each actor
        Main.overview._backgroundGroup.get_children().forEach((actor) => {
            actor.vignette = false;
        }, null);
    }

    _overrideVignetteEffect() {
        log('override vignette effect');
        // Inject a new function handling the shading of the activities background
        Main.overview._shadeBackgrounds = function () {
            Main.overview._backgroundGroup.get_children().forEach((actor) => {
                this.activities_brightness = Settings.get_double('activitiesbrightness');
                actor.vignette = true;
                actor.brightness = 1.0;
                actor['vignette_sharpness'] = 0;
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
            Main.overview._backgroundGroup.get_children().forEach((actor) => {
                this.activities_brightness = Settings.get_double('activitiesbrightness');
                actor.vignette = true;
                actor.brightness = this.activities_brightness;
                actor['vignette_sharpness'] = 0;
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
        Main.overview._backgroundGroup.get_children().forEach((actor) => {
            actor.vignette = true;
        }, null);
    }

    /***************************************************************
     *                    Overview Backgrounds                     *
     ***************************************************************/
    _createBlurredOverviewActors() {
        // Remove current blurred background actors
        this._removeBlurredActors(Main.overview._backgroundGroup, OVERVIEW_BACKGROUND_NAME);
        log('Creating blurred overview actors');

        // Update backgrounds to prevent ghost actors
        Main.overview._updateBackgrounds();

        // Get current activities background brighness and blur intensity value
        let activities_brightness = Settings.get_double('activitiesbrightness');
        let intensity = Settings.get_double('intensity');

        // Only create copies of background actors with full opacity
        // This is needed to prevent copying of actors which are currently beeing
        // removed by the background manager. We are receiving the change signal
        // before the fadeout animation is completed. Adding one of the actors
        // which are beeing phased out later causes issues as they appear as plane
        // white backgrounds instead of the actual image.
        Main.overview._backgroundGroup.get_children().forEach(
            (bg) => {
                if (bg.opacity == 255) {
                    bg.vignette = false;
                    bg.brightness = 1.0;

                    // Clone the background actor
                    let blurred_bg = new Meta.BackgroundActor({
                        name: OVERVIEW_BACKGROUND_NAME,
                        background: bg.background,
                        width: bg['width'],
                        height: bg['height'],
                        monitor: bg['monitor'],
                        x: bg['x'],
                        y: bg['y'],
                        reactive: true
                    });

                    // Apply blur effect
                    this._applyTwoPassBlur(blurred_bg, intensity, activities_brightness);

                    // Add child to our modified BG actor
                    Main.overview._backgroundGroup.add_child(blurred_bg);
                    Main.overview._backgroundGroup.set_child_below_sibling(blurred_bg, bg);
                }
            }
        );
    }

    _updateBlurredOverviewActors() {
        // Get current activities background brighness and blur intensity value
        let activities_brightness = Settings.get_double('activitiesbrightness');
        let intensity = Settings.get_double('intensity');
        // Remove and reapply blur effect for each actor
        Main.overview._backgroundGroup.get_children().forEach(
            (bg) => {
                if (bg['name'] == OVERVIEW_BACKGROUND_NAME) {
                    bg.clear_effects();
                    this._applyTwoPassBlur(bg, intensity, activities_brightness);
                }
            }
        );
    }

    /***************************************************************
     *                     Panel Background                        *
     ***************************************************************/
    _createBlurredPanelActor() {
        // Remove current blurred panel bgs
        this._removeBlurredActors(Main.layoutManager.panelBox, PANEL_CONTAINER_NAME);
        log('Creating blurred panel actor');

        // Update backgrounds to prevent ghost actors
        Main.overview._updateBackgrounds();

        // Create list of backgrounds with full opacity
        let bgs = [];
        Main.overview._backgroundGroup.get_children().forEach(
            (bg) => {
                if (bg.opacity == 255 && bg.visible) {
                    bgs.push(bg);
                }
            });

        // Calculate index of primary background
        // Check wheter the global display object has a get_primary_monitor method
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
            width: 0,
            height: 0
        });

        let [tpx, tpy] = Main.layoutManager.panelBox.get_transformed_position();

        // Clone primary background instance (we need to clone it, not just 
        // assign it, so we can modify it without influencing the main 
        // desktop background)
        this.panel_bg = new Meta.BackgroundActor({
            background: this.primaryBackground['background'],
            monitor: this.primaryBackground['monitor'],
            width: this.primaryBackground.width,
            height: this.primaryBackground.height,
            x: -1 * tpx,
            y: -1 * tpy
        });

        // Only show one part of the panel background actor as large as the 
        // panel itself
        this.panel_bg.set_clip(
            tpx,
            tpy,
            Main.layoutManager.panelBox.width,
            Main.layoutManager.panelBox.height);

        // Get current panel brightness and blur intensity value
        let panel_brightness = Settings.get_double('panelbrightness');
        let intensity = Settings.get_double('intensity');

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
        let panel_brightness = Settings.get_double('panelbrightness');
        let intensity = Settings.get_double('intensity');
        this._applyTwoPassBlur(this.panel_bg, intensity, panel_brightness);
    }

    /***************************************************************
     *                   Restore Shell State                       *
     ***************************************************************/
    _removeBlurredActors(parent, name) {
        log('removing blurred actors with the name: ' + name);
        parent.get_children().forEach(
            (child) => {
                if (child.name == name) {
                    parent.remove_child(child);
                    child.destroy();
                }
            }
        )
    }

    restore() {
        // Disconnect Listeners
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
    blyr.restore();
};
