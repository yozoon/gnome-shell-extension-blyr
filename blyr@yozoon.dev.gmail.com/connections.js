/*
  This file was originally a part of AppIndicator/KStatusNotifierItem GNOME Shell extension
  (https://github.com/ubuntu/gnome-shell-extension-appindicator/) specifically the util.js file.

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 2 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

const GObject = imports.gi.GObject;

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
  *      Connections.connectSmart(srcOb, 'signal', tgtObj, 'handler')
  * or
  *      Connections.connectSmart(srcOb, 'signal', () => { ... })
  */
  var connectSmart = function() {
    if (arguments.length == 4)
        return connectSmart4A.apply(null, arguments)
    else
        return connectSmart3A.apply(null, arguments)
  }