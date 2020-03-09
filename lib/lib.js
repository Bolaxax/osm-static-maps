const fs = require('fs');
const Handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const path = require('path');
const child_process = require("child_process");

const files = {
  leafletjs: fs.readFileSync(require.resolve('leaflet/dist/leaflet.js'), 'utf8'),
  leafletcss: fs.readFileSync(require.resolve('leaflet/dist/leaflet.css'), 'utf8'),
  leafletpolylinedecorator: fs.readFileSync(require.resolve('leaflet-polylinedecorator/dist/leaflet.polylineDecorator.js'), 'utf8'),
  mapboxjs: fs.readFileSync(require.resolve('mapbox-gl/dist/mapbox-gl.js'), 'utf8'),
  mapboxcss: fs.readFileSync(require.resolve('mapbox-gl/dist/mapbox-gl.css'), 'utf8'),
  leafletmapboxjs: fs.readFileSync(require.resolve('mapbox-gl-leaflet/leaflet-mapbox-gl.js'), 'utf8'),
  markericonpng: new Buffer.from(fs.readFileSync(require.resolve('leaflet/dist/images/marker-icon.png')), 'binary').toString('base64'),
}
const templatestr = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
const template = Handlebars.compile(templatestr);

function replacefiles(str) {
  const ff = Object.entries(files)
  let res = str
  ff.reverse()
  ff.forEach(([k, v]) => res = res.replace(`//${k}//`, v))
  return res
}

module.exports = function(options, request_method = null) {
  return new Promise(function(resolve, reject) {
    options = options || {};
    options.geojson = options.geojson || '';
    options.height = options.height || 600;
    options.width = options.width || 800;
    options.center = options.center || '';
    options.zoom = options.zoom || '';
    options.maxZoom = options.maxZoom || (options.vectorserverUrl ? 20 : 17);
    options.attribution = options.attribution || 'osm-static-maps | © OpenStreetMap contributors';
    options.tileserverUrl = options.tileserverUrl || 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    options.vectorserverUrl = options.vectorserverUrl || '';
    options.vectorserverToken = options.vectorserverToken || 'no-token';
    options.imagemin = options.imagemin || false;
    options.oxipng = options.oxipng || false;
    options.arrows = options.arrows || false;
    options.scale = (options.scale && (typeof options.scale === 'string' ? options.scale : JSON.stringify(options.scale))) || false;
    options.markerIconOptions = (options.markerIconOptions && (typeof options.markerIconOptions === 'string' ? options.markerIconOptions : JSON.stringify(options.markerIconOptions))) || false;

    if (request_method === "POST") {
      options.geojson = JSON.stringify(options.geojson);
    }

    const html = replacefiles(template(options));

    if (options.renderToHtml) {
      return resolve(html);
    }

    (async () => {
      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      page.on('error', function (err) { reject(err.toString()) })
      page.on('pageerror', function (err) { reject(err.toString()) })
      page.on('console', function (msg, type) {
        if (msg.type === 'error') {
          reject(JSON.stringify(msg))
        }
      })
      await page.setViewport({
        width: Number(options.width),
        height: Number(options.height)
      });
      await page.setContent(html, { waitUntil: 'networkidle0' });

      let imageBinary = await page.screenshot({
        type: options.type || 'png',
        quality: options.type === 'jpeg' ? Number(options.quality || 100) : undefined,
        fullPage: true
      });

      if (options.imagemin) {
        const imagemin = require("imagemin");
        const imageminJpegtran = require("imagemin-jpegtran");
        const imageminOptipng = require("imagemin-optipng");
        const plugins = []
        if (options.type === 'jpeg') {
          plugins.push(imageminJpegtran());
        } else {
          plugins.push(imageminOptipng());
        }
        (async () => {
          resolve(await imagemin.buffer(
            imageBinary,
            {
              plugins,
            }
          ))
        })();
      } else {
        if (options.oxipng) {
          const child = child_process.spawn('/root/.cargo/bin/oxipng', ['-']);
          child.stdin.on('error', function() {});
          child.stdin.write(imageBinary);
          child.stdin.end();
          let newimg = [];
          child.stdout.on('data', data => newimg.push(data));
          child.on('close', () => resolve(Buffer.concat(newimg)));
          child.on('error', e => reject(e.toString()));
        } else {
          resolve(imageBinary);
        }
      }

      browser.close();

    })()
  });
};
