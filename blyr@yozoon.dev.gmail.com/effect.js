/**
 * Blyr effect class
 * Copyright © 2017-2020 Julius Piso, All rights reserved
 * This file is distributed under the same license as Blyr.
 **/

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const ExtensionUtils = imports.misc.extensionUtils;
const ByteArray = imports.byteArray;

const Extension = ExtensionUtils.getCurrentExtension();
const Shared = Extension.imports.shared;

const settings = Shared.getSettings(Shared.SCHEMA_NAME,
    Extension.dir.get_child('schemas').get_path());

// Source: https://stackoverflow.com/a/21146281
// Author: https://stackoverflow.com/users/2037383/abp
function readShaderFile(filename) {
    let input_file = Gio.file_new_for_path(filename);
    let size = input_file.query_info(
        "standard::size",
        Gio.FileQueryInfoFlags.NONE,
        null).get_size();
    let stream = input_file.read(null);
    let data = stream.read_bytes(size, null).get_data();
    stream.close(null);
    var content = ByteArray.toString(data);
    // Compatability check: if the first character is a "[" we assume that
    // the byte array conversion did not work the way we expected so we 
    // fall back to the previous array.toString() method
    if (content[0] == "[") {
        return data.toString();
    } else {
        return content;
    }
}

var BlurEffect = GObject.registerClass(
    class BlurEffect extends Clutter.ShaderEffect {
        _init(width, height, direction, intensity, brightness) {
            // Initialize the parent instance
            super._init({ shader_type: Clutter.ShaderType.FRAGMENT_SHADER });

            // Read shader and set it as source
            this.SHADER = readShaderFile(Extension.dir.get_path()
                + "/shader.glsl");
            this.set_shader_source(this.SHADER);

            // Store params
            this.direction = direction;
            this.width = width;
            this.height = height;
            this.intensity = intensity;
            this.brightness = brightness;

            // Set shader values
            this.set_uniform_value('dir', this.direction);
            this.set_uniform_value('width', this.width);
            this.set_uniform_value('height', this.height);
            this.set_uniform_value('radius', parseFloat(this.intensity));
            this.set_uniform_value('brightness', parseFloat(this.brightness));
        }

        updateUniforms(intensity, brightness) {
            this.set_uniform_value('radius', parseFloat(intensity));
            this.set_uniform_value('brightness', parseFloat(brightness));
        }
    }
);