const Path = require('path');
const { JavascriptWebpackConfig, CssWebpackConfig } = require('@silverstripe/webpack-config');

const PATHS = {
  MODULES: 'node_modules',
  FILES_PATH: '../',
  ROOT: Path.resolve(),
  SRC: Path.resolve('client/src'),
  DIST: Path.resolve('client/dist'),
};

const config = [
  // Main JS bundle
  new JavascriptWebpackConfig('js', PATHS, 'akqa/silverstripe-tree-field')
    .setEntry({
      bundle: `${PATHS.SRC}/bundles/bundle.js`,
    })
    .getConfig(),
  // sass to css
  new CssWebpackConfig('css', PATHS)
    .setEntry({
      bundle: `${PATHS.SRC}/styles/bundle.scss`,
    })
    .getConfig(),
];

// Use WEBPACK_CHILD=js or WEBPACK_CHILD=css to run a single child config
module.exports = (process.env.WEBPACK_CHILD)
  ? config.find((entry) => entry.name === process.env.WEBPACK_CHILD)
  : config;
