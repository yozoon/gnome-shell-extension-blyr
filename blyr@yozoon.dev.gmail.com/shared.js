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
const GLib = imports.gi.GLib;
const Config = imports.misc.config;

var SCHEMA_NAME = "org.gnome.shell.extensions.blyr";

function getSettings(schemaName, schemaDir) {
    // Extension installed in .local
    if (GLib.file_test(schemaDir + '/' + schemaName + ".gschema.xml", GLib.FileTest.EXISTS)) {
    	var schemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir,
                                  Gio.SettingsSchemaSource.get_default(), false);
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
