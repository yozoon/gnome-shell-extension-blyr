/**
 * Blyr shared/utility functions
 * Copyright © 2017-2020 Julius Piso, All rights reserved
 * This file is distributed under the same license as Blyr.
 **/
 
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Config = imports.misc.config;

var SCHEMA_NAME = "org.gnome.shell.extensions.blyr";

function getSettings(schemaName, schemaDir) {
    // Extension installed in .local
    if (GLib.file_test(schemaDir + '/' + schemaName + ".gschema.xml", GLib.FileTest.EXISTS)) {
    	var schemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir,
                                  Gio.SettingsSchemaSource.get_default(),
                                  false);
    	var schema = schemaSource.lookup(schemaName, false);

        return new Gio.Settings({ settings_schema: schema });
    }
}

// Check Gnome shell version
function checkShellVersion() {
    let shell_array = Config.PACKAGE_VERSION.split(".");
    let shell_version = shell_array[0] + shell_array[1]; // Don't include subversions
    return shell_version;
}

function isEligibleForPanelBlur() {
	let shell_version = checkShellVersion();
	let eligible;
	if(shell_version >= 326) {
        eligible = true;
    } else {
        eligible = false;
    }
    return eligible;
}

function supportsNativeBlur() {
    let shell_version = checkShellVersion();
	let native;
	if(shell_version >= 336) {
        native = true;
    } else {
        native = false;
    }
    return native;
}