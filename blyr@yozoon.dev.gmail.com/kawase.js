/**
 * Blyr effect class
 * Copyright © 2017-2019 Julius Piso, All rights reserved
 * This file is distributed under the same license as Blyr.
 **/
 
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const ExtensionUtils = imports.misc.extensionUtils;
const ByteArray = imports.byteArray;

const Extension = ExtensionUtils.getCurrentExtension();

// Source: https://stackoverflow.com/a/21146281
function readShaderFile(filename) {
    let input_file = Gio.file_new_for_path(filename);
    let size = input_file.query_info(
        "standard::size",
        Gio.FileQueryInfoFlags.NONE,
        null).get_size();
    let stream = input_file.read(null);
    let data = stream.read_bytes(size, null).get_data();
    stream.close(null);
    return ByteArray.toString(data);
}

var kawase_down_shader = readShaderFile(Extension.dir.get_path() 
                + "/kawase_down.glsl");
var kawase_up_shader = readShaderFile(Extension.dir.get_path() 
                + "/kawase_up.glsl");

var KawaseDown = GObject.registerClass(
    class KawaseDown extends Clutter.ShaderEffect {
        _init(width, height, ox, oy) {
            // Initialize the parent instance
            super._init({shader_type: Clutter.ShaderType.FRAGMENT_SHADER});
            this.set_shader_source(kawase_down_shader);

            print("ACTOR width: " + width + " height: " + height);

            // Store params
            this.width = width;
            this.height = height;
            this.ox = ox;
            this.oy = oy;
            this.hpx = 0.5/width;
            this.hpy = 0.5/height;

            // Set shader values
            this.set_uniform_value('offsetx', parseFloat(this.ox));
            this.set_uniform_value('offsety', parseFloat(this.oy));
            this.set_uniform_value('halfpixelx', parseFloat(this.hpx));
            this.set_uniform_value('halfpixely', parseFloat(this.hpy));
        }

        /*
        vfunc_get_paint_volume(paint_volume) {
            var cur_width = paint_volume.get_width();
            var cur_height = paint_volume.get_height();
            var origin = paint_volume.get_origin();
            // origin.x -= parseFloat(2.0*this.ox);
            // origin.y -= parseFloat(2.0*this.oy);
            // cur_width += parseFloat(4.0*this.ox);
            // cur_height += parseFloat(4.0*this.oy);

            origin.x = 0 - parseFloat(2.0*this.ox);
            origin.y = 0 - parseFloat(2.0*this.oy);
            cur_width = 1920 + parseFloat(4.0*this.ox);
            cur_height = 1080 + parseFloat(4.0*this.oy);

            paint_volume.set_origin(origin);
            paint_volume.set_width(cur_width);
            paint_volume.set_height(cur_height);
            return true;
        }
        */
    }
);

var KawaseUp = GObject.registerClass(
    class KawaseUp extends Clutter.ShaderEffect {
        _init(width, height, ox, oy) {
            // Initialize the parent instance
            super._init({shader_type: Clutter.ShaderType.FRAGMENT_SHADER});

            // Read shader and set it as source
            this.set_shader_source(kawase_up_shader);

            // Store params
            this.width = width;
            this.height = height;
            this.ox = ox;
            this.oy = oy;
            this.hpx = 0.5/width;
            this.hpy = 0.5/height;

            // Set shader values
            this.set_uniform_value('offsetx', parseFloat(this.ox));
            this.set_uniform_value('offsety', parseFloat(this.oy));
            this.set_uniform_value('halfpixelx', parseFloat(this.hpx));
            this.set_uniform_value('halfpixely', parseFloat(this.hpy));
        }

        /*
        vfunc_get_paint_volume(paint_volume) {
            var cur_width = paint_volume.get_width();
            var cur_height = paint_volume.get_height();
            var origin = paint_volume.get_origin();
            // origin.x -= parseFloat(2.0*this.ox);
            // origin.y -= parseFloat(2.0*this.oy);
            // cur_width += parseFloat(4.0*this.ox);
            // cur_height += parseFloat(4.0*this.oy);

            origin.x = 0 - parseFloat(2.0*this.ox);
            origin.y = 0 - parseFloat(2.0*this.oy);
            cur_width = 1920 + parseFloat(4.0*this.ox);
            cur_height = 1080 + parseFloat(4.0*this.oy);

            paint_volume.set_origin(origin);
            paint_volume.set_width(cur_width);
            paint_volume.set_height(cur_height);
            return true;
        }
        */
    }
);
