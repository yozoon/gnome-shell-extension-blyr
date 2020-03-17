/**
 * Blyr shared/utility functions
 * Copyright © 2017-2020 Julius Piso, All rights reserved
 * This file is distributed under the same license as Blyr.
 **/
 
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
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

// https://github.com/ubuntu/gnome-shell-extension-appindicator/blob/master/util.js

const connectSmart3A = function(src, signal, handler) {
    let id = src.connect(signal, handler)
  
    if (src.connect && (!(src instanceof GObject.Object) || GObject.signal_lookup('destroy', src))) {
        let destroy_id = src.connect('destroy', () => {
            src.disconnect(id)
            src.disconnect(destroy_id)
        })
    }
  }
  
  const connectSmart4A = function(src, signal, target, method) {
    if (typeof method === 'string')
        method = target[method].bind(target)
    if (typeof method === 'function')
        method = method.bind(target)
  
    let signal_id = src.connect(signal, method)
  
    // GObject classes might or might not have a destroy signal
    // JS Classes will not complain when connecting to non-existent signals
    let src_destroy_id = src.connect && (!(src instanceof GObject.Object) || GObject.signal_lookup('destroy', src)) ? src.connect('destroy', on_destroy) : 0
    let tgt_destroy_id = target.connect && (!(target instanceof GObject.Object) || GObject.signal_lookup('destroy', target)) ? target.connect('destroy', on_destroy) : 0
  
    function on_destroy() {
        src.disconnect(signal_id)
        if (src_destroy_id) src.disconnect(src_destroy_id)
        if (tgt_destroy_id) target.disconnect(tgt_destroy_id)
    }
  }
  
  /**
  * Connect signals to slots, and remove the connection when either source or
  * target are destroyed
  *
  * Usage:
  *      Util.connectSmart(srcOb, 'signal', tgtObj, 'handler')
  * or
  *      Util.connectSmart(srcOb, 'signal', () => { ... })
  */
  var connectSmart = function() {
    if (arguments.length == 4)
        return connectSmart4A.apply(null, arguments)
    else
        return connectSmart3A.apply(null, arguments)
  }