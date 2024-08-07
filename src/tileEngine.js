import { getCanvas, getContext } from './core.js';
import { on } from './events.js';
import { clamp, getWorldRect } from './helpers.js';
import { removeFromArray } from './utils.js';

// @ifdef TILEENGINE_TILED

// Tiled uses the bits 32 and 31 to denote that a tile is
// flipped horizontally or vertically (respectively)
// @see https://doc.mapeditor.org/en/stable/reference/global-tile-ids/
let FLIPPED_HORIZONTALLY = 0x80000000;
let FLIPPED_VERTICALLY = 0x40000000;
// tile can be rotated also and use the bit 30 in conjunction
// with bit 32 or/and 31 to denote that
let FLIPPED_DIAGONALLY = 0x20000000;
// @endif

/**
 * Get the row from the y coordinate.
 * @private
 *
 * @param {Number} y - Y coordinate.
 * @param {Number} tileheight - Height of a single tile (in pixels).
 *
 * @return {Number}
 */
function getRow(y, tileheight) {
  return (y / tileheight) | 0;
}

/**
 * Get the col from the x coordinate.
 * @private
 *
 * @param {Number} x - X coordinate.
 * @param {Number} tilewidth - Width of a single tile (in pixels).
 *
 * @return {Number}
 */
function getCol(x, tilewidth) {
  return (x / tilewidth) | 0;
}

/**
 * A tile engine for managing and drawing tilesets.
 *
 * <figure>
 *   <a href="assets/imgs/mapPack_tilesheet.png">
 *     <img src="assets/imgs/mapPack_tilesheet.png" width="1088" height="768" alt="Tileset to create an overworld map in various seasons.">
 *   </a>
 *   <figcaption>Tileset image courtesy of <a href="https://kenney.nl/assets">Kenney</a>.</figcaption>
 * </figure>
 * @class TileEngine
 *
 * @param {Object} properties - Properties of the tile engine.
 * @param {Number} properties.width - Width of the tile map (in number of tiles).
 * @param {Number} properties.height - Height of the tile map (in number of tiles).
 * @param {Number} properties.tilewidth - Width of a single tile (in pixels).
 * @param {Number} properties.tileheight - Height of a single tile (in pixels).
 * @param {CanvasRenderingContext2D} [properties.context] - The context the tile engine should draw to. Defaults to [core.getContext()](api/core#getContext)
 *
 * @param {Object[]} properties.tilesets - Array of tileset objects.
 * @param {Number} properties.<tilesetN>.firstgid - First tile index of the tileset. The first tileset will have a firstgid of 1 as 0 represents an empty tile.
 * @param {String|HTMLImageElement} properties.<tilesetN>.image - Relative path to the HTMLImageElement or an HTMLImageElement. If passing a relative path, the image file must have been [loaded](api/assets#load) first.
 * @param {Number} [properties.<tilesetN>.spacing=0] - The amount of whitespace between each tile (in pixels).
 * @param {Number} [properties.<tilesetN>.margin=0] - The amount of whitespace border around the entire tileset image (in pixels).
 * @param {Number} [properties.<tilesetN>.tilewidth] - Width of the tileset (in pixels). Defaults to properties.tilewidth.
 * @param {Number} [properties.<tilesetN>.tileheight] - Height of the tileset (in pixels). Defaults to properties.tileheight.
 * @param {String} [properties.<tilesetN>.source] - Relative path to the source JSON file. The source JSON file must have been [loaded](api/assets#load) first.
 * @param {Number} [properties.<tilesetN>.columns] - Number of columns in the tileset image.
 *
 * @param {Object[]} properties.layers - Array of layer objects.
 * @param {String} properties.<layerN>.name - Unique name of the layer.
 * @param {Number[]} properties.<layerN>.data - 1D array of tile indices.
 * @param {Boolean} [properties.<layerN>.visible=true] - If the layer should be drawn or not.
 * @param {Number} [properties.<layerN>.opacity=1] - Percent opacity of the layer.
 */

/**
 * @docs docs/api_docs/tileEngine.js
 */
class TileEngine {
  constructor(properties = {}) {
    let {
      /**
       * The width of tile map (in tiles).
       * @memberof TileEngine
       * @property {Number} width
       */
      width,

      /**
       * The height of tile map (in tiles).
       * @memberof TileEngine
       * @property {Number} height
       */
      height,

      /**
       * The width a tile (in pixels).
       * @memberof TileEngine
       * @property {Number} tilewidth
       */
      tilewidth,

      /**
       * The height of a tile (in pixels).
       * @memberof TileEngine
       * @property {Number} tileheight
       */
      tileheight,

      /**
       * Array of all tilesets of the tile engine.
       * @memberof TileEngine
       * @property {Object[]} tilesets
       */
      tilesets

      /**
       * The context the tile engine will draw to.
       * @memberof TileEngine
       * @property {CanvasRenderingContext2D} context
       */
    } = properties;
    let mapwidth = width * tilewidth;
    let mapheight = height * tileheight;

    // create an off-screen canvas for pre-rendering the map
    // @see http://jsperf.com/render-vs-prerender
    let canvas = document.createElement('canvas');
    canvas.width = mapwidth;
    canvas.height = mapheight;

    // c = canvas, ctx = context
    this._c = canvas;
    this._ctx = canvas.getContext('2d');

    // @ifdef TILEENGINE_TILED
    // resolve linked files (source, image)
    tilesets.map(tileset => {
      // get the url of the Tiled JSON object (in this case, the
      // properties object)
      let { __k, location } = window;
      let url = (__k ? __k.dm.get(properties) : '') || location.href;

      let { source } = tileset;
      if (source) {
        // @ifdef DEBUG
        if (!__k) {
          throw Error(
            `You must use "load" or "loadData" to resolve tileset.source`
          );
        }
        // @endif

        let resolvedSorce = __k.d[__k.u(source, url)];

        // @ifdef DEBUG
        if (!resolvedSorce) {
          throw Error(
            `You must load the tileset source "${source}" before loading the tileset`
          );
        }
        // @endif

        Object.keys(resolvedSorce).map(key => {
          tileset[key] = resolvedSorce[key];
        });
      }

      let { image } = tileset;
      /* eslint-disable-next-line no-restricted-syntax */
      if ('' + image === image) {
        // @ifdef DEBUG
        if (!__k) {
          throw Error(
            `You must use "load" or "loadImage" to resolve tileset.image`
          );
        }
        // @endif

        let resolvedImage = __k.i[__k.u(image, url)];

        // @ifdef DEBUG
        if (!resolvedImage) {
          throw Error(
            `You must load the image "${image}" before loading the tileset`
          );
        }
        // @endif

        tileset.image = resolvedImage;
      }
    });
    // @endif

    // add all properties to the object, overriding any defaults
    Object.assign(this, {
      context: getContext(),
      layerMap: {},
      layerCanvases: {},

      /**
       * The width of the tile map (in pixels).
       * @memberof TileEngine
       * @property {Number} mapwidth
       */
      mapwidth,

      /**
       * The height of the tile map (in pixels).
       * @memberof TileEngine
       * @property {Number} mapheight
       */
      mapheight,

      // @ifdef TILEENGINE_CAMERA
      _sx: 0,
      _sy: 0,
      // o = objects
      _o: [],
      // @endif

      /**
       * Array of all layers of the tile engine.
       * @memberof TileEngine
       * @property {Object[]} layers
       */
      ...properties
    });

    // p = prerender
    if (this.context) {
      this._p();
    }

    on('init', () => {
      this.context ??= getContext();
      this._p();
    });
  }

  // @ifdef TILEENGINE_CAMERA
  /**
   * X coordinate of the tile map camera.
   * @memberof TileEngine
   * @property {Number} sx
   */
  get sx() {
    return this._sx;
  }

  /**
   * Y coordinate of the tile map camera.
   * @memberof TileEngine
   * @property {Number} sy
   */
  get sy() {
    return this._sy;
  }

  // when clipping an image, sx and sy must be within the image
  // region, otherwise. Firefox and Safari won't draw it.
  // @see http://stackoverflow.com/questions/19338032/canvas-indexsizeerror-index-or-size-is-negative-or-greater-than-the-allowed-a
  set sx(value) {
    let max = Math.max(0, this.mapwidth - getCanvas().width);
    this._sx = clamp(0, max, value);
  }

  set sy(value) {
    let max = Math.max(0, this.mapheight - getCanvas().height);
    this._sy = clamp(0, max, value);
  }

  set objects(value) {
    this.remove(this._o);
    this.add(value);
  }

  get objects() {
    return this._o;
  }

  /**
   * Add an object to the tile engine.
   * @memberof TileEngine
   * @function add
   *
   * @param {...(Object|Object[])[]} objects - Object to add to the tile engine. Can be a single object, an array of objects, or a comma-separated list of objects.
   */
  add(...objects) {
    objects.flat().map(object => {
      this._o.push(object);
      object.parent = this;
    });
  }

  /**
   * Remove an object from the tile engine.
   * @memberof TileEngine
   * @function remove
   *
   * @param {...(Object|Object[])[]} objects - Object to remove from the tile engine. Can be a single object, an array of objects, or a comma-separated list of objects.
   */
  remove(...objects) {
    objects.flat().map(object => {
      removeFromArray(this._o, object);
      object.parent = null;
    });
  }
  // @endif

  // @ifdef TILEENGINE_DYNAMIC
  /**
   * Set the tile at the specified layer using either x and y coordinates or row and column coordinates.
   *
   * ```js
   * import { TileEngine } from 'kontra';
   *
   * let tileEngine = TileEngine({
   *   tilewidth: 32,
   *   tileheight: 32,
   *   width: 4,
   *   height: 4,
   *   tilesets: [{
   *     // ...
   *   }],
   *   layers: [{
   *     name: 'collision',
   *     data: [ 0,0,0,0,
   *             0,1,4,0,
   *             0,2,5,0,
   *             0,0,0,0 ]
   *   }]
   * });
   *
   * tileEngine.setTileAtLayer('collision', {row: 2, col: 1}, 10);
   * tileEngine.tileAtLayer('collision', {row: 2, col: 1});  //=> 10
   * ```
   * @memberof TileEngine
   * @function setTileAtLayer
   *
   * @param {String} name - Name of the layer.
   * @param {{x: Number, y: Number}|{row: Number, col: Number}} position - Position of the tile in either {x, y} or {row, col} coordinates.
   * @param {Number} tile - Tile index to set.
   */
  setTileAtLayer(name, position, tile) {
    let { layerMap, tileheight, tilewidth, width } = this;
    let { row, col, x, y } = position;

    let tileRow = row ?? getRow(y, tileheight);
    let tileCol = col ?? getCol(x, tilewidth);

    if (layerMap[name]) {
      this._d = true;
      layerMap[name]._d = true;
      layerMap[name].data[tileRow * width + tileCol] = tile;
    }
  }

  /**
   * Set the data at the specified layer.
   *
   * ```js
   * import { TileEngine } from 'kontra';
   *
   * let tileEngine = TileEngine({
   *   tilewidth: 32,
   *   tileheight: 32,
   *   width: 2,
   *   height: 2,
   *   tilesets: [{
   *     // ...
   *   }],
   *   layers: [{
   *     name: 'collision',
   *     data: [ 0,1,
   *             2,3 ]
   *   }]
   * });
   *
   * tileEngine.setLayer('collision', [ 4,5,6,7]);
   * tileEngine.tileAtLayer('collision', {row: 0, col: 0});  //=> 4
   * tileEngine.tileAtLayer('collision', {row: 0, col: 1});  //=> 5
   * tileEngine.tileAtLayer('collision', {row: 1, col: 0});  //=> 6
   * tileEngine.tileAtLayer('collision', {row: 1, col: 1});  //=> 7
   * ```
   *
   * @memberof TileEngine
   * @function setLayer
   *
   * @param {String} name - Name of the layer.
   * @param {Number[]} data - 1D array of tile indices.
   */
  setLayer(name, data) {
    let { layerMap } = this;
    if (layerMap[name]) {
      this._d = true;
      layerMap[name]._d = true;
      layerMap[name].data = data;
    }
  }
  // @endif

  // @ifdef TILEENGINE_QUERY
  /**
   * Check if the object collides with the layer (shares a gird coordinate with any positive tile index in layers data). The object being checked must have the properties `x`, `y`, `width`, and `height` so that its position in the grid can be calculated. [Sprite](api/sprite) defines these properties for you.
   *
   * ```js
   * import { TileEngine, Sprite } from 'kontra';
   *
   * let tileEngine = TileEngine({
   *   tilewidth: 32,
   *   tileheight: 32,
   *   width: 4,
   *   height: 4,
   *   tilesets: [{
   *     // ...
   *   }],
   *   layers: [{
   *     name: 'collision',
   *     data: [ 0,0,0,0,
   *             0,1,4,0,
   *             0,2,5,0,
   *             0,0,0,0 ]
   *   }]
   * });
   *
   * let sprite = Sprite({
   *   x: 50,
   *   y: 20,
   *   width: 5,
   *   height: 5
   * });
   *
   * tileEngine.layerCollidesWith('collision', sprite);  //=> false
   *
   * sprite.y = 28;
   *
   * tileEngine.layerCollidesWith('collision', sprite);  //=> true
   * ```
   * @memberof TileEngine
   * @function layerCollidesWith
   *
   * @param {String} name - The name of the layer to check for collision.
   * @param {Object} object - Object to check collision against.
   *
   * @returns {Boolean} `true` if the object collides with a tile, `false` otherwise.
   */
  layerCollidesWith(name, object) {
    let { tilewidth, tileheight, layerMap } = this;
    let { x, y, width, height } = getWorldRect(object);

    let row = getRow(y, tileheight);
    let col = getCol(x, tilewidth);
    let endRow = getRow(y + height, tileheight);
    let endCol = getCol(x + width, tilewidth);

    let layer = layerMap[name];

    // check all tiles
    for (let r = row; r <= endRow; r++) {
      for (let c = col; c <= endCol; c++) {
        if (layer.data[c + r * this.width]) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the tile at the specified layer using either x and y coordinates or row and column coordinates.
   *
   * ```js
   * import { TileEngine } from 'kontra';
   *
   * let tileEngine = TileEngine({
   *   tilewidth: 32,
   *   tileheight: 32,
   *   width: 4,
   *   height: 4,
   *   tilesets: [{
   *     // ...
   *   }],
   *   layers: [{
   *     name: 'collision',
   *     data: [ 0,0,0,0,
   *             0,1,4,0,
   *             0,2,5,0,
   *             0,0,0,0 ]
   *   }]
   * });
   *
   * tileEngine.tileAtLayer('collision', {x: 50, y: 50});  //=> 1
   * tileEngine.tileAtLayer('collision', {row: 2, col: 1});  //=> 2
   * ```
   * @memberof TileEngine
   * @function tileAtLayer
   *
   * @param {String} name - Name of the layer.
   * @param {{x: Number, y: Number}|{row: Number, col: Number}} position - Position of the tile in either {x, y} or {row, col} coordinates.
   *
   * @returns {Number} The tile index. Will return `-1` if no layer exists by the provided name.
   */
  tileAtLayer(name, position) {
    let { layerMap, tileheight, tilewidth, width } = this;
    let { row, col, x, y } = position;

    let tileRow = row ?? getRow(y, tileheight);
    let tileCol = col ?? getCol(x, tilewidth);

    if (layerMap[name]) {
      return layerMap[name].data[tileRow * width + tileCol];
    }

    return -1;
  }
  // @endif

  /**
   * Render all visible layers.
   * @memberof TileEngine
   * @function render
   */
  render(_canvas = this._c, _renderObjects = true) {
    let { _d, context, sx = 0, sy = 0 } = this;

    if (_d) {
      this._p();
    }

    let { width, height } = getCanvas();
    let sWidth = Math.min(_canvas.width, width);
    let sHeight = Math.min(_canvas.height, height);

    context.drawImage(
      _canvas,
      sx,
      sy,
      sWidth,
      sHeight,
      0,
      0,
      sWidth,
      sHeight
    );

    // @ifdef TILEENGINE_CAMERA
    // draw objects
    if (_renderObjects) {
      context.save();

      // it's faster to only translate if one of the values is
      // non-zero rather than always translating
      // @see https://jsperf.com/translate-or-if-statement/2
      if (sx || sy) {
        context.translate(-sx, -sy);
      }

      this.objects.map(obj => obj.render && obj.render());

      context.restore();
    }
    // @endif
  }

  /**
   * Render a specific layer by name.
   * @memberof TileEngine
   * @function renderLayer
   *
   * @param {String} name - Name of the layer to render.
   */
  renderLayer(name) {
    let { layerCanvases, layerMap } = this;
    let layer = layerMap[name];
    let canvas = layerCanvases[name];
    let context = canvas?.getContext('2d');

    if (!canvas) {
      // cache the rendered layer so we can render it again without
      // redrawing all tiles
      let { mapwidth, mapheight } = this;
      canvas = document.createElement('canvas');
      context = canvas.getContext('2d');
      canvas.width = mapwidth;
      canvas.height = mapheight;

      layerCanvases[name] = canvas;
      this._r(layer, context);
    }

    // @ifdef TILEENGINE_DYNAMIC
    if (layer._d) {
      layer._d = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      this._r(layer, context);
    }
    // @endif

    this.render(canvas, false);
  }

  /**
   * Pre-render the tiles to make drawing fast.
   */
  _p() {
    let { _ctx, layers = [], layerMap } = this;

    // d = dirty
    this._d = false;

    layers.map(layer => {
      let { name, data, visible } = layer;
      layer._d = false;
      layerMap[name] = layer;

      if (data && visible != false) {
        this._r(layer, _ctx);
      }
    });
  }

  /**
   * Render a layer.
   *
   * @param {Object} layer - Layer data.
   * @param {Context} context - Context to draw layer to.
   */
  _r(layer, context) {
    let { opacity, data = [] } = layer;
    let { tilesets, width, tilewidth, tileheight } = this;

    context.save();
    context.globalAlpha = opacity;

    data.map((tile, index) => {
      // skip empty tiles (0)
      if (!tile) return;

      let flipped = 0;
      let rotated = 0;

      // @ifdef TILEENGINE_TILED
      // read flags
      let flippedHorizontal = tile & FLIPPED_HORIZONTALLY;
      let flippedVertical = tile & FLIPPED_VERTICALLY;
      let turnedClockwise = 0;
      let turnedAntiClockwise = 0;
      let flippedAndturnedClockwise = 0;
      let flippedAndturnedAntiClockwise = 0;
      let flippedDiagonally = 0;
      flipped = flippedHorizontal || flippedVertical;

      tile &= ~(FLIPPED_HORIZONTALLY | FLIPPED_VERTICALLY);

      flippedDiagonally = tile & FLIPPED_DIAGONALLY;
      // Identify tile rotation
      if (flippedDiagonally) {
        if (flippedHorizontal && flippedVertical) {
          flippedAndturnedClockwise = 1;
        } else if (flippedHorizontal) {
          turnedClockwise = 1;
        } else if (flippedVertical) {
          turnedAntiClockwise = 1;
        } else {
          flippedAndturnedAntiClockwise = 1;
        }
        rotated =
          turnedClockwise ||
          turnedAntiClockwise ||
          flippedAndturnedClockwise ||
          flippedAndturnedAntiClockwise;

        tile &= ~FLIPPED_DIAGONALLY;
      }
      // @endif

      // find the tileset the tile belongs to
      // assume tilesets are ordered by firstgid
      let tileset;
      for (let i = tilesets.length - 1; i >= 0; i--) {
        tileset = tilesets[i];

        if (tile / tileset.firstgid >= 1) {
          break;
        }
      }

      let {
        image,
        spacing = 0,
        margin = 0,
        firstgid,
        columns
      } = tileset;

      let offset = tile - firstgid;
      let cols = columns ?? (image.width / (tilewidth + spacing)) | 0;

      let x = (index % width) * tilewidth;
      let y = ((index / width) | 0) * tileheight;
      let sx = margin + (offset % cols) * (tilewidth + spacing);
      let sy =
        margin + ((offset / cols) | 0) * (tileheight + spacing);

      // @ifdef TILEENGINE_TILED
      if (rotated) {
        context.save();
        // Translate to the center of the tile
        context.translate(x + tilewidth / 2, y + tileheight / 2);
        if (turnedAntiClockwise || flippedAndturnedAntiClockwise) {
          // Rotate 90° anticlockwise
          context.rotate(-Math.PI / 2); // 90° in radians
        } else if (turnedClockwise || flippedAndturnedClockwise) {
          // Rotate 90° clockwise
          context.rotate(Math.PI / 2); // 90° in radians
        }
        if (
          flippedAndturnedClockwise ||
          flippedAndturnedAntiClockwise
        ) {
          // Then flip horizontally
          context.scale(-1, 1);
        }
        x = -tilewidth / 2;
        y = -tileheight / 2;
      } else if (flipped) {
        context.save();
        context.translate(
          x + (flippedHorizontal ? tilewidth : 0),
          y + (flippedVertical ? tileheight : 0)
        );
        context.scale(
          flippedHorizontal ? -1 : 1,
          flippedVertical ? -1 : 1
        );
        x = flipped ? 0 : x;
        y = flipped ? 0 : y;
      }
      // @endif

      context.drawImage(
        image,
        sx,
        sy,
        tilewidth,
        tileheight,
        x,
        y,
        tilewidth,
        tileheight
      );

      // @ifdef TILEENGINE_TILED
      if (flipped || rotated) {
        context.restore();
      }
      // @endif
    });

    context.restore();
  }
}

export default function factory() {
  return new TileEngine(...arguments);
}
export { TileEngine as TileEngineClass };
